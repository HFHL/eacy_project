from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any

from app.models import FieldCurrentValue, RecordInstance
from app.services.research_project_export_types import ExportField


class ResearchProjectExportValuesMixin:
    def _records_for_form(self, records: list[RecordInstance], form_key: str) -> list[RecordInstance]:
        matched = [record for record in records if record.form_key == form_key]
        return sorted(matched, key=lambda item: (item.repeat_index, item.created_at or datetime.min))

    def _sorted_records(self, records: list[RecordInstance]) -> list[RecordInstance]:
        return sorted(records, key=lambda item: (item.form_key or "", item.repeat_index, item.created_at or datetime.min))

    def _values_for_record(self, item: dict[str, Any], record: RecordInstance | None) -> dict[str, FieldCurrentValue]:
        if record is None:
            return {}
        return item["values"].get((record.context_id, record.id), {})

    def _expanded_form_rows(
        self,
        item: dict[str, Any],
        records: list[RecordInstance],
        fields: list[ExportField],
        expand_repeatable_rows: bool,
    ) -> list[tuple[RecordInstance | None, int | None, dict[str, FieldCurrentValue]]]:
        if not records:
            return [(None, None, {})]
        target_records = records if expand_repeatable_rows else records[:1]
        rows: list[tuple[RecordInstance | None, int | None, dict[str, FieldCurrentValue]]] = []
        field_paths = [field.field_path for field in fields]
        for record in target_records:
            values = self._values_for_record(item, record)
            if not expand_repeatable_rows:
                rows.append((record, None, self._collapse_values_for_fields(values, field_paths)))
                continue
            indexed_values = self._indexed_value_maps(values, field_paths)
            if indexed_values:
                for nested_index in sorted(indexed_values):
                    merged = self._collapse_values_for_fields(values, field_paths)
                    merged.update(indexed_values[nested_index])
                    rows.append((record, nested_index, merged))
            else:
                rows.append((record, None, self._collapse_values_for_fields(values, field_paths)))
        return rows or [(None, None, {})]

    def _collapse_values_for_fields(self, values: dict[str, FieldCurrentValue], field_paths: list[str]) -> dict[str, FieldCurrentValue]:
        return {
            field_path: self._find_current_value(values, field_path)
            for field_path in field_paths
            if self._find_current_value(values, field_path) is not None
        }

    def _indexed_value_maps(self, values: dict[str, FieldCurrentValue], field_paths: list[str]) -> dict[int, dict[str, FieldCurrentValue]]:
        indexed: dict[int, dict[str, FieldCurrentValue]] = {}
        normalized_fields = {self._normalize_indexed_path(field_path): field_path for field_path in field_paths}
        for raw_path, current in values.items():
            nested_index = self._first_path_index(raw_path)
            if nested_index is None:
                nested_index = self._json_array_row_count(current)
                if nested_index is not None:
                    base_path = self._normalize_indexed_path(raw_path)
                    target_path = normalized_fields.get(base_path)
                    if target_path:
                        for row_index, row_current in self._split_json_array_current(current):
                            indexed.setdefault(row_index, {})[target_path] = row_current
                continue
            normalized = self._normalize_indexed_path(raw_path)
            target_path = normalized_fields.get(normalized)
            if target_path:
                indexed.setdefault(nested_index, {})[target_path] = current
        return indexed

    def _find_current_value(self, values: dict[str, FieldCurrentValue], field_path: str) -> FieldCurrentValue | None:
        if field_path in values:
            return values[field_path]
        normalized = self._normalize_indexed_path(field_path)
        for raw_path, current in values.items():
            if self._normalize_indexed_path(raw_path) == normalized and self._first_path_index(raw_path) is None:
                return current
        return None

    def _normalize_indexed_path(self, field_path: str) -> str:
        return ".".join(part for part in str(field_path or "").replace("/", ".").split(".") if part and not part.isdigit())

    def _first_path_index(self, field_path: str) -> int | None:
        for part in str(field_path or "").replace("/", ".").split("."):
            if part.isdigit():
                return int(part)
        bracket = re.search(r"\[(\d+)\]", str(field_path or ""))
        return int(bracket.group(1)) if bracket else None

    def _json_array_row_count(self, current: FieldCurrentValue) -> int | None:
        value = current.value_json
        if isinstance(value, list) and value and all(isinstance(item, dict) for item in value):
            return 0
        return None

    def _split_json_array_current(self, current: FieldCurrentValue) -> list[tuple[int, FieldCurrentValue]]:
        value = current.value_json
        if not isinstance(value, list):
            return []
        result = []
        for index, item in enumerate(value):
            clone = FieldCurrentValue(
                id=current.id,
                context_id=current.context_id,
                record_instance_id=current.record_instance_id,
                field_key=current.field_key,
                field_path=current.field_path,
                value_type="json",
                value_json=item,
                updated_at=current.updated_at,
                review_status=current.review_status,
            )
            result.append((index, clone))
        return result

    def _display_value(self, current: FieldCurrentValue | None) -> Any:
        if current is None:
            return ""
        if current.value_json is not None:
            return self._flatten_json(current.value_json)
        if current.value_number is not None:
            try:
                return float(current.value_number)
            except (TypeError, ValueError):
                return str(current.value_number)
        if current.value_date is not None:
            return current.value_date.isoformat()
        if current.value_datetime is not None:
            return current.value_datetime.isoformat()
        return current.value_text or ""

    def _flatten_json(self, value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, list):
            if all(not isinstance(item, (dict, list)) for item in value):
                return ", ".join(str(item) for item in value if item is not None)
            return "\n".join(self._flatten_json(item) for item in value)
        if isinstance(value, dict):
            return "; ".join(f"{key}: {self._flatten_json(val)}" for key, val in value.items())
        if isinstance(value, (datetime, date)):
            return value.isoformat()
        return str(value)

    def _field_header(self, field: ExportField, *, include_group: bool) -> str:
        parts: list[str] = []
        title = field.field_title or field.field_key
        title_parts = [part for part in str(title or "").split("__") if part]
        title_prefixes = set(title_parts[:-1])

        def append_part(part: str) -> None:
            clean = str(part or "").strip()
            if not clean or clean in parts or clean in title_prefixes:
                return
            parts.append(clean)

        if include_group:
            append_part(field.group_title)
        append_part(field.form_title)
        for part in title_parts or [title]:
            append_part(part)
        return "__".join(part for part in parts if part)

    def _unique_field_headers(self, fields: list[ExportField], *, include_group: bool) -> list[str]:
        primary = [self._field_header(field, include_group=include_group) for field in fields]
        duplicates = {header for header in primary if primary.count(header) > 1}
        headers: list[str] = []
        used: dict[str, int] = {}
        for field, header in zip(fields, primary, strict=False):
            if header in duplicates and not include_group and field.group_title:
                header = self._field_header(field, include_group=True)
            header = self._compact_header(header)
            if header in used:
                header = self._compact_header(f"{header}__{field.field_key or field.field_path}")
            count = used.get(header, 0)
            used[header] = count + 1
            if count:
                header = self._compact_header(f"{header}_{count + 1}")
            headers.append(header)
        return headers

    def _compact_header(self, header: str) -> str:
        parts: list[str] = []
        for part in str(header or "").split("__"):
            clean = part.strip()
            if not clean or clean in parts:
                continue
            parts.append(clean)
        return "__".join(parts)

    def _drop_empty_and_duplicate_columns(self, rows: list[list[Any]], *, protected_columns: int) -> list[list[Any]]:
        if not rows:
            return rows
        width = max(len(row) for row in rows)
        normalized_rows = [row + [""] * (width - len(row)) for row in rows]
        keep_indexes: list[int] = []
        seen_signatures: set[tuple[str, tuple[str, ...]]] = set()
        for index in range(width):
            header = self._normalize_header(normalized_rows[0][index])
            column_values = tuple(self._normalize_cell(row[index]) for row in normalized_rows[1:])
            is_protected = index < protected_columns
            if not is_protected and not any(column_values):
                continue
            signature = (header, column_values)
            if not is_protected and signature in seen_signatures:
                continue
            seen_signatures.add(signature)
            keep_indexes.append(index)
        return [[row[index] for index in keep_indexes] for row in normalized_rows]

    def _normalize_header(self, value: Any) -> str:
        return re.sub(r"\s+", "", str(value or "")).lower()

    def _normalize_cell(self, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()

    def _is_meaningful(self, value: Any) -> bool:
        if value is None:
            return False
        if isinstance(value, str):
            return bool(value.strip())
        return True

    def _patient_collapsed_values(
        self,
        item: dict[str, Any],
        fields: list[ExportField],
        form_order: list[tuple[str, str]],
    ) -> dict[str, FieldCurrentValue]:
        collapsed: dict[str, FieldCurrentValue] = {}
        form_fields = {form_key: [field for field in fields if field.form_key == form_key] for form_key, _ in form_order}
        for form_key, _ in form_order:
            records = self._records_for_form(item["records"], form_key)
            if not records:
                continue
            values = self._values_for_record(item, records[0])
            for field in form_fields.get(form_key, []):
                current = self._find_current_value(values, field.field_path)
                if current is not None and self._is_meaningful(self._display_value(current)):
                    collapsed[field.field_path] = current
        return collapsed

    def _used_field_paths(
        self,
        fields: list[ExportField],
        form_order: list[tuple[str, str]],
        datasets: list[dict[str, Any]],
    ) -> set[str]:
        used: set[str] = set()
        for item in datasets:
            value_map = self._patient_collapsed_values(item, fields, form_order)
            for field_path, current in value_map.items():
                if self._is_meaningful(self._display_value(current)):
                    used.add(field_path)
            for record in item["records"]:
                values = self._values_for_record(item, record)
                for raw_path, current in values.items():
                    if not self._is_meaningful(self._display_value(current)):
                        continue
                    normalized = self._normalize_indexed_path(raw_path)
                    for field in fields:
                        if self._normalize_indexed_path(field.field_path) == normalized:
                            used.add(field.field_path)
                            break
        return used
