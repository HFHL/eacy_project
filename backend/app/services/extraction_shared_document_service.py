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


class ExtractionSharedDocumentMixin:
    async def _claim_shared_document_call_jobs(
        self,
        *,
        primary_job: ExtractionJob,
        worker_mode: bool,
    ) -> list[ExtractionJob]:
        if not worker_mode:
            return []
        if primary_job.document_id is None or not self._use_claude_code_extractor(primary_job):
            return []
        if not hasattr(self.job_repository, "list_shareable_schema_jobs_for_document"):
            return []
        candidates = await self.job_repository.list_shareable_schema_jobs_for_document(
            document_id=primary_job.document_id,
            requested_by=getattr(primary_job, "requested_by", None),
            exclude_job_id=primary_job.id,
        )
        claimed: list[ExtractionJob] = []
        for candidate in candidates:
            if not self._can_share_document_call(primary_job=primary_job, candidate=candidate):
                continue
            candidate.status = "running"
            candidate.progress = max(int(getattr(candidate, "progress", 0) or 0), 10)
            candidate.error_message = None
            candidate.error_type = None
            candidate.timeout_at = None
            candidate.started_at = datetime.utcnow()
            candidate.finished_at = None
            await self.job_repository.save(candidate)
            await self.task_progress_service.update_job_progress(
                candidate,
                status="running",
                progress=10,
                stage="shared_worker_started",
                stage_label="Worker 已启动",
                message=f"同文档任务已合并到 {primary_job.id} 共享 Claude 调用",
                current_step=1,
                payload_json={"shared_primary_job_id": primary_job.id},
                commit=False,
            )
            claimed.append(candidate)
        return claimed

    def _can_share_document_call(self, *, primary_job: ExtractionJob, candidate: ExtractionJob) -> bool:
        if candidate.id == primary_job.id:
            return False
        if candidate.status not in {"pending", "queued"}:
            return False
        if candidate.document_id != primary_job.document_id:
            return False
        if getattr(candidate, "requested_by", None) != getattr(primary_job, "requested_by", None):
            return False
        if getattr(candidate, "patient_id", None) != getattr(primary_job, "patient_id", None):
            return False
        if not self._uses_schema_extractor(candidate) or not self._use_claude_code_extractor(candidate):
            return False
        input_json = candidate.input_json if isinstance(candidate.input_json, dict) else {}
        if input_json.get("wait_for_document_ready") is True:
            return False
        if candidate.context_id is None or candidate.schema_version_id is None:
            return False
        return True

    async def _start_shared_document_runs(
        self,
        *,
        primary_job: ExtractionJob,
        shared_jobs: list[ExtractionJob],
        model_name: str,
        prompt_version: str,
        input_snapshot_extra: dict[str, Any],
    ) -> list[SharedDocumentExtractionState]:
        states: list[SharedDocumentExtractionState] = []
        if not shared_jobs:
            return states
        shared_job_ids = [job.id for job in shared_jobs]
        for shared_job in shared_jobs:
            runs = await self.run_repository.list_by_job(shared_job.id)
            run = await self.start_run(
                job_id=shared_job.id,
                run_no=len(runs) + 1,
                model_name=model_name,
                prompt_version=prompt_version,
            )
            snapshot = await self._build_run_input_snapshot(
                job=shared_job,
                run_no=run.run_no,
                extra={
                    **input_snapshot_extra,
                    "shared_document_call": {
                        "primary_job_id": primary_job.id,
                        "sibling_job_ids": [job_id for job_id in shared_job_ids if job_id != shared_job.id],
                    },
                },
            )
            run.input_snapshot_json = snapshot
            await self.run_repository.save(run)
            await self.task_progress_service.update_job_progress(
                shared_job,
                progress=45,
                stage="call_extractor",
                stage_label="AI 抽取中",
                message=f"正在通过共享 Claude 调用抽取同一文档（主任务 {primary_job.id}）",
                extraction_run_id=run.id,
                current_step=4,
                payload_json={
                    "run_id": run.id,
                    "model_name": model_name,
                    "extractor": model_name,
                    "field_count": len(snapshot.get("field_specs") or []),
                    "shared_primary_job_id": primary_job.id,
                },
                commit=False,
            )
            states.append(
                SharedDocumentExtractionState(
                    job=shared_job,
                    run=run,
                    field_specs=list(snapshot.get("field_specs") or []),
                )
            )
        return states

    async def _extract_shared_document_call(
        self,
        *,
        primary_job: ExtractionJob,
        shared_states: list[SharedDocumentExtractionState],
        llm_call_buffer: list[dict[str, Any]] | None = None,
        llm_call_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        document, _context = await self._resolve_schema_extraction_scope(primary_job)
        combined_fields: list[Any] = []
        seen_field_paths: set[str] = set()
        schema_payloads: list[dict[str, Any]] = []
        for scoped_job in [primary_job, *(state.job for state in shared_states)]:
            scoped_document, _scoped_context = await self._resolve_schema_extraction_scope(scoped_job)
            if scoped_document.id != document.id:
                raise ExtractionConflictError("Shared document extraction requires the same document")
            schema_version = await self.ehr_service.schema_service.get_version(scoped_job.schema_version_id)
            if schema_version is None:
                raise ExtractionNotFoundError("Schema version not found")
            fields = self._filter_schema_fields(plan_schema_fields(schema_version.schema_json), scoped_job)
            if not fields:
                raise ExtractionConflictError("No schema fields matched extraction target")
            schema_payloads.append(
                {
                    "job_id": scoped_job.id,
                    "job_type": scoped_job.job_type,
                    "context_id": scoped_job.context_id,
                    "schema_version_id": scoped_job.schema_version_id,
                    "target_form_key": scoped_job.target_form_key,
                    "field_paths": [field.field_path for field in fields],
                    "schema_json": schema_version.schema_json,
                }
            )
            for field in fields:
                field_path = getattr(field, "field_path", None)
                if field_path and field_path in seen_field_paths:
                    continue
                if field_path:
                    seen_field_paths.add(field_path)
                combined_fields.append(field)

        if not combined_fields:
            raise ExtractionConflictError("No schema fields matched extraction target")
        await extraction_service_runtime.release_db_connection()
        shared_job = SimpleNamespace(
            **{
                key: getattr(primary_job, key, None)
                for key in (
                    "id",
                    "job_type",
                    "patient_id",
                    "document_id",
                    "project_id",
                    "project_patient_id",
                    "context_id",
                    "schema_version_id",
                    "target_form_key",
                )
            },
            input_json={
                **(primary_job.input_json if isinstance(primary_job.input_json, dict) else {}),
                "shared_document_call": {
                    "primary_job_id": primary_job.id,
                    "job_ids": [primary_job.id, *(state.job.id for state in shared_states)],
                    "schema_version_ids": [payload["schema_version_id"] for payload in schema_payloads],
                },
            },
        )
        if hasattr(self.claude_code_ehr_extractor, "extract_async"):
            return await self.claude_code_ehr_extractor.extract_async(
                text=extraction_service_runtime.extract_document_text(document),
                fields=combined_fields,
                schema_json={"x-shared-document-call": True, "schemas": schema_payloads},
                document_id=document.id,
                document=document,
                job=shared_job,
                llm_call_buffer=llm_call_buffer,
                llm_call_context=llm_call_context,
                cancel_check=lambda: self._raise_if_cancelled(primary_job.id),
            )
        return self.claude_code_ehr_extractor.extract(
            text=extraction_service_runtime.extract_document_text(document),
            fields=combined_fields,
            schema_json={"x-shared-document-call": True, "schemas": schema_payloads},
            document_id=document.id,
            document=document,
            job=shared_job,
            llm_call_buffer=llm_call_buffer,
            llm_call_context=llm_call_context,
        )

    def _filter_output_for_field_specs(
        self,
        output: dict[str, Any],
        *,
        field_specs: list[dict[str, Any]],
        shared_primary_job_id: str | None = None,
    ) -> dict[str, Any]:
        allowed_paths = {
            RecordInstanceMergeResolver.canonical_field_path(spec.get("field_path"))
            for spec in field_specs
            if isinstance(spec, dict) and spec.get("field_path")
        }
        allowed_keys = {str(spec.get("field_key")) for spec in field_specs if isinstance(spec, dict) and spec.get("field_key")}
        allowed_forms = {
            str(spec.get("record_form_key"))
            for spec in field_specs
            if isinstance(spec, dict) and spec.get("record_form_key")
        }
        filtered_fields: list[dict[str, Any]] = []
        for field in output.get("fields") or []:
            if not isinstance(field, dict):
                continue
            canonical_path = RecordInstanceMergeResolver.canonical_field_path(field.get("field_path"))
            form_key = field.get("record_form_key") or RecordInstanceMergeResolver.record_form_key_from_field_path(canonical_path)
            if canonical_path and canonical_path in allowed_paths:
                filtered_fields.append(field)
                continue
            if form_key and str(form_key) in allowed_forms and str(field.get("field_key")) in allowed_keys:
                filtered_fields.append(field)
        raw_output = output.get("raw_output")
        if isinstance(raw_output, dict) and shared_primary_job_id:
            raw_output = {
                **raw_output,
                "_shared_document_call": {
                    "primary_job_id": shared_primary_job_id,
                    "filtered_field_paths": sorted(allowed_paths),
                },
            }
        return {**output, "fields": filtered_fields, "raw_output": raw_output}
