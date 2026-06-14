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


class ExtractionFolderHelpersMixin:
    def _normalize_folder_update_options(
        self,
        *,
        target_form_keys: list[str] | None = None,
        mode: str | None = None,
    ) -> FolderUpdateOptions:
        keys = [str(key).strip() for key in (target_form_keys or []) if str(key).strip()]
        return FolderUpdateOptions(
            target_form_keys=keys or None,
            mode=self._normalize_folder_update_mode(mode),
        )

    def _filter_plan_items_to_targets(
        self,
        plan_items: list[Any],
        target_form_keys: list[str] | None,
    ) -> list[Any]:
        if not target_form_keys:
            return plan_items
        allowed = set(target_form_keys)
        return [item for item in plan_items if item.target_form_key in allowed]

    def _existing_target_forms_by_document(
        self,
        existing_jobs: list[ExtractionJob],
        *,
        job_types: set[str],
        project_id: str | None = None,
        project_patient_id: str | None = None,
    ) -> dict[str, set[str]]:
        forms_by_document: dict[str, set[str]] = {}
        for job in existing_jobs:
            document_id = getattr(job, "document_id", None)
            target_form_keys = self._target_form_keys_for_job(job)
            if document_id is None or not target_form_keys:
                continue
            if job.job_type not in job_types:
                continue
            if not self._job_counts_as_existing_extraction(job):
                continue
            if project_id is not None and job.project_id != project_id:
                continue
            if project_patient_id is not None and job.project_patient_id != project_patient_id:
                continue
            forms_by_document.setdefault(str(document_id), set()).update(target_form_keys)
        return forms_by_document

    def _target_form_keys_for_job(self, job: ExtractionJob) -> set[str]:
        input_json = getattr(job, "input_json", None)
        form_keys = set(self._as_list(input_json.get("form_keys")) if isinstance(input_json, dict) else [])
        if getattr(job, "target_form_key", None):
            form_keys.add(str(job.target_form_key))
        return {key for key in form_keys if key}

    def _job_targets_full_schema(self, job: ExtractionJob) -> bool:
        input_json = getattr(job, "input_json", None)
        payload = input_json if isinstance(input_json, dict) else {}
        if getattr(job, "target_form_key", None):
            return False
        target_filters = (
            self._as_list(payload.get("form_keys"))
            + self._as_list(payload.get("field_paths"))
            + self._as_list(payload.get("field_keys"))
            + self._as_list(payload.get("group_keys"))
        )
        return not any(target_filters)

    def _existing_full_schema_document_ids(
        self,
        existing_jobs: list[ExtractionJob],
        *,
        job_types: set[str],
        project_id: str | None = None,
        project_patient_id: str | None = None,
    ) -> set[str]:
        document_ids: set[str] = set()
        for job in existing_jobs:
            document_id = getattr(job, "document_id", None)
            if document_id is None:
                continue
            if getattr(job, "job_type", None) not in job_types:
                continue
            if not self._job_counts_as_existing_extraction(job):
                continue
            if project_id is not None and getattr(job, "project_id", None) != project_id:
                continue
            if project_patient_id is not None and getattr(job, "project_patient_id", None) != project_patient_id:
                continue
            if self._job_targets_full_schema(job):
                document_ids.add(str(document_id))
        return document_ids

    def _job_counts_as_existing_extraction(self, job: ExtractionJob) -> bool:
        if job.status in {"pending", "queued", "running"}:
            return True
        if job.status != "completed":
            return False
        return getattr(job, "error_type", None) != "empty_result"

    def _pending_plan_items_for_document(
        self,
        *,
        document: Document,
        schema_json: dict[str, Any],
        existing_forms_by_document: dict[str, set[str]],
        options: FolderUpdateOptions,
        source_tag: str,
        source_roles: set[str] | None = None,
    ) -> list[Any]:
        plan_items = self.extraction_planner.plan(
            document=document,
            schema_json=schema_json,
            input_json={"source": source_tag},
            source_roles=source_roles if source_roles is not None else {"primary"},
        )
        plan_items = self._filter_plan_items_to_targets(plan_items, options.target_form_keys)
        if options.mode == "full":
            return plan_items
        existing_forms = existing_forms_by_document.get(str(document.id), set())
        pending_items = [item for item in plan_items if item.target_form_key not in existing_forms]
        if pending_items or not existing_forms or "secondary" not in (source_roles or set()):
            return pending_items
        return self.extraction_planner.plan_unsourced_secondary_forms(
            document=document,
            schema_json=schema_json,
            excluded_form_keys=existing_forms,
            target_form_keys=options.target_form_keys,
        )

    def _folder_batch_title(self, *, base_title: str, options: FolderUpdateOptions) -> str:
        if not options.target_form_keys:
            return base_title
        count = len(options.target_form_keys)
        return f"{base_title}（靶向 {count} 个表单）"

    def _folder_batch_task_type(self, *, folder_task_type: str, options: FolderUpdateOptions) -> str:
        if options.target_form_keys:
            if folder_task_type == "patient_ehr_folder_extract":
                return "patient_ehr_targeted_extract"
            if folder_task_type == "project_crf_folder_extract":
                return "project_crf_targeted_extract"
        return folder_task_type

    async def _attach_async_task_tracking_for_job(
        self,
        *,
        job: ExtractionJob,
        requested_by: str | None,
    ) -> str:
        if job.job_type == "project_crf":
            title = "科研项目 CRF 抽取"
            scope_type = "project_patient"
            batch_kwargs = {
                "project_id": job.project_id,
                "project_patient_id": job.project_patient_id,
                "patient_id": job.patient_id,
            }
        else:
            title = "病历抽取"
            scope_type = "patient"
            batch_kwargs = {"patient_id": job.patient_id, "document_id": job.document_id}
        if job.target_form_key:
            title = f"{title} · {job.target_form_key}"
        batch = await self.task_progress_service.create_batch(
            task_type=self._task_type_for_job(job),
            title=title,
            scope_type=scope_type,
            requested_by=requested_by,
            **{key: value for key, value in batch_kwargs.items() if value is not None},
        )
        await self.task_progress_service.create_item_for_job(
            batch_id=batch.id,
            task_type=self._task_type_for_job(job),
            job=job,
        )
        document = (
            await self.document_repository.get_visible_by_id(
                job.document_id,
                uploaded_by=self._document_uploaded_by_for_job(job),
            )
            if job.document_id
            else None
        )
        await self.task_progress_service.persist_plan_snapshot(
            batch.id,
            build_single_job_plan_json(job=job, document=document),
        )
        return batch.id

    async def _ensure_folder_batch_items_for_jobs(self, *, batch_id: str, jobs: list[ExtractionJob]) -> None:
        for job in jobs:
            task_type = self._task_type_for_job(job)
            # Persist the progress batch on the job so worker-side heartbeats can
            # repair a missing async_task_items row before the UI loses progress.
            job.input_json = {
                **(job.input_json if isinstance(job.input_json, dict) else {}),
                "async_task_batch_id": batch_id,
                "async_task_type": task_type,
            }
            await self.job_repository.save(job)
            await self.task_progress_service.ensure_item_for_job(
                batch_id=batch_id,
                task_type=task_type,
                job=job,
                aggregate=False,
            )
        await self.task_progress_service.aggregate_batch(batch_id)

    async def _persist_folder_batch_plan(
        self,
        *,
        batch_id: str,
        options: FolderUpdateOptions,
        schema_version_id: str | None,
        schema_json: dict[str, Any],
        source_tag: str,
        documents: list[Document],
        eligible_documents: list[Document],
        pending_documents: list[Document],
        already_extracted_document_ids: set[str],
        jobs: list[ExtractionJob],
        skipped: list[dict[str, str]],
        extra_stats: dict[str, Any] | None = None,
    ) -> None:
        plan_json = build_folder_plan_json(
            options={"mode": options.mode, "target_form_keys": options.target_form_keys or []},
            schema_version_id=schema_version_id,
            source_tag=source_tag,
            documents_total=len(documents),
            eligible_documents=eligible_documents,
            pending_documents=pending_documents,
            already_extracted_document_ids=already_extracted_document_ids,
            jobs=jobs,
            skipped=skipped,
            schema_json=schema_json,
            planner=self.extraction_planner,
            extra_stats=extra_stats,
        )
        await self.task_progress_service.persist_plan_snapshot(batch_id, plan_json)
