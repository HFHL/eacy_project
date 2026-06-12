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


class ExtractionValidationMixin:
    def _draft_job_for_prepare(
        self,
        *,
        job_type: str,
        requested_by: str | None,
        params: dict[str, Any],
    ) -> SimpleNamespace:
        return SimpleNamespace(
            id=None,
            job_type=job_type,
            patient_id=params.get("patient_id"),
            document_id=params.get("document_id"),
            project_id=params.get("project_id"),
            project_patient_id=params.get("project_patient_id"),
            context_id=params.get("context_id"),
            schema_version_id=params.get("schema_version_id"),
            target_form_key=params.get("target_form_key"),
            input_json=params.get("input_json"),
            requested_by=requested_by,
        )

    async def _prepare_job(self, *, job: ExtractionJob, created_by: str | None) -> None:
        if job.context_id is not None and job.schema_version_id is not None:
            return

        if job.job_type in {"patient_ehr", "targeted_schema"} and job.patient_id is not None:
            ehr = await self.ehr_service.get_patient_ehr(
                job.patient_id,
                created_by=created_by,
                owner_id=created_by,
            )
            context = ehr.get("context")
            if context is not None:
                job.context_id = context.id
                job.schema_version_id = context.schema_version_id
            return

        if job.job_type == "project_crf" and job.project_id is not None and job.project_patient_id is not None:
            from app.services.research_project_service import ResearchProjectConflictError, ResearchProjectNotFoundError, ResearchProjectService

            try:
                crf = await ResearchProjectService().get_project_crf(
                    project_id=job.project_id,
                    project_patient_id=job.project_patient_id,
                    created_by=created_by,
                    owner_id=created_by,
                )
            except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
                raise ExtractionConflictError(str(error)) from error
            context = crf.get("context")
            if context is not None:
                job.context_id = context.id
                job.schema_version_id = context.schema_version_id
                if job.patient_id is None:
                    job.patient_id = context.patient_id

    async def _validate_schema_targets(self, job: ExtractionJob) -> None:
        if not self._uses_schema_extractor(job) or job.schema_version_id is None:
            return
        input_json = job.input_json if isinstance(job.input_json, dict) else {}
        target_form_keys = set(self._as_list(input_json.get("form_keys")))
        if job.target_form_key:
            target_form_keys.add(job.target_form_key)
        target_field_paths = set(self._as_list(input_json.get("field_paths")))
        target_field_keys = set(self._as_list(input_json.get("field_keys")))
        if not any((target_form_keys, target_field_paths, target_field_keys)):
            return
        schema_version = await self.ehr_service.schema_service.get_version(job.schema_version_id)
        if schema_version is None:
            return
        fields = plan_schema_fields(schema_version.schema_json)
        allowed_forms = {field.record_form_key for field in fields if field.record_form_key}
        allowed_paths = {field.field_path for field in fields if field.field_path}
        allowed_keys = {field.field_key for field in fields if field.field_key}
        invalid_forms = sorted(target_form_keys - allowed_forms)
        invalid_paths = sorted(target_field_paths - allowed_paths)
        invalid_keys = sorted(target_field_keys - allowed_keys)
        if invalid_forms or invalid_paths or invalid_keys:
            details = []
            if invalid_forms:
                details.append(f"unknown form_keys={invalid_forms}")
            if invalid_paths:
                details.append(f"unknown field_paths={invalid_paths}")
            if invalid_keys:
                details.append(f"unknown field_keys={invalid_keys}")
            raise ExtractionTargetValidationError(
                "Invalid extraction target: " + "; ".join(details),
                invalid_form_keys=invalid_forms,
                invalid_field_paths=invalid_paths,
                invalid_field_keys=invalid_keys,
                available_form_keys=sorted(allowed_forms),
                available_field_paths=sorted(allowed_paths),
                available_field_keys=sorted(allowed_keys),
                available_fields=self._available_field_hints(fields),
            )

    def _validate_target_form_keys_for_schema(
        self,
        *,
        schema_json: dict[str, Any],
        target_form_keys: list[str] | None,
    ) -> None:
        target_keys = {str(key).strip() for key in (target_form_keys or []) if str(key).strip()}
        if not target_keys:
            return
        fields = plan_schema_fields(schema_json)
        allowed_forms = {field.record_form_key for field in fields if field.record_form_key}
        invalid_forms = sorted(target_keys - allowed_forms)
        if not invalid_forms:
            return
        allowed_paths = {field.field_path for field in fields if field.field_path}
        allowed_keys = {field.field_key for field in fields if field.field_key}
        raise ExtractionTargetValidationError(
            f"Invalid extraction target: unknown form_keys={invalid_forms}",
            invalid_form_keys=invalid_forms,
            available_form_keys=sorted(allowed_forms),
            available_field_paths=sorted(allowed_paths),
            available_field_keys=sorted(allowed_keys),
            available_fields=self._available_field_hints(fields),
        )

    def _available_field_hints(self, fields: list[Any], *, limit: int = 100) -> list[dict[str, Any]]:
        hints: list[dict[str, Any]] = []
        for field in fields[:limit]:
            hints.append(
                {
                    "field_path": getattr(field, "field_path", None),
                    "field_key": getattr(field, "field_key", None),
                    "field_title": getattr(field, "field_title", None),
                    "form_key": getattr(field, "record_form_key", None),
                    "form_title": getattr(field, "record_form_title", None),
                }
            )
        return hints
