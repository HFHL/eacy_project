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


class ExtractionFolderProjectMixin:
    async def submit_project_crf_folder_update(
        self,
        *,
        project_id: str,
        project_patient_id: str,
        requested_by: str | None = None,
        target_form_keys: list[str] | None = None,
        mode: str | None = None,
    ) -> dict[str, Any]:
        options = self._normalize_folder_update_options(target_form_keys=target_form_keys, mode=mode)
        from app.services.research_project_service import ResearchProjectConflictError, ResearchProjectNotFoundError, ResearchProjectService

        try:
            crf = await ResearchProjectService().get_project_crf(
                project_id=project_id,
                project_patient_id=project_patient_id,
                created_by=requested_by,
                owner_id=requested_by,
            )
        except ResearchProjectNotFoundError as error:
            raise ExtractionNotFoundError(str(error)) from error
        except ResearchProjectConflictError as error:
            raise ExtractionConflictError(str(error)) from error

        context = crf.get("context")
        schema_json = crf.get("schema")
        if context is None or not isinstance(schema_json, dict):
            raise ExtractionNotFoundError("Project CRF schema context not found")
        self._validate_target_form_keys_for_schema(
            schema_json=schema_json,
            target_form_keys=options.target_form_keys,
        )

        message = "任务已提交，正在规划项目 CRF 抽取任务"
        batch = await self.task_progress_service.create_batch(
            task_type=self._folder_batch_task_type(
                folder_task_type="project_crf_folder_extract",
                options=options,
            ),
            title=self._folder_batch_title(base_title="更新项目 CRF", options=options),
            scope_type="project_patient",
            project_id=project_id,
            project_patient_id=project_patient_id,
            patient_id=context.patient_id,
            requested_by=requested_by,
            message=message,
        )
        now = datetime.utcnow()
        batch.status = "running"
        batch.progress = 5
        batch.started_at = now
        batch.heartbeat_at = now
        batch.plan_json = {
            "planning": True,
            "options": {"mode": options.mode, "target_form_keys": options.target_form_keys or []},
            "source_tag": "project_crf_folder_update",
            "stats": {
                "documents_total": 0,
                "eligible_documents": 0,
                "planned_jobs": 0,
                "pending_documents": 0,
            },
        }
        await self.task_progress_service.batch_repository.save(batch)
        batch_id_value = batch.id
        patient_id = context.patient_id
        await session.commit()

        from app.workers.celery_app import MAINTENANCE_QUEUE, PROJECT_CRF_FOLDER_PLAN_TASK_NAME, celery_app

        try:
            celery_app.send_task(
                PROJECT_CRF_FOLDER_PLAN_TASK_NAME,
                kwargs={
                    "batch_id": batch_id_value,
                    "project_id": project_id,
                    "project_patient_id": project_patient_id,
                    "requested_by": requested_by,
                    "target_form_keys": options.target_form_keys,
                    "mode": options.mode,
                },
                queue=MAINTENANCE_QUEUE,
                routing_key=MAINTENANCE_QUEUE,
            )
        except Exception as error:
            failed_batch = await self.task_progress_service.batch_repository.get_by_id(batch_id_value)
            if failed_batch is not None:
                error_message = f"项目 CRF 抽取规划任务提交失败: {error}"
                failed_batch.status = "failed"
                failed_batch.progress = 100
                failed_batch.message = error_message
                failed_batch.error_message = error_message
                failed_batch.finished_at = datetime.utcnow()
                failed_batch.heartbeat_at = datetime.utcnow()
                await self.task_progress_service.batch_repository.save(failed_batch)
                await session.commit()
            raise ExtractionConflictError("Project CRF folder update planning task could not be queued") from error

        return {
            "batch_id": batch_id_value,
            "project_id": project_id,
            "project_patient_id": project_patient_id,
            "patient_id": patient_id,
            "documents_total": 0,
            "eligible_documents": 0,
            "already_extracted_documents": 0,
            "planned_documents": 0,
            "created_jobs": 0,
            "jobs": [],
            "submitted_jobs": 0,
            "completed_jobs": 0,
            "failed_jobs": 0,
            "skipped": [],
            "planning_submitted": True,
            "message": message,
        }

    async def update_project_crf_folder(
        self,
        *,
        project_id: str,
        project_patient_id: str,
        requested_by: str | None = None,
        target_form_keys: list[str] | None = None,
        mode: str | None = None,
        batch_id: str | None = None,
    ) -> dict[str, Any]:
        options = self._normalize_folder_update_options(target_form_keys=target_form_keys, mode=mode)
        from app.services.research_project_service import ResearchProjectConflictError, ResearchProjectNotFoundError, ResearchProjectService

        try:
            crf = await ResearchProjectService().get_project_crf(
                project_id=project_id,
                project_patient_id=project_patient_id,
                created_by=requested_by,
                owner_id=requested_by,
            )
        except ResearchProjectNotFoundError as error:
            raise ExtractionNotFoundError(str(error)) from error
        except ResearchProjectConflictError as error:
            raise ExtractionConflictError(str(error)) from error

        context = crf.get("context")
        schema_json = crf.get("schema")
        if context is None or not isinstance(schema_json, dict):
            raise ExtractionNotFoundError("Project CRF schema context not found")
        self._validate_target_form_keys_for_schema(
            schema_json=schema_json,
            target_form_keys=options.target_form_keys,
        )

        patient_id = context.patient_id
        task_type = self._folder_batch_task_type(
            folder_task_type="project_crf_folder_extract",
            options=options,
        )
        title = self._folder_batch_title(base_title="更新项目 CRF", options=options)
        if batch_id:
            batch = await self.task_progress_service.batch_repository.get_by_id(batch_id)
            if batch is None:
                raise ExtractionNotFoundError("Task batch not found")
            now = datetime.utcnow()
            batch.task_type = task_type
            batch.title = title
            batch.scope_type = "project_patient"
            batch.project_id = project_id
            batch.project_patient_id = project_patient_id
            batch.patient_id = patient_id
            batch.requested_by = requested_by or batch.requested_by
            batch.status = "running"
            batch.progress = max(int(batch.progress or 0), 5)
            batch.message = "正在规划项目 CRF 抽取任务"
            batch.error_message = None
            batch.started_at = batch.started_at or now
            batch.finished_at = None
            batch.heartbeat_at = now
            batch.plan_json = {
                **(batch.plan_json if isinstance(batch.plan_json, dict) else {}),
                "planning": True,
            }
            await self.task_progress_service.batch_repository.save(batch)
            await session.commit()
        else:
            batch = await self.task_progress_service.create_batch(
                task_type=task_type,
                title=title,
                scope_type="project_patient",
                project_id=project_id,
                project_patient_id=project_patient_id,
                patient_id=patient_id,
                requested_by=requested_by,
            )
        documents = await self.document_repository.list_by_patient(
            patient_id,
            limit=1000,
            uploaded_by=None,
        )
        eligible_documents = [document for document in documents if self._document_ready_for_extraction(document)]
        existing_jobs = await self.job_repository.list_by_patient_documents(
            patient_id=patient_id,
            document_ids=[document.id for document in eligible_documents],
        )
        existing_forms_by_document = self._existing_target_forms_by_document(
            existing_jobs,
            job_types={"project_crf"},
            project_id=project_id,
            project_patient_id=project_patient_id,
        )
        if options.target_form_keys or options.mode == "full":
            pending_documents = eligible_documents
            extracted_document_ids: set[str] = set()
            already_extracted_ids: set[str] = set()
        else:
            extracted_document_ids = self._existing_full_schema_document_ids(
                existing_jobs,
                job_types={"project_crf"},
                project_id=project_id,
                project_patient_id=project_patient_id,
            )
            pending_documents = [document for document in eligible_documents if str(document.id) not in extracted_document_ids]
            already_extracted_ids = set(extracted_document_ids)

        jobs: list[ExtractionJob] = []
        skipped: list[dict[str, str]] = []
        for document in pending_documents:
            plan_items = self._pending_plan_items_for_document(
                document=document,
                schema_json=schema_json,
                existing_forms_by_document=existing_forms_by_document,
                options=options,
                source_tag="project_crf_folder_update",
                source_roles={"primary", "secondary"},
            )
            if not plan_items:
                skipped.append({"document_id": document.id, "reason": "no matching extraction target"})
                continue
            jobs.extend(
                await self._create_pending_planned_jobs_for_plan_items(
                    plan_items,
                    job_type="project_crf",
                    requested_by=requested_by,
                    source="project_crf_targeted_extract" if options.target_form_keys else "project_crf_folder_update",
                    base_input_json={"enqueue_async": True},
                    priority=0,
                    patient_id=patient_id,
                    document_id=document.id,
                    project_id=project_id,
                    project_patient_id=project_patient_id,
                    context_id=context.id,
                    schema_version_id=context.schema_version_id,
                )
            )

        await self._persist_folder_batch_plan(
            batch_id=batch.id,
            options=options,
            schema_version_id=context.schema_version_id,
            schema_json=schema_json,
            source_tag="project_crf_folder_update",
            documents=documents,
            eligible_documents=eligible_documents,
            pending_documents=pending_documents,
            already_extracted_document_ids=already_extracted_ids,
            jobs=jobs,
            skipped=skipped,
            extra_stats={
                "project_id": project_id,
                "project_patient_id": project_patient_id,
            },
        )

        if jobs:
            if batch.patient_id is None:
                batch.patient_id = patient_id
                await self.task_progress_service.batch_repository.save(batch)
            await self._ensure_folder_batch_items_for_jobs(batch_id=batch.id, jobs=jobs)
            await self._commit_pending_jobs_before_enqueue()
            for job in jobs:
                await self._schedule_or_enqueue_extraction_task(job.id)
        else:
            if batch.patient_id is None:
                batch.patient_id = patient_id
                await self.task_progress_service.batch_repository.save(batch)
            await self.task_progress_service.aggregate_batch(batch.id)
            await session.commit()

        return {
            "batch_id": batch.id,
            "project_id": project_id,
            "project_patient_id": project_patient_id,
            "patient_id": patient_id,
            "documents_total": len(documents),
            "eligible_documents": len(eligible_documents),
            "already_extracted_documents": len(extracted_document_ids),
            "planned_documents": len(pending_documents),
            "created_jobs": len(jobs),
            "jobs": jobs,
            "submitted_jobs": len(jobs),
            "completed_jobs": 0,
            "failed_jobs": 0,
            "skipped": skipped,
        }
