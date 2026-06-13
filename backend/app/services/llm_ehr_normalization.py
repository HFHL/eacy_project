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
            normalized.extend(self._normalize_field_items(raw_fields, by_path, state.get("document_id")))

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

    def _normalize_field_items(
        self,
        raw_fields: list[Any],
        by_path: dict[str, dict[str, Any]],
        document_id: str | None,
    ) -> list[dict[str, Any]]:
        normalized: list[dict[str, Any]] = []
        table_groups: dict[tuple[str, int | None], dict[str, Any]] = {}

        for raw_field in raw_fields:
            table_child = self._json_container_child_field(raw_field, by_path)
            if table_child is not None:
                group_key = (table_child["container_path"], table_child["record_repeat_index"])
                group = table_groups.setdefault(
                    group_key,
                    {
                        "container_path": table_child["container_path"],
                        "spec": table_child["spec"],
                        "record_repeat_index": table_child["record_repeat_index"],
                        "rows": {},
                        "evidences": [],
                        "confidence": None,
                    },
                )
                row = group["rows"].setdefault(table_child["row_index"], {})
                self._assign_nested_value(row, table_child["child_path"], table_child["value"])
                group["evidences"].extend(table_child["evidences"])
                if group["confidence"] is None and table_child["confidence"] is not None:
                    group["confidence"] = table_child["confidence"]
                continue

            item = self._normalize_field_item(raw_field, by_path, document_id)
            if item:
                normalized.append(item)

        for group in table_groups.values():
            rows_by_index = group["rows"]
            rows = [rows_by_index[index] for index in sorted(rows_by_index)]
            if not rows:
                continue
            evidences = self._dedupe_evidences(group["evidences"]) or None
            normalized.append(
                self._build_field_output(
                    field_path=group["container_path"],
                    spec=group["spec"],
                    value=rows,
                    value_type="json",
                    confidence=group["confidence"],
                    quote_text=self._first_quote(evidences),
                    evidences=evidences,
                    evidence_type="llm_extract",
                    repeat_index=group["record_repeat_index"],
                    path_indexes=[group["record_repeat_index"]] if group["record_repeat_index"] is not None else None,
                )
            )

        return normalized

    def _dedupe_evidences(self, evidences: list[dict[str, Any]]) -> list[dict[str, Any]]:
        deduped: list[dict[str, Any]] = []
        seen: set[str] = set()
        for evidence in evidences:
            if not isinstance(evidence, dict):
                continue
            key = json.dumps(evidence, ensure_ascii=False, sort_keys=True, default=str)
            if key in seen:
                continue
            seen.add(key)
            deduped.append(evidence)
        return deduped

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

    def _json_container_child_field(
        self,
        raw_field: Any,
        by_path: dict[str, dict[str, Any]],
    ) -> dict[str, Any] | None:
        if not isinstance(raw_field, dict):
            return None
        field_path = str(raw_field.get("field_path") or "").strip().strip("/").replace("/", ".")
        if not field_path:
            return None
        parts = [part for part in field_path.split(".") if part]
        non_numeric_parts = [part for part in parts if not part.isdigit()]
        if len(non_numeric_parts) < 2:
            return None

        for container_path, spec in by_path.items():
            if not self._is_json_container_spec(spec):
                continue
            container_parts = [part for part in str(container_path or "").split(".") if part]
            if (
                len(non_numeric_parts) <= len(container_parts)
                or non_numeric_parts[: len(container_parts)] != container_parts
            ):
                continue

            value_type = str(raw_field.get("value_type") or "text")
            value = self._extract_raw_value(raw_field, value_type)
            if self._is_empty(value):
                return None
            return {
                "container_path": container_path,
                "spec": spec,
                "child_path": non_numeric_parts[len(container_parts):],
                "row_index": self._table_child_row_index(raw_field, parts, container_parts),
                "record_repeat_index": self._table_child_record_repeat_index(raw_field, parts, spec),
                "value": value,
                "confidence": raw_field.get("confidence"),
                "evidences": self._normalize_evidences(raw_field.get("evidences")),
            }
        return None

    def _table_child_record_repeat_index(
        self,
        raw_field: dict[str, Any],
        parts: list[str],
        spec: dict[str, Any],
    ) -> int | None:
        for key in ("record_repeat_index", "form_repeat_index"):
            if raw_field.get(key) is not None:
                try:
                    return max(0, int(raw_field[key]))
                except (TypeError, ValueError):
                    return None

        form_parts = [part for part in str(spec.get("record_form_key") or "").split(".") if part]
        if form_parts and parts[: len(form_parts)] == form_parts:
            index_position = len(form_parts)
            if index_position < len(parts) and parts[index_position].isdigit():
                return int(parts[index_position])
        return None

    def _table_child_row_index(
        self,
        raw_field: dict[str, Any],
        parts: list[str],
        container_parts: list[str],
    ) -> int:
        positions = self._path_match_positions(parts, container_parts)
        if positions:
            next_position = positions[-1] + 1
            if next_position < len(parts) and parts[next_position].isdigit():
                return int(parts[next_position])
        if raw_field.get("repeat_index") is not None:
            try:
                return max(0, int(raw_field["repeat_index"]))
            except (TypeError, ValueError):
                pass
        return 0

    def _path_match_positions(self, parts: list[str], target_parts: list[str]) -> list[int] | None:
        positions: list[int] = []
        target_index = 0
        for index, part in enumerate(parts):
            if part.isdigit():
                continue
            if target_index >= len(target_parts):
                break
            if part != target_parts[target_index]:
                return None
            positions.append(index)
            target_index += 1
        return positions if target_index == len(target_parts) else None

    def _assign_nested_value(self, target: dict[str, Any], path: list[str], value: Any) -> None:
        if not path:
            return
        current = target
        for part in path[:-1]:
            child = current.get(part)
            if not isinstance(child, dict):
                child = {}
                current[part] = child
            current = child
        current[path[-1]] = value

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
        if self._is_empty(node):
            return []

        canonical_path, path_indexes = self._canonical_path_with_indexes(prefix, by_path)
        spec = by_path.get(canonical_path)
        if spec is not None and self._is_json_container_spec(spec):
            field_evidences = self._select_evidences_for_field(field_path=canonical_path, spec=spec, value=node, evidences=evidences)
            quote_text = self._first_quote(field_evidences)
            return [
                self._build_field_output(
                    field_path=canonical_path,
                    spec=spec,
                    value=node,
                    value_type="json",
                    confidence=confidence,
                    quote_text=quote_text,
                    evidences=field_evidences,
                    evidence_type="llm_extract",
                    repeat_index=path_indexes[0] if path_indexes else None,
                    path_indexes=path_indexes,
                )
            ]

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

    def _is_json_container_spec(self, spec: dict[str, Any]) -> bool:
        value_type = str(spec.get("value_type") or "")
        schema_type = str(spec.get("schema_type") or "")
        display_type = str(spec.get("display_type") or "")
        return value_type == "json" and schema_type in {"array", "object"} and display_type in {"table", "group", "checkbox", "multi_text", "matrix_radio", "matrix_checkbox"}

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
