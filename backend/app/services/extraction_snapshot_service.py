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


class ExtractionSnapshotMixin:
    async def _build_run_input_snapshot(
        self,
        *,
        job: ExtractionJob,
        run_no: int,
        extra: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        input_json = job.input_json if isinstance(job.input_json, dict) else {}
        extractor = self._model_name_for_job(job)
        target_form_key = getattr(job, "target_form_key", None)
        snapshot: dict[str, Any] = {
            "schema_version_id": getattr(job, "schema_version_id", None),
            "extractor": extractor,
            "target_form_key": target_form_key,
            "plan": {
                "planned_reason": input_json.get("planned_reason"),
                "match_role": input_json.get("match_role"),
                "form_keys": self._as_list(input_json.get("form_keys")),
                "source": input_json.get("source"),
            },
            "field_filter": {
                "target_form_keys": list(
                    {
                        *(self._as_list(input_json.get("form_keys"))),
                        *([target_form_key] if target_form_key else []),
                    }
                ),
                "target_field_paths": self._as_list(input_json.get("field_paths")),
                "target_field_keys": self._as_list(input_json.get("field_keys")),
                "target_group_keys": self._as_list(input_json.get("group_keys")),
            },
            "worker_meta": {"run_no": run_no, **(extra or {})},
        }
        if not self._uses_schema_extractor(job):
            return snapshot

        try:
            document, _context = await self._resolve_schema_extraction_scope(job)
        except (ExtractionNotFoundError, ExtractionConflictError):
            return snapshot

        schema_version = await self.ehr_service.schema_service.get_version(job.schema_version_id)
        if schema_version is None:
            return snapshot

        all_fields = plan_schema_fields(schema_version.schema_json)
        filtered_fields = self._filter_schema_fields(all_fields, job)
        field_specs = [self._schema_field_spec(field) for field in filtered_fields]
        text = extraction_service_runtime.extract_document_text(document)
        reading_units = build_ocr_reading_units(document)
        reading_corpus = flatten_reading_unit_corpus(reading_units)
        if reading_corpus:
            text = reading_corpus
        text_source = "ocr_reading_units" if reading_units else ("ocr_text" if getattr(document, "ocr_text", None) else "parsed_content")
        snapshot["document"] = {
            "id": document.id,
            "doc_type": getattr(document, "doc_type", None) or getattr(document, "document_type", None),
            "doc_subtype": getattr(document, "doc_subtype", None) or getattr(document, "document_sub_type", None),
            "doc_title": getattr(document, "doc_title", None),
            "metadata_json": getattr(document, "metadata_json", None)
            if isinstance(getattr(document, "metadata_json", None), dict)
            else None,
            "doc_terms": document_trace_terms(document),
            "text_length": len(text or ""),
            "text_source": text_source,
            "reading_unit_count": len(reading_units),
            "ocr_status": getattr(document, "ocr_status", None),
        }
        snapshot["field_filter"]["matched_count"] = len(filtered_fields)
        snapshot["field_filter"]["total_schema_fields"] = len(all_fields)
        snapshot["field_specs"] = field_specs
        if extractor == "ClaudeCodeEhrExtractor":
            snapshot["claude_code"] = {
                "bin": config.CLAUDE_CODE_BIN,
                "workspace_root": config.CLAUDE_CODE_WORKSPACE_ROOT,
                "timeout_seconds": config.CLAUDE_CODE_TIMEOUT_SECONDS,
                "max_turns": config.CLAUDE_CODE_MAX_TURNS,
                "allowed_tools": config.CLAUDE_CODE_ALLOWED_TOOLS,
                "disallowed_tools": config.CLAUDE_CODE_DISALLOWED_TOOLS,
                "enable_mcp_tools": config.CLAUDE_CODE_ENABLE_MCP_TOOLS,
                "mcp_server_name": config.CLAUDE_CODE_MCP_SERVER_NAME,
            }
        if (
            (text or reading_units)
            and hasattr(self.llm_ehr_extractor, "_build_user_prompt")
            and hasattr(self.llm_ehr_extractor, "_build_system_prompt")
            and hasattr(self.llm_ehr_extractor, "_document_meta")
        ):
            user_preview = self.llm_ehr_extractor._build_user_prompt(
                state={
                    "text": text,
                    "field_specs": field_specs,
                    "fields": filtered_fields,
                    "reading_units": reading_units,
                    "ocr_evidence_units": reading_units,
                    "document_id": document.id,
                    "document_meta": self.llm_ehr_extractor._document_meta(document),
                }
            )
            snapshot["prompt_preview"] = {
                "system_chars": len(self.llm_ehr_extractor._build_system_prompt(field_specs) or ""),
                "user_chars": len(user_preview or ""),
            }
        return snapshot

    def _schema_field_spec(self, field: Any) -> dict[str, Any]:
        return {
            "field_key": getattr(field, "field_key", None),
            "field_path": getattr(field, "field_path", None),
            "field_title": getattr(field, "field_title", None),
            "value_type": getattr(field, "value_type", None),
            "options": getattr(field, "options", None),
            "record_form_key": getattr(field, "record_form_key", None),
            "record_form_title": getattr(field, "record_form_title", None),
            "group_key": getattr(field, "group_key", None),
            "group_title": getattr(field, "group_title", None),
            "display_type": getattr(field, "display_type", None),
            "schema_type": getattr(field, "schema_type", None),
            "schema_format": getattr(field, "schema_format", None),
            "merge_binding": getattr(field, "merge_binding", None),
        }
