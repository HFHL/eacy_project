from __future__ import annotations

import json
import re
from typing import Any

from app.services.llm_ehr_types import EhrExtractionState, VALUE_SLOTS


class LlmEhrNormalizationMixin:
    def _node_normalize(self, state: EhrExtractionState) -> dict[str, Any]:
        raw_output = state.get("raw_output") or {}
        if state.get("validation_status", "valid") not in {"valid", "valid_empty"}:
            return {"fields_output": []}
        field_specs = state.get("field_specs") or []
        by_path = {spec["field_path"]: spec for spec in field_specs}
        normalized: list[dict[str, Any]] = []

        raw_fields = raw_output.get("fields")
        if isinstance(raw_fields, list):
            for raw_field in raw_fields:
                item = self._normalize_field_item(raw_field, by_path, state.get("document_id"))
                if item:
                    normalized.append(item)

        raw_records = raw_output.get("records")
        if isinstance(raw_records, list):
            normalized.extend(self._normalize_records(raw_records, by_path, state.get("document_id")))

        deduped: list[dict[str, Any]] = []
        seen: set[tuple[str, str]] = set()
        for item in normalized:
            value = self._field_display_value(item)
            key = (item["field_path"], json.dumps([item.get("repeat_index"), value], ensure_ascii=False, sort_keys=True, default=str))
            if key in seen:
                continue
            seen.add(key)
            deduped.append(item)
        return {"fields_output": deduped}

    def _normalize_field_item(
        self,
        raw_field: Any,
        by_path: dict[str, dict[str, Any]],
        document_id: str | None,
    ) -> dict[str, Any] | None:
        if not isinstance(raw_field, dict):
            return None
        field_path = str(raw_field.get("field_path") or "").strip().strip("/").replace("/", ".")
        if not field_path:
            return None
        canonical_path, path_indexes = self._canonical_path_with_indexes(field_path, by_path)
        spec = by_path.get(canonical_path)
        if spec is None:
            return None
        repeat_index = self._repeat_index_from_raw(raw_field.get("repeat_index"), path_indexes)
        value_type = str(raw_field.get("value_type") or spec.get("value_type") or "text")
        value = self._extract_raw_value(raw_field, value_type)
        value = self._normalize_enum_value(value, spec.get("options"))
        if self._is_empty(value):
            return None
        return self._build_field_output(
            field_path=canonical_path,
            spec=spec,
            value=value,
            value_type=value_type,
            confidence=raw_field.get("confidence"),
            quote_text=raw_field.get("quote_text") or self._first_quote(raw_field.get("evidences")),
            evidences=self._normalize_evidences(raw_field.get("evidences")),
            evidence_type=raw_field.get("evidence_type") or "llm_extract",
            repeat_index=repeat_index,
            path_indexes=path_indexes,
        )

    def _normalize_records(
        self,
        raw_records: list[Any],
        by_path: dict[str, dict[str, Any]],
        document_id: str | None,
    ) -> list[dict[str, Any]]:
        output: list[dict[str, Any]] = []
        for raw_record in raw_records:
            if not isinstance(raw_record, dict):
                continue
            form_path = str(raw_record.get("form_path") or "").strip().strip("/").replace("/", ".")
            record = raw_record.get("record")
            if not form_path or self._is_empty(record):
                continue
            confidence = raw_record.get("confidence")
            evidences = self._normalize_evidences(raw_record.get("evidences"))
            if isinstance(record, list):
                for index, item in enumerate(record):
                    output.extend(self._flatten_record_node(f"{form_path}.{index}", item, by_path, confidence, evidences))
            else:
                output.extend(self._flatten_record_node(form_path, record, by_path, confidence, evidences))
        return output

    def _flatten_record_node(
        self,
        prefix: str,
        node: Any,
        by_path: dict[str, dict[str, Any]],
        confidence: Any,
        evidences: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if isinstance(node, dict):
            output: list[dict[str, Any]] = []
            for key, value in node.items():
                output.extend(self._flatten_record_node(f"{prefix}.{key}", value, by_path, confidence, evidences))
            return output
        if isinstance(node, list):
            output = []
            for index, item in enumerate(node):
                output.extend(self._flatten_record_node(f"{prefix}.{index}", item, by_path, confidence, evidences))
            return output
        if self._is_empty(node):
            return []
        canonical_path, path_indexes = self._canonical_path_with_indexes(prefix, by_path)
        spec = by_path.get(canonical_path)
        if spec is None:
            return []
        field_evidences = self._select_evidences_for_field(field_path=canonical_path, spec=spec, value=node, evidences=evidences)
        quote_text = self._first_quote(field_evidences)
        return [
            self._build_field_output(
                field_path=canonical_path,
                spec=spec,
                value=node,
                value_type=str(spec.get("value_type") or "text"),
                confidence=confidence,
                quote_text=quote_text,
                evidences=field_evidences,
                evidence_type="llm_extract",
                repeat_index=path_indexes[0] if path_indexes else None,
                path_indexes=path_indexes,
            )
        ]

    def _select_evidences_for_field(
        self,
        *,
        field_path: str,
        spec: dict[str, Any],
        value: Any,
        evidences: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if not evidences:
            return []
        matched = [
            evidence
            for evidence in evidences
            if self._evidence_matches_field(field_path=field_path, spec=spec, value=value, evidence=evidence)
        ]
        if matched:
            return matched
        shared = []
        for evidence in evidences:
            if not isinstance(evidence, dict):
                continue
            cloned = dict(evidence)
            cloned["record_shared"] = True
            shared.append(cloned)
        return shared

    def _evidence_matches_field(
        self,
        *,
        field_path: str,
        spec: dict[str, Any],
        value: Any,
        evidence: dict[str, Any],
    ) -> bool:
        quote = self._compact_text(evidence.get("quote_text"))
        if not quote:
            return False
        value_text = self._compact_text(value)
        if value_text and value_text in quote:
            return True
        field_key = self._compact_text(spec.get("field_key") or field_path.split(".")[-1])
        field_title = self._compact_text(spec.get("field_title"))
        return bool((field_key and field_key in quote) or (field_title and field_title in quote))

    def _compact_text(self, value: Any) -> str:
        return "".join(str(value or "").split())

    def _spec_for_indexed_path(self, field_path: str, by_path: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
        parts = field_path.split(".")
        without_indexes = ".".join(part for part in parts if not part.isdigit())
        return by_path.get(without_indexes)

    def _canonical_path_with_indexes(
        self,
        field_path: str,
        by_path: dict[str, dict[str, Any]],
    ) -> tuple[str, list[int]]:
        if field_path in by_path:
            return field_path, []
        parts = [part for part in field_path.split(".") if part]
        indexes = [int(part) for part in parts if part.isdigit()]
        canonical_path = ".".join(part for part in parts if not part.isdigit())
        return (canonical_path, indexes) if canonical_path in by_path else (field_path, indexes)

    def _repeat_index_from_raw(self, raw_repeat_index: Any, path_indexes: list[int]) -> int | None:
        if raw_repeat_index is not None:
            try:
                return max(0, int(raw_repeat_index))
            except (TypeError, ValueError):
                pass
        return path_indexes[0] if path_indexes else None

    def _build_field_output(
        self,
        *,
        field_path: str,
        spec: dict[str, Any],
        value: Any,
        value_type: str,
        confidence: Any,
        quote_text: str | None,
        evidence_type: str,
        evidences: list[dict[str, Any]] | None = None,
        repeat_index: int | None = None,
        path_indexes: list[int] | None = None,
    ) -> dict[str, Any]:
        normalized_value_type = value_type if value_type in VALUE_SLOTS else "text"
        slot = VALUE_SLOTS[normalized_value_type]
        value = self._coerce_value(value, normalized_value_type)
        value = self._normalize_enum_value(value, spec.get("options"))
        item = {
            "field_key": spec.get("field_key") or field_path.split(".")[-1],
            "field_path": field_path,
            "field_title": spec.get("field_title"),
            "record_form_key": spec.get("record_form_key"),
            "record_form_title": spec.get("record_form_title"),
            "merge_binding": spec.get("merge_binding"),
            "value_type": normalized_value_type,
            slot: value,
            "confidence": self._coerce_confidence(confidence),
            "quote_text": quote_text,
            "evidences": evidences,
            "evidence_type": evidence_type,
            "repeat_index": repeat_index,
            "path_indexes": path_indexes or None,
        }
        return {key: value for key, value in item.items() if value is not None}

    def _extract_raw_value(self, raw_field: dict[str, Any], value_type: str) -> Any:
        for key in (VALUE_SLOTS.get(value_type), "value", "value_text", "value_number", "value_date", "value_datetime", "value_json"):
            if key and key in raw_field and not self._is_empty(raw_field[key]):
                return raw_field[key]
        return None

    def _field_display_value(self, item: dict[str, Any]) -> Any:
        for slot in VALUE_SLOTS.values():
            if slot in item:
                return item[slot]
        return None

    def _coerce_value(self, value: Any, value_type: str) -> Any:
        if value_type == "number":
            if isinstance(value, (int, float)):
                return value
            match = re.search(r"-?\d+(?:\.\d+)?", str(value))
            return float(match.group(0)) if match else None
        if value_type in {"text", "date", "datetime"}:
            return str(value).strip()
        return value
