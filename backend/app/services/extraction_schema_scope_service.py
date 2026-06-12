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


class ExtractionSchemaScopeMixin:
    def _model_name_for_job(self, job: ExtractionJob) -> str:
        if self._uses_schema_extractor(job):
            if self._use_claude_code_extractor(job):
                return "ClaudeCodeEhrExtractor"
            return "LlmEhrExtractor" if self._use_llm_ehr_extractor() else "SimpleEhrExtractor"
        return "MockExtractor"

    def _uses_schema_extractor(self, job: ExtractionJob) -> bool:
        return job.job_type in {"patient_ehr", "project_crf", "targeted_schema"} and job.document_id is not None

    async def _resolve_schema_extraction_scope(self, job: ExtractionJob) -> tuple[Document, DataContext | None]:
        document = await self.document_repository.get_visible_by_id(
            job.document_id,
            uploaded_by=self._document_uploaded_by_for_job(job),
        )
        if document is None:
            raise ExtractionNotFoundError("Document not found")

        context: DataContext | None = None
        if job.context_id is not None:
            context = await self._ensure_context_access(
                job.context_id,
                getattr(job, "requested_by", None),
            )
            self._validate_job_context(job=job, context=context, document=document)
            if job.schema_version_id is None:
                job.schema_version_id = context.schema_version_id
        elif job.job_type in {"patient_ehr", "targeted_schema"}:
            if job.patient_id is None:
                raise ExtractionConflictError(f"{job.job_type} extraction requires patient_id or context_id")
        else:
            raise ExtractionConflictError(f"{job.job_type} extraction requires context_id")

        if job.patient_id is not None and document.patient_id not in (None, job.patient_id):
            raise ExtractionConflictError("Document does not belong to patient")
        if getattr(job, "requested_by", None) is not None and job.patient_id is not None:
            await self._ensure_patient_access(job.patient_id, job.requested_by)
        if getattr(job, "requested_by", None) is not None and job.project_id is not None:
            await self._ensure_project_access(job.project_id, job.requested_by)
        if job.schema_version_id is None:
            raise ExtractionNotFoundError("Schema version not found")
        return document, context

    def _validate_job_context(self, *, job: ExtractionJob, context: DataContext, document: Document) -> None:
        if job.job_type == "project_crf" and context.context_type != "project_crf":
            raise ExtractionConflictError("project_crf extraction requires project CRF context")
        if job.job_type == "patient_ehr" and context.context_type != "patient_ehr":
            raise ExtractionConflictError(f"{job.job_type} extraction requires patient EHR context")
        if job.job_type == "targeted_schema" and context.context_type not in {"patient_ehr", "project_crf"}:
            raise ExtractionConflictError("targeted_schema extraction requires patient EHR or project CRF context")
        if getattr(job, "project_id", None) is not None and context.project_id != job.project_id:
            raise ExtractionConflictError("Data context does not belong to project")
        if getattr(job, "project_patient_id", None) is not None and context.project_patient_id != job.project_patient_id:
            raise ExtractionConflictError("Data context does not belong to project patient")
        if getattr(job, "patient_id", None) is not None and context.patient_id != job.patient_id:
            raise ExtractionConflictError("Data context does not belong to patient")
        if document.patient_id is not None and context.patient_id != document.patient_id:
            raise ExtractionConflictError("Document does not belong to data context patient")

    def _job_like(self, params: dict[str, Any]) -> Any:
        return SimpleNamespace(
            job_type=params.get("job_type"),
            patient_id=params.get("patient_id"),
            project_id=params.get("project_id"),
            project_patient_id=params.get("project_patient_id"),
        )

    def _filter_schema_fields(self, fields: list[Any], job: ExtractionJob) -> list[Any]:
        input_json = job.input_json or {}
        target_form_keys = set(self._as_list(input_json.get("form_keys")))
        if job.target_form_key:
            target_form_keys.add(job.target_form_key)
        target_field_paths = set(self._as_list(input_json.get("field_paths")))
        target_field_keys = set(self._as_list(input_json.get("field_keys")))
        target_group_keys = set(self._as_list(input_json.get("group_keys")))

        if not any((target_form_keys, target_field_paths, target_field_keys, target_group_keys)):
            return fields

        matched = [
            field
            for field in fields
            if (not target_form_keys or field.record_form_key in target_form_keys)
            and (not target_field_paths or field.field_path in target_field_paths)
            and (not target_field_keys or field.field_key in target_field_keys)
            and (not target_group_keys or field.group_key in target_group_keys)
        ]
        if target_field_paths or target_field_keys:
            matched = self._include_merge_anchor_fields(fields=fields, matched=matched)
        return matched

    def _include_merge_anchor_fields(self, *, fields: list[Any], matched: list[Any]) -> list[Any]:
        if not matched:
            return matched
        forms = {field.record_form_key for field in matched if getattr(field, "record_form_key", None)}
        labels = self._merge_binding_labels(field for field in matched)
        if not forms or not labels:
            return matched
        seen_paths = {field.field_path for field in matched}
        expanded = list(matched)
        for field in fields:
            if field.field_path in seen_paths or field.record_form_key not in forms:
                continue
            field_labels = {
                self._target_label_key(getattr(field, "field_key", None)),
                self._target_label_key(getattr(field, "field_title", None)),
                self._target_label_key(str(getattr(field, "field_path", "")).split(".")[-1]),
            }
            if labels.intersection(field_labels):
                expanded.append(field)
                seen_paths.add(field.field_path)
        return expanded

    def _merge_binding_labels(self, fields: Any) -> set[str]:
        labels: set[str] = set()
        for field in fields:
            binding = getattr(field, "merge_binding", None)
            if not binding:
                continue
            for part in str(binding).split(";"):
                if "=" not in part:
                    continue
                key, raw = part.split("=", 1)
                if key.strip() not in {"anchor", "fallback", "group_key", "interval"}:
                    continue
                for label in re.split(r"[+|]", raw):
                    label_key = self._target_label_key(label)
                    if label_key:
                        labels.add(label_key)
        return labels

    def _target_label_key(self, value: Any) -> str:
        text_value = str(value or "").strip().lower()
        text_value = text_value.replace("（", "(").replace("）", ")")
        return re.sub(r"[\s:：,，;；]", "", text_value)

    def _as_list(self, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            return [str(item) for item in value if item is not None]
        return [str(value)]

    def _task_type_for_job(self, job: ExtractionJob) -> str:
        input_json = job.input_json if isinstance(job.input_json, dict) else {}
        if job.job_type == "project_crf":
            is_targeted = job.target_form_key or input_json.get("source") == "project_crf_targeted_extract"
            return "project_crf_targeted_extract" if is_targeted else "project_crf_folder_extract"
        if job.job_type == "targeted_schema":
            return "patient_ehr_targeted_extract"
        return "patient_ehr_targeted_extract" if job.target_form_key else "patient_ehr_folder_extract"

    def _use_llm_ehr_extractor(self) -> bool:
        if self._llm_ehr_extractor_injected:
            return True
        return str(config.EACY_EXTRACTION_STRATEGY).lower() in {"llm", "langgraph", "multi_agent"}

    def _use_claude_code_extractor(self, job: ExtractionJob) -> bool:
        return job_uses_claude_code(job_type=job.job_type, input_json=job.input_json)
