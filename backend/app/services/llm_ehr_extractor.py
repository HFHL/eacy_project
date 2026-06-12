from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from app.models import Document
from app.services.evidence_location_resolver import (
    build_ocr_reading_units,
    flatten_reading_unit_corpus,
)
from app.services.llm_ehr_llm_client import LlmEhrClientMixin
from app.services.llm_ehr_normalization import LlmEhrNormalizationMixin
from app.services.llm_ehr_prompts import LlmEhrPromptMixin
from app.services.llm_ehr_types import EhrExtractionState, LlmExtractionError, VALUE_SLOTS
from app.services.llm_ehr_validation import LlmEhrValidationMixin
from app.services.llm_ehr_values import LlmEhrValueMixin
from app.services.schema_field_planner import SchemaField
from core.config import config


class LlmEhrExtractor(
    LlmEhrClientMixin,
    LlmEhrNormalizationMixin,
    LlmEhrPromptMixin,
    LlmEhrValidationMixin,
    LlmEhrValueMixin,
):
    """LangGraph-based EHR extractor that normalizes LLM output to current field event format."""

    def extract(
        self,
        *,
        text: str,
        fields: list[SchemaField],
        document_id: str | None = None,
        document: Document | None = None,
        llm_call_buffer: list[dict[str, Any]] | None = None,
        llm_call_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        batch_results = list(
            self.extract_batches(
                text=text,
                fields=fields,
                document_id=document_id,
                document=document,
                llm_call_buffer=llm_call_buffer,
                llm_call_context=llm_call_context,
            )
        )
        return self._merge_batch_results(
            batch_results=batch_results,
            document_id=document_id,
            incrementally_persisted=False,
        )

    def extract_batches(
        self,
        *,
        text: str,
        fields: list[SchemaField],
        document_id: str | None = None,
        document: Document | None = None,
        llm_call_buffer: list[dict[str, Any]] | None = None,
        llm_call_context: dict[str, Any] | None = None,
    ):
        if not config.OPENAI_API_KEY:
            raise LlmExtractionError("Missing OPENAI_API_KEY for EHR extraction")
        batch_size = max(int(getattr(config, "EXTRACTION_FIELD_BATCH_SIZE", 35) or 35), 1)
        batches = self._field_batches(fields, batch_size=batch_size)
        for batch_index, batch in enumerate(batches):
            context = {
                **dict(llm_call_context or {}),
                "batch_index": batch_index,
                "batch_count": len(batches),
            }
            try:
                batch_result = self._extract_batch(
                    text=text,
                    fields=batch,
                    document_id=document_id,
                    document=document,
                    llm_call_buffer=llm_call_buffer,
                    llm_call_context=context,
                )
            except LlmExtractionError as exc:
                yield {
                    "extractor": "LlmEhrExtractor",
                    "document_id": document_id,
                    "raw_output": None,
                    "fields": [],
                    "errors": [str(exc)],
                    "validation_status": "invalid",
                    "validation_log": [
                        {
                            "attempt": None,
                            "status": "invalid",
                            "errors": [str(exc)],
                            "warnings": [],
                            "created_at": datetime.utcnow().isoformat(),
                        }
                    ],
                    "validation_warnings": [],
                    "attempt_count": 0,
                    "batch_index": batch_index,
                    "batch_count": len(batches),
                    "batch_field_count": len(batch),
                    "batch_status": "failed",
                    "error_message": str(exc),
                }
                continue
            yield {
                **batch_result,
                "batch_index": batch_index,
                "batch_count": len(batches),
                "batch_field_count": len(batch),
                "batch_status": "succeeded",
            }

    def _merge_batch_results(
        self,
        *,
        batch_results: list[dict[str, Any]],
        document_id: str | None,
        incrementally_persisted: bool,
    ) -> dict[str, Any]:
        if not batch_results:
            return {
                "extractor": "LlmEhrExtractor",
                "document_id": document_id,
                "raw_output": None,
                "fields": [],
                "errors": [],
                "validation_status": "valid_empty",
                "validation_log": [],
                "validation_warnings": [],
                "attempt_count": 0,
                "incrementally_persisted": incrementally_persisted,
            }

        merged_fields: list[dict[str, Any]] = []
        validation_logs: list[dict[str, Any]] = []
        validation_warnings: list[str] = []
        errors: list[str] = []
        total_attempts = 0
        last_raw_output: dict[str, Any] | None = None
        last_status = "valid"
        successful_batches = 0
        for batch_result in batch_results:
            merged_fields.extend(batch_result.get("fields") or [])
            validation_logs.extend(batch_result.get("validation_log") or [])
            validation_warnings.extend(batch_result.get("validation_warnings") or [])
            if batch_result.get("batch_status") == "failed":
                error_message = batch_result.get("error_message") or "LLM batch extraction failed"
                errors.append(str(error_message))
                validation_warnings.append(f"批次 {int(batch_result.get('batch_index') or 0) + 1} 抽取失败，已丢弃该批结果：{error_message}")
                continue
            successful_batches += 1
            total_attempts = max(total_attempts, int(batch_result.get("attempt_count") or 0))
            last_raw_output = batch_result.get("raw_output") if isinstance(batch_result.get("raw_output"), dict) else last_raw_output
            last_status = batch_result.get("validation_status") or last_status

        if successful_batches == 0 and errors:
            raise LlmExtractionError("; ".join(errors))

        deduped: list[dict[str, Any]] = []
        seen: set[tuple[str, Any, str]] = set()
        for item in merged_fields:
            key = self._merged_field_key(item)
            if not key or key in seen:
                continue
            seen.add(key)
            deduped.append(item)

        return {
            "extractor": "LlmEhrExtractor",
            "document_id": document_id,
            "raw_output": last_raw_output,
            "fields": deduped,
            "errors": errors,
            "validation_status": last_status,
            "validation_log": validation_logs,
            "validation_warnings": validation_warnings,
            "attempt_count": total_attempts,
            "incrementally_persisted": incrementally_persisted,
        }

    def _extract_batch(
        self,
        *,
        text: str,
        fields: list[SchemaField],
        document_id: str | None = None,
        document: Document | None = None,
        llm_call_buffer: list[dict[str, Any]] | None = None,
        llm_call_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        field_hints = [field.field_title for field in fields if getattr(field, "field_title", None)]
        field_hints.extend(field.field_path for field in fields)
        reading_units = build_ocr_reading_units(document, field_hints=field_hints)
        text_corpus = flatten_reading_unit_corpus(reading_units) or (text or "").strip()
        graph = self._build_graph()
        state: EhrExtractionState = {
            "text": text_corpus,
            "fields": fields,
            "document_id": document_id,
            "document_meta": self._document_meta(document),
            "reading_units": reading_units,
            "ocr_evidence_units": reading_units,
            "attempt": 0,
            "max_attempts": 3,
            "validation_log": [],
            "llm_call_buffer": llm_call_buffer if llm_call_buffer is not None else [],
            "llm_call_context": dict(llm_call_context or {}),
        }
        result = graph.invoke(state)
        validation_status = result.get("validation_status") or "invalid"
        if validation_status not in {"valid", "valid_empty"}:
            errors = result.get("validation_errors") or ["EHR LLM output validation failed"]
            raise LlmExtractionError("; ".join(errors))
        return {
            "extractor": "LlmEhrExtractor",
            "document_id": document_id,
            "raw_output": result.get("raw_output"),
            "fields": result.get("fields_output") or [],
            "errors": result.get("errors") or [],
            "validation_status": validation_status,
            "validation_log": result.get("validation_log") or [],
            "validation_warnings": result.get("validation_warnings") or [],
            "attempt_count": result.get("attempt") or 0,
        }

    def _build_graph(self):
        try:
            from langgraph.graph import END, START, StateGraph
        except Exception as exc:  # pragma: no cover - dependency guard
            raise LlmExtractionError("langgraph is not installed. Install backend dependencies first.") from exc

        builder = StateGraph(EhrExtractionState)
        builder.add_node("prepare", self._node_prepare)
        builder.add_node("call_llm", self._node_call_llm)
        builder.add_node("validate", self._node_validate)
        builder.add_node("normalize", self._node_normalize)
        builder.add_node("resolve_merge", self._node_resolve_merge)
        builder.add_edge(START, "prepare")
        builder.add_edge("prepare", "call_llm")
        builder.add_edge("call_llm", "validate")
        builder.add_conditional_edges(
            "validate",
            self._route_after_validate,
            {"retry": "call_llm", "normalize": "normalize"},
        )
        builder.add_edge("normalize", "resolve_merge")
        builder.add_edge("resolve_merge", END)
        return builder.compile()

    def _node_prepare(self, state: EhrExtractionState) -> dict[str, Any]:
        field_specs = [self._field_spec(field) for field in state["fields"]]
        return {
            "field_specs": field_specs,
            "system_prompt": self._build_system_prompt(field_specs),
            "user_prompt": self._build_user_prompt(state=state),
        }

    def _node_validate(self, state: EhrExtractionState) -> dict[str, Any]:
        reading_units = state.get("reading_units") or state.get("ocr_evidence_units") or []
        errors, warnings, status_hint = self._validate_raw_output(
            state.get("raw_output"),
            state.get("field_specs") or [],
            text=state.get("text") or "",
            reading_units=reading_units,
            parse_error=state.get("parse_error"),
            require_source_id=bool(reading_units),
        )
        status = "invalid" if errors else (status_hint or "valid")
        attempt = int(state.get("attempt") or 0)
        validation_log = [*(state.get("validation_log") or [])]
        validation_log.append(
            {
                "attempt": attempt,
                "status": status,
                "errors": errors,
                "warnings": warnings,
                "created_at": datetime.utcnow().isoformat(),
            }
        )
        update: dict[str, Any] = {
            "validation_status": status,
            "validation_errors": errors,
            "validation_warnings": warnings,
            "validation_log": validation_log,
        }
        if errors and attempt < int(state.get("max_attempts") or 1):
            update["repair_prompt"] = self._build_repair_prompt(state=state, errors=errors)
        elif warnings and attempt < int(state.get("max_attempts") or 1):
            update["repair_prompt"] = self._build_repair_prompt(state=state, errors=warnings)
            update["validation_status"] = "invalid"
            update["validation_errors"] = warnings
        elif errors and self._can_sanitize_validation_errors(errors):
            sanitized, discarded = self._sanitize_invalid_items(state.get("raw_output"), errors)
            if discarded:
                sanitized_errors, sanitized_warnings, sanitized_hint = self._validate_raw_output(
                    sanitized,
                    state.get("field_specs") or [],
                    text=state.get("text") or "",
                    reading_units=reading_units,
                    parse_error=None,
                    require_source_id=bool(reading_units),
                )
                if not sanitized_errors:
                    discard_warning = f"Discarded {len(discarded)} invalid extraction item(s) after validation"
                    validation_log.append(
                        {
                            "attempt": attempt,
                            "status": sanitized_hint or "valid",
                            "errors": [],
                            "warnings": [discard_warning, *sanitized_warnings],
                            "discarded_items": discarded,
                            "created_at": datetime.utcnow().isoformat(),
                        }
                    )
                    update.update(
                        {
                            "raw_output": sanitized,
                            "validation_status": sanitized_hint or "valid",
                            "validation_errors": [],
                            "validation_warnings": [discard_warning, *warnings, *sanitized_warnings],
                            "validation_log": validation_log,
                        }
                    )
        return update

    def _route_after_validate(self, state: EhrExtractionState) -> str:
        if state.get("validation_status") in {"valid", "valid_empty"}:
            return "normalize"
        if int(state.get("attempt") or 0) < int(state.get("max_attempts") or 1):
            return "retry"
        return "normalize"

    def _node_resolve_merge(self, state: EhrExtractionState) -> dict[str, Any]:
        return {"fields_output": state.get("fields_output") or []}

    def _field_batches(self, fields: list[SchemaField], *, batch_size: int) -> list[list[SchemaField]]:
        grouped: dict[str, list[SchemaField]] = {}
        for index, field in enumerate(fields):
            key = field.record_form_key or f"__field__:{index}:{field.field_path}"
            grouped.setdefault(key, []).append(field)

        batches: list[list[SchemaField]] = []
        current: list[SchemaField] = []
        for group in grouped.values():
            if len(group) > batch_size:
                if current:
                    batches.append(current)
                    current = []
                batches.extend(group[offset : offset + batch_size] for offset in range(0, len(group), batch_size))
                continue
            if current and len(current) + len(group) > batch_size:
                batches.append(current)
                current = []
            current.extend(group)
        if current:
            batches.append(current)
        return batches

    def _merged_field_key(self, item: dict[str, Any]) -> tuple[str, Any, str] | None:
        field_path = str(item.get("field_path") or "")
        if not field_path:
            return None
        value_key = json.dumps(self._field_display_value(item), ensure_ascii=False, sort_keys=True, default=str)
        return field_path, item.get("repeat_index"), value_key
