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


class ExtractionEvidenceBuilderMixin:
    def _build_field_evidences(
        self,
        *,
        field: dict[str, Any],
        document_id: str | None,
        source_document: Document | None,
    ) -> list[dict[str, Any]]:
        if document_id is None:
            return []

        evidences: list[dict[str, Any]] = []
        field_evidences = field.get("evidences") if isinstance(field.get("evidences"), list) else []
        if field_evidences:
            resolved_field_evidences = resolve_evidence_locations(
                source_document,
                field_evidences,
                fallback_text=self._field_display_value(field),
            )
            for evidence in resolved_field_evidences:
                if not isinstance(evidence, dict):
                    continue
                bbox_json = evidence.get("bbox_json")
                if evidence.get("record_shared") and isinstance(bbox_json, dict):
                    bbox_json = {**bbox_json, "record_shared": True}
                evidences.append(
                    {
                        "document_id": document_id,
                        "evidence_type": self._resolve_evidence_type(evidence),
                        "quote_text": self._resolved_evidence_quote(evidence=evidence, field=field),
                        "evidence_score": field.get("confidence"),
                        "page_no": evidence.get("page_no"),
                        "bbox_json": bbox_json,
                        "start_offset": evidence.get("start_offset"),
                        "end_offset": evidence.get("end_offset"),
                    }
                )
            return evidences

        resolved_field_evidences = resolve_evidence_locations(
            source_document,
            [{"quote_text": field.get("quote_text") or self._field_display_value(field)}],
            fallback_text=self._field_display_value(field),
        )
        resolved_evidence = resolved_field_evidences[0] if resolved_field_evidences else {}
        return [
            {
                "document_id": document_id,
                "evidence_type": self._resolve_evidence_type(resolved_evidence),
                "quote_text": self._resolved_evidence_quote(evidence=resolved_evidence, field=field),
                "evidence_score": field.get("confidence"),
                "page_no": resolved_evidence.get("page_no"),
                "bbox_json": resolved_evidence.get("bbox_json"),
            }
        ]

    def _resolve_evidence_type(self, evidence: dict[str, Any]) -> str:
        bbox_json = evidence.get("bbox_json")
        location = bbox_json if isinstance(bbox_json, dict) else {}
        if location.get("fallback_strategy") == "sibling_page_hint":
            return "document_page_hint"
        is_record_shared = bool(evidence.get("record_shared") or location.get("record_shared"))
        if is_record_shared:
            return "document_record_shared"
        if evidence_location_is_trusted(location):
            if location.get("match_strategy") == "ocr_value_fuzzy":
                return "document_fuzzy"
            return "document_source_id"
        if isinstance(location, dict) and location.get("match_strategy") == "ocr_value_fuzzy":
            return "document_fuzzy_low_confidence"
        if evidence.get("quote_text"):
            return "document_text"
        return "document_text"

    def _should_auto_select_field(self, evidences: list[dict[str, Any]]) -> bool:
        for evidence in evidences or []:
            if not isinstance(evidence, dict):
                continue
            if evidence.get("evidence_type") == "document_record_shared":
                continue
            bbox_json = evidence.get("bbox_json")
            if isinstance(bbox_json, dict) and bbox_json.get("record_shared"):
                continue
            if isinstance(bbox_json, dict) and evidence_location_is_trusted(bbox_json):
                return True
        return False

    def _apply_sibling_evidence_fallback(self, field_entries: list[dict[str, Any]]) -> None:
        located_by_group: dict[tuple[str, str], dict[str, Any]] = {}
        for entry in field_entries:
            group_key = self._field_evidence_group_key(entry)
            if group_key is None:
                continue
            located = self._first_located_evidence(entry.get("evidences") or [])
            if located is not None:
                located_by_group.setdefault(group_key, located)

        for entry in field_entries:
            evidences = entry.get("evidences") or []
            if not evidences or self._first_located_evidence(evidences) is not None:
                continue
            group_key = self._field_evidence_group_key(entry)
            if group_key is None:
                continue
            sibling_evidence = located_by_group.get(group_key)
            if sibling_evidence is None:
                continue
            for evidence in evidences:
                if self._evidence_has_location(evidence):
                    continue
                evidence["page_no"] = sibling_evidence.get("page_no")
                sibling_bbox = sibling_evidence.get("bbox_json")
                sibling_page = sibling_evidence.get("page_no")
                if sibling_page is not None:
                    evidence["page_no"] = sibling_page
                    evidence["bbox_json"] = {
                        "page_no": sibling_page,
                        "renderable": False,
                        "fallback_strategy": "sibling_page_hint",
                        "fallback_from_quote_text": sibling_evidence.get("quote_text"),
                        "coord_warning": "sibling_page_only",
                    }
                elif isinstance(sibling_bbox, dict) and sibling_bbox.get("page_no") is not None:
                    evidence["page_no"] = sibling_bbox.get("page_no")
                    evidence["bbox_json"] = {
                        "page_no": sibling_bbox.get("page_no"),
                        "renderable": False,
                        "fallback_strategy": "sibling_page_hint",
                        "fallback_from_quote_text": sibling_evidence.get("quote_text"),
                        "coord_warning": "sibling_page_only",
                    }

    def _field_evidence_group_key(self, entry: dict[str, Any]) -> tuple[str, str] | None:
        field = entry.get("field")
        record = entry.get("record")
        field_path = field.get("field_path") if isinstance(field, dict) else None
        if not field_path or record is None:
            return None
        parent_path = str(field_path).rsplit(".", 1)[0] if "." in str(field_path) else str(field_path)
        return (str(getattr(record, "id", "")), parent_path)

    def _first_located_evidence(self, evidences: list[dict[str, Any]]) -> dict[str, Any] | None:
        for evidence in evidences:
            if not isinstance(evidence, dict):
                continue
            bbox_json = evidence.get("bbox_json")
            if isinstance(bbox_json, dict) and evidence_location_is_trusted(bbox_json):
                return evidence
            if evidence.get("page_no") is not None:
                return evidence
        return None

    def _evidence_has_location(self, evidence: dict[str, Any]) -> bool:
        bbox_json = evidence.get("bbox_json")
        if isinstance(bbox_json, dict) and evidence_location_is_trusted(bbox_json):
            return True
        if evidence.get("page_no") is not None and isinstance(bbox_json, dict) and bbox_json.get("fallback_strategy"):
            return True
        return False

    def _resolved_evidence_quote(self, *, evidence: dict[str, Any], field: dict[str, Any]) -> str | None:
        matched_text = evidence.get("source_text") or evidence.get("text")
        if matched_text:
            return self._coerce_evidence_text(matched_text)
        bbox_json = evidence.get("bbox_json")
        if isinstance(bbox_json, dict):
            bbox_text = bbox_json.get("source_text") or bbox_json.get("text")
            if bbox_text:
                return self._coerce_evidence_text(bbox_text)
        if bbox_json:
            return self._coerce_evidence_text(
                evidence.get("quote_text") or field.get("quote_text") or self._field_display_value(field)
            )
        return self._coerce_evidence_text(self._field_display_value(field))

    def _field_display_value(self, field: dict[str, Any]) -> Any:
        for key in ("value_text", "value_number", "value_date", "value_datetime", "value_json", "normalized_text"):
            value = field.get(key)
            if value not in (None, "", [], {}):
                return value
        return field.get("quote_text")

    def _coerce_evidence_text(self, value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text if text else None
