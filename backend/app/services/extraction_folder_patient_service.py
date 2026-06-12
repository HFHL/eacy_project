from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from types import SimpleNamespace
from typing import Any

from sqlalchemy import text

from app.models import DataContext, Document, ExtractionJob, ExtractionRun, RecordInstance
from app.services import extraction_service_runtime
from app.services.evidence_location_resolver import (
    build_ocr_reading_units,
    evidence_location_is_trusted,
    flatten_reading_unit_corpus,
    resolve_evidence_locations,
)
from app.services.extraction_errors import (
    ExtractionCancelledError,
    ExtractionConflictError,
    ExtractionNotFoundError,
    ExtractionTargetValidationError,
)
from app.services.extraction_plan_trace import build_folder_plan_json, build_single_job_plan_json, document_trace_terms
from app.services.extraction_strategy import extraction_queue_for_job, job_uses_claude_code, with_default_extraction_strategy
from app.services.extraction_types import (
    TRANSIENT_EXTRACTION_ERRORS,
    FolderUpdateOptions,
    SharedDocumentExtractionState,
    _TRANSIENT_DB_ORIG_EXCEPTIONS,
)
from app.services.llm_call_logger import ERROR_TIMEOUT, classify_exception, flush_llm_call_logs
from app.services.record_instance_label import record_instance_label
from app.services.record_instance_merge import RecordInstanceMergeResolver
from app.services.schema_field_planner import plan_schema_fields
from core.config import config
from core.db import Transactional, session


class ExtractionFolderPatientMixin:
    async def update_patient_ehr_folder(
        self,
        *,
        patient_id: str,
        requested_by: str | None = None,
        target_form_keys: list[str] | None = None,
        mode: str | None = None,
    ) -> dict[str, Any]:
        options = self._normalize_folder_update_options(target_form_keys=target_form_keys, mode=mode)
        await self._ensure_patient_access(patient_id, requested_by)
        ehr = await self.ehr_service.get_patient_ehr(
            patient_id,
            created_by=requested_by,
            owner_id=requested_by,
        )
        context = ehr.get("context")
        schema_json = ehr.get("schema")
        if context is None or not isinstance(schema_json, dict):
            published_schema = await self.ehr_service.schema_service.get_latest_published("ehr")
            if published_schema is None:
                raise ExtractionNotFoundError(
                    "未找到已发布的电子病历 Schema，请先在 Schema 模板管理中导入并发布 EHR 模板"
                )
            raise ExtractionNotFoundError("无法初始化患者电子病历上下文，请刷新页面后重试")
        self._validate_target_form_keys_for_schema(
            schema_json=schema_json,
            target_form_keys=options.target_form_keys,
        )
        batch = await self.task_progress_service.create_batch(
            task_type=self._folder_batch_task_type(
                folder_task_type="patient_ehr_folder_extract",
                options=options,
            ),
            title=self._folder_batch_title(base_title="更新电子病历夹", options=options),
            scope_type="patient",
            patient_id=patient_id,
            requested_by=requested_by,
        )

        documents = await self.document_repository.list_by_patient(
            patient_id,
            limit=1000,
            uploaded_by=requested_by,
        )
        eligible_documents = [document for document in documents if self._document_ready_for_extraction(document)]
        existing_jobs = await self.job_repository.list_by_patient_documents(
            patient_id=patient_id,
            document_ids=[document.id for document in eligible_documents],
        )
        existing_forms_by_document = self._existing_target_forms_by_document(
            existing_jobs,
            job_types={"patient_ehr", "targeted_schema"},
        )
        if options.target_form_keys or options.mode == "full":
            pending_documents = eligible_documents
            already_extracted_documents = 0
            already_extracted_ids: set[str] = set()
        else:
            extracted_document_ids = {
                job.document_id
                for job in existing_jobs
                if job.job_type in {"patient_ehr", "targeted_schema"} and self._job_counts_as_existing_extraction(job)
            }
            pending_documents = [document for document in eligible_documents if document.id not in extracted_document_ids]
            already_extracted_documents = len(extracted_document_ids)
            already_extracted_ids = {str(document_id) for document_id in extracted_document_ids if document_id}

        jobs: list[ExtractionJob] = []
        skipped: list[dict[str, str]] = []
        for document in pending_documents:
            plan_items = self._pending_plan_items_for_document(
                document=document,
                schema_json=schema_json,
                existing_forms_by_document=existing_forms_by_document,
                options=options,
                source_tag="patient_ehr_folder_update",
            )
            if not plan_items:
                skipped.append({"document_id": document.id, "reason": "no primary source matched"})
                continue
            jobs.append(
                await self._create_pending_planned_job_for_plan_items(
                    plan_items,
                    job_type="targeted_schema",
                    requested_by=requested_by,
                    source="patient_ehr_folder_update",
                    priority=0,
                    patient_id=patient_id,
                    document_id=document.id,
                    context_id=context.id,
                    schema_version_id=context.schema_version_id,
                )
            )

        await self._persist_folder_batch_plan(
            batch_id=batch.id,
            options=options,
            schema_version_id=context.schema_version_id,
            schema_json=schema_json,
            source_tag="patient_ehr_folder_update",
            documents=documents,
            eligible_documents=eligible_documents,
            pending_documents=pending_documents,
            already_extracted_document_ids=already_extracted_ids,
            jobs=jobs,
            skipped=skipped,
        )

        if jobs:
            await self._ensure_folder_batch_items_for_jobs(batch_id=batch.id, jobs=jobs)
            await self._commit_pending_jobs_before_enqueue()
            for job in jobs:
                await self._schedule_or_enqueue_extraction_task(job.id)
        else:
            await self.task_progress_service.aggregate_batch(batch.id)
            await session.commit()

        return {
            "batch_id": batch.id,
            "patient_id": patient_id,
            "documents_total": len(documents),
            "eligible_documents": len(eligible_documents),
            "already_extracted_documents": already_extracted_documents,
            "planned_documents": len(pending_documents),
            "created_jobs": len(jobs),
            "jobs": jobs,
            "submitted_jobs": len(jobs),
            "completed_jobs": 0,
            "failed_jobs": 0,
            "skipped": skipped,
            "target_form_keys": options.target_form_keys or [],
            "mode": options.mode,
        }
