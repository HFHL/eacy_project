from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from app.services.llm_ehr_types import VALUE_SLOTS


class LlmEhrValidationMixin:
    def _validate_raw_output(
        self,
        raw_output: Any,
        field_specs: list[dict[str, Any]],
        *,
        text: str = "",
        reading_units: list[dict[str, Any]] | None = None,
        parse_error: str | None = None,
        require_source_id: bool = False,
    ) -> tuple[list[str], list[str], str | None]:
        errors: list[str] = []
        warnings: list[str] = []
        if parse_error:
            errors.append(f"JSON parse error: {parse_error}")
            return errors, warnings, None
        if not isinstance(raw_output, dict):
            return ["Output must be a JSON object"], warnings, None

        raw_fields = raw_output.get("fields")
        raw_records = raw_output.get("records")
        has_fields = isinstance(raw_fields, list) and len(raw_fields) > 0
        has_records = isinstance(raw_records, list) and len(raw_records) > 0
        if not has_fields and not has_records:
            warnings.append("No extractable records[] or fields[] returned")
            return errors, warnings, "valid_empty"

        by_path = {spec["field_path"]: spec for spec in field_specs}
        form_keys = {spec.get("record_form_key") for spec in field_specs if spec.get("record_form_key")}

        if isinstance(raw_fields, list):
            for index, raw_field in enumerate(raw_fields):
                if not isinstance(raw_field, dict):
                    errors.append(f"fields[{index}] must be an object")
                    continue
                field_path = str(raw_field.get("field_path") or "").strip().strip("/").replace("/", ".")
                spec = by_path.get(field_path) or self._spec_for_indexed_path(field_path, by_path)
                if not field_path or spec is None:
                    errors.append(f"fields[{index}].field_path is not in schema: {field_path or '<missing>'}")
                    continue
                errors.extend(self._validate_value_payload(raw_field, spec, f"fields[{index}]"))
                evidence_errors, evidence_warnings = self._validate_evidence(
                    raw_field,
                    text,
                    f"fields[{index}]",
                    reading_units=reading_units,
                    require_source_id=require_source_id,
                )
                errors.extend(evidence_errors)
                warnings.extend(evidence_warnings)

        if isinstance(raw_records, list):
            for index, raw_record in enumerate(raw_records):
                if not isinstance(raw_record, dict):
                    errors.append(f"records[{index}] must be an object")
                    continue
                form_path = str(raw_record.get("form_path") or "").strip().strip("/").replace("/", ".")
                if not form_path or form_path not in form_keys:
                    errors.append(f"records[{index}].form_path is not a schema form: {form_path or '<missing>'}")
                if self._is_empty(raw_record.get("record")):
                    errors.append(f"records[{index}].record is required")
                if raw_record.get("confidence") is None:
                    errors.append(f"records[{index}].confidence is required")
                evidence_errors, evidence_warnings = self._validate_evidence(
                    raw_record,
                    text,
                    f"records[{index}]",
                    reading_units=reading_units,
                    require_source_id=require_source_id,
                )
                errors.extend(evidence_errors)
                warnings.extend(evidence_warnings)
                if form_path and not self._is_empty(raw_record.get("record")):
                    for path, value in self._iter_record_leaf_values(form_path, raw_record.get("record")):
                        spec = by_path.get(path) or self._spec_for_indexed_path(path, by_path)
                        if spec is None:
                            errors.append(f"records[{index}] contains field not in schema: {path}")
                            continue
                        errors.extend(self._validate_scalar_value(value, str(spec.get("value_type") or "text"), spec, path))
        return errors, warnings, None

    def _validate_value_payload(self, raw_field: dict[str, Any], spec: dict[str, Any], label: str) -> list[str]:
        errors: list[str] = []
        value_type = str(raw_field.get("value_type") or spec.get("value_type") or "text")
        normalized_value_type = value_type if value_type in VALUE_SLOTS else "text"
        present_slots = [slot for slot in VALUE_SLOTS.values() if not self._is_empty(raw_field.get(slot))]
        if len(present_slots) > 1:
            errors.append(f"{label} must write only one value slot")
        if raw_field.get("confidence") is None:
            errors.append(f"{label}.confidence is required")
        expected_slot = VALUE_SLOTS[normalized_value_type]
        if not self._is_empty(raw_field.get("value")):
            errors.append(f"{label} must use {expected_slot}, not generic value")
        if present_slots and expected_slot not in present_slots:
            errors.append(f"{label} value_type={normalized_value_type} must use {expected_slot}")
        value = self._extract_raw_value(raw_field, normalized_value_type)
        if self._is_empty(value):
            errors.append(f"{label} value is required")
            return errors
        return errors + self._validate_scalar_value(value, normalized_value_type, spec, label)

    def _validate_scalar_value(self, value: Any, value_type: str, spec: dict[str, Any], label: str) -> list[str]:
        errors: list[str] = []
        normalized_value = self._normalize_enum_value(value, spec.get("options"))
        options = spec.get("options")
        if isinstance(options, list) and options:
            allowed = {str(option) for option in options}
            if isinstance(normalized_value, list):
                invalid_values = [item for item in normalized_value if str(item) not in allowed]
                if invalid_values:
                    errors.append(f"{label} enum values must be from {options}: {invalid_values}")
            elif str(normalized_value) not in allowed:
                errors.append(f"{label} enum value must be one of {options}: {value}")
        if value_type == "date" and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(value).strip()):
            errors.append(f"{label} date must be YYYY-MM-DD: {value}")
        if value_type == "datetime":
            try:
                datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
            except ValueError:
                errors.append(f"{label} datetime must be ISO format: {value}")
        return errors

    def _validate_evidence(
        self,
        item: dict[str, Any],
        text: str,
        label: str,
        *,
        reading_units: list[dict[str, Any]] | None = None,
        require_source_id: bool = False,
    ) -> tuple[list[str], list[str]]:
        errors: list[str] = []
        warnings: list[str] = []
        quotes = []
        evidences = item.get("evidences")
        if not isinstance(evidences, list) or not evidences:
            errors.append(f"{label}.evidences is required")
        if item.get("quote_text"):
            quotes.append(str(item["quote_text"]))
        if isinstance(evidences, list):
            for index, evidence in enumerate(evidences):
                if not isinstance(evidence, dict):
                    errors.append(f"{label}.evidences[{index}] must be an object")
                    continue
                if evidence.get("quote_text"):
                    quotes.append(str(evidence.get("quote_text")))
            if require_source_id:
                units_by_key, units_by_id = self._reading_unit_indexes(reading_units or [])
                for index, evidence in enumerate(evidences):
                    if not isinstance(evidence, dict):
                        continue
                    source_id = self._evidence_source_id(evidence)
                    if not source_id:
                        errors.append(f"{label} evidences[{index}] missing source_id")
                        continue
                    source_type = evidence.get("source_type")
                    unit = units_by_key.get((str(source_type), str(source_id))) if source_type else None
                    unit = unit or units_by_id.get(str(source_id))
                    if unit is None:
                        errors.append(f"{label} evidences[{index}] source_id is not in reading_units: {source_id}")
                        continue
                    quote = str(evidence.get("quote_text") or "")
                    if quote and quote not in str(unit.get("text") or ""):
                        errors.append(f"{label} evidences[{index}] quote_text is not from source_id {source_id}: {quote}")
        warnings.extend(
            self._quote_validation_warnings(quotes, text=text, reading_units=reading_units, label=label)
        )
        return errors, warnings

    def _evidence_source_id(self, evidence: dict[str, Any]) -> Any:
        return evidence.get("source_id") or evidence.get("line_id") or evidence.get("block_id") or evidence.get("cell_key")

    def _reading_unit_indexes(
        self,
        reading_units: list[dict[str, Any]],
    ) -> tuple[dict[tuple[str, str], dict[str, Any]], dict[str, dict[str, Any]]]:
        by_key: dict[tuple[str, str], dict[str, Any]] = {}
        by_id: dict[str, dict[str, Any]] = {}
        for unit in reading_units:
            if not isinstance(unit, dict) or not unit.get("source_id"):
                continue
            source_id = str(unit.get("source_id"))
            by_id.setdefault(source_id, unit)
            if unit.get("source_type"):
                by_key[(str(unit.get("source_type")), source_id)] = unit
        return by_key, by_id

    def _can_sanitize_validation_errors(self, errors: list[str]) -> bool:
        return bool(errors) and all(re.match(r"^(fields|records)\[\d+\]", str(error or "")) for error in errors)

    def _sanitize_invalid_items(self, raw_output: Any, errors: list[str]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        if not isinstance(raw_output, dict):
            return {}, []
        sanitized = dict(raw_output)
        discarded: list[dict[str, Any]] = []
        for key in ("fields", "records"):
            indexes = self._error_indexes(errors, key)
            values = raw_output.get(key)
            if not indexes or not isinstance(values, list):
                continue
            kept = []
            for index, value in enumerate(values):
                if index in indexes:
                    discarded.append(
                        {
                            "kind": key[:-1],
                            "index": index,
                            "item": value,
                            "reasons": self._reasons_for_error_index(errors, key, index),
                        }
                    )
                    continue
                kept.append(value)
            sanitized[key] = kept
        return sanitized, discarded

    def _error_indexes(self, errors: list[str], key: str) -> set[int]:
        indexes: set[int] = set()
        pattern = re.compile(rf"^{re.escape(key)}\[(\d+)\]")
        for error in errors:
            match = pattern.match(str(error or ""))
            if match:
                indexes.add(int(match.group(1)))
        return indexes

    def _reasons_for_error_index(self, errors: list[str], key: str, index: int) -> list[str]:
        prefix = f"{key}[{index}]"
        return [error for error in errors if str(error or "").startswith(prefix)]

    def _quote_validation_warnings(
        self,
        quotes: list[str],
        *,
        text: str,
        reading_units: list[dict[str, Any]] | None,
        label: str,
    ) -> list[str]:
        warnings: list[str] = []
        unit_texts = [
            str(unit.get("text") or "")
            for unit in (reading_units or [])
            if isinstance(unit, dict) and str(unit.get("text") or "").strip()
        ]
        for quote in quotes:
            if not quote:
                continue
            if unit_texts:
                if any(quote in unit_text for unit_text in unit_texts):
                    continue
                if quote in text:
                    continue
            elif quote in text:
                continue
            warnings.append(f"{label} quote_text must be an OCR substring: {quote}")
        return warnings

    def _iter_record_leaf_values(self, prefix: str, node: Any):
        if isinstance(node, dict):
            for key, value in node.items():
                yield from self._iter_record_leaf_values(f"{prefix}.{key}", value)
            return
        if isinstance(node, list):
            for index, value in enumerate(node):
                yield from self._iter_record_leaf_values(f"{prefix}.{index}", value)
            return
        if not self._is_empty(node):
            yield prefix, node
