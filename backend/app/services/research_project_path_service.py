from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select, text

from app.models import (
    DataContext,
    FieldCurrentValue,
    FieldValueEvent,
    FieldValueEvidence,
    ProjectPatient,
    ProjectTemplateBinding,
    RecordInstance,
    ResearchProject,
    User,
)
from app.repositories import DataContextRepository
from app.services.record_instance_label import record_instance_label
from app.services.research_project_errors import ResearchProjectConflictError, ResearchProjectNotFoundError
from app.services.schema_field_planner import schema_dataset_group_paths, schema_leaf_paths, schema_top_level_forms
from core.db import Transactional, session


class ResearchProjectPathMixin:
    def _canonical_field_path(self, field_path: str) -> str:
        parts = [part for part in str(field_path or "").split(".") if part and not part.isdigit()]
        return ".".join(parts)

    def _storage_field_path(self, field_path: str) -> str:
        raw_path = ".".join(part for part in str(field_path or "").replace("/", ".").split(".") if part)
        return self._canonical_field_path(raw_path)

    def _field_key_from_path(self, field_path: str) -> str:
        parts = [part for part in str(field_path or "").split(".") if part and not part.isdigit()]
        return parts[-1] if parts else str(field_path or "")

    def _field_path_aliases(self, field_path: str) -> list[str]:
        raw_path = str(field_path or "").strip()
        canonical_path = self._canonical_field_path(raw_path)
        return list(dict.fromkeys(path for path in [raw_path, canonical_path] if path))

    async def _resolve_existing_field_path(
        self,
        *,
        context_id: str,
        field_path: str,
        record_instance_id: str | None = None,
    ) -> str:
        current_values = await self.current_repository.list_by_context(context_id)
        existing_paths = {
            value.field_path
            for value in current_values
            if record_instance_id is None or value.record_instance_id == record_instance_id
        }
        for query_path in self._field_path_aliases(field_path):
            if query_path in existing_paths:
                return query_path
        return self._canonical_field_path(field_path)

    async def _resolve_query_record_id(
        self,
        *,
        context_id: str,
        field_path: str,
        record_instance_id: str | None,
    ) -> str | None:
        if record_instance_id is not None:
            record = await self._resolve_record(context_id, record_instance_id)
            if self._record_matches_field_path(record, field_path):
                return record.id
        if record_instance_id is None and not self._path_has_index(field_path):
            return None
        form_key = self._record_form_key_from_path(field_path)
        if not form_key:
            return None
        repeat_index = self._repeat_index_from_path(field_path, form_key)
        record = await self.record_repository.get_by_form(
            context_id=context_id,
            form_key=form_key,
            repeat_index=repeat_index,
        )
        return record.id if record is not None else None

    def _current_values_by_display_path(
        self,
        current_values: list[FieldCurrentValue],
        schema_json: dict[str, Any] | None,
        records: list[RecordInstance] | None = None,
    ) -> dict[str, FieldCurrentValue]:
        output: dict[str, FieldCurrentValue] = {}
        original_paths: dict[str, str] = {}
        records_by_id = {record.id: record for record in records or []}
        hidden_record_ids = self._hidden_scalar_only_lab_record_ids(current_values, records_by_id)
        display_repeat_indexes = self._display_repeat_indexes(
            current_values,
            records_by_id,
            hidden_record_ids=hidden_record_ids,
        )
        for value in current_values:
            if value.record_instance_id in hidden_record_ids:
                continue
            display_path = self._display_path_for_current_value(
                value,
                schema_json,
                records_by_id,
                display_repeat_indexes,
            )
            existing_path = original_paths.get(display_path)
            if existing_path is not None and self._path_has_index(existing_path) and not self._path_has_index(value.field_path):
                continue
            output[display_path] = value
            original_paths[display_path] = value.field_path
        return output

    def _display_repeat_indexes(
        self,
        current_values: list[FieldCurrentValue],
        records_by_id: dict[str, RecordInstance],
        *,
        hidden_record_ids: set[str] | None = None,
    ) -> dict[str, int]:
        hidden_record_ids = hidden_record_ids or set()
        record_ids_with_values = {
            value.record_instance_id
            for value in current_values
            if value.record_instance_id not in hidden_record_ids
        }
        records_by_form: dict[str, list[RecordInstance]] = {}
        for record_id in record_ids_with_values:
            record = records_by_id.get(record_id)
            if record is None:
                continue
            records_by_form.setdefault(record.form_key, []).append(record)

        display_indexes: dict[str, int] = {}
        for form_records in records_by_form.values():
            ordered = sorted(
                form_records,
                key=lambda record: (
                    int(getattr(record, "repeat_index", 0) or 0),
                    str(getattr(record, "created_at", "") or ""),
                    str(getattr(record, "id", "") or ""),
                ),
            )
            for display_index, record in enumerate(ordered):
                display_indexes[record.id] = display_index
        return display_indexes

    def _hidden_scalar_only_lab_record_ids(
        self,
        current_values: list[FieldCurrentValue],
        records_by_id: dict[str, RecordInstance],
    ) -> set[str]:
        values_by_record: dict[str, list[FieldCurrentValue]] = {}
        for value in current_values:
            record = records_by_id.get(value.record_instance_id)
            if record is None:
                continue
            values_by_record.setdefault(value.record_instance_id, []).append(value)

        forms_with_table_values: set[str] = set()
        records_with_table_values: set[str] = set()
        for record_id, values in values_by_record.items():
            record = records_by_id.get(record_id)
            if record is None:
                continue
            if any(self._is_lab_result_table_value(value, record.form_key) for value in values):
                forms_with_table_values.add(record.form_key)
                records_with_table_values.add(record_id)

        hidden_record_ids: set[str] = set()
        for record_id in values_by_record:
            record = records_by_id.get(record_id)
            if record is None:
                continue
            if not str(record.form_key or "").startswith("实验室检查."):
                continue
            if record.form_key not in forms_with_table_values:
                continue
            if record_id in records_with_table_values:
                continue
            hidden_record_ids.add(record_id)
        return hidden_record_ids

    def _is_lab_result_table_value(self, value: FieldCurrentValue, form_key: str) -> bool:
        field_path = str(value.field_path or "")
        return (
            field_path == f"{form_key}.检验结果"
            and (
                getattr(value, "value_type", None) == "json"
                or getattr(value, "value_json", None) is not None
            )
        )

    def _display_path_for_current_value(
        self,
        value: FieldCurrentValue,
        schema_json: dict[str, Any] | None,
        records_by_id: dict[str, RecordInstance],
        display_repeat_indexes: dict[str, int] | None = None,
    ) -> str:
        display_path = self._schema_display_path(value.field_path, schema_json)
        record = records_by_id.get(value.record_instance_id)
        if record is None:
            return display_path
        repeat_index = (
            display_repeat_indexes.get(record.id)
            if display_repeat_indexes is not None and record.id in display_repeat_indexes
            else int(record.repeat_index or 0)
        )
        if repeat_index <= 0:
            return display_path
        return self._replace_display_repeat_index(
            display_path=display_path,
            form_key=record.form_key,
            repeat_index=repeat_index,
        )

    def _replace_display_repeat_index(self, *, display_path: str, form_key: str, repeat_index: int) -> str:
        parts = [part for part in str(display_path or "").split(".") if part]
        form_parts = [part for part in str(form_key or "").split(".") if part]
        if not form_parts or parts[: len(form_parts)] != form_parts:
            return display_path
        index_position = len(form_parts)
        if index_position < len(parts) and parts[index_position].isdigit():
            parts[index_position] = str(repeat_index)
        else:
            parts.insert(index_position, str(repeat_index))
        return ".".join(parts)

    def _schema_display_path(self, field_path: str, schema_json: dict[str, Any] | None) -> str:
        if not isinstance(schema_json, dict):
            return field_path
        parts = [part for part in str(field_path or "").split(".") if part]
        if not parts:
            return field_path
        output: list[str] = []
        schema_node: Any = schema_json
        index = 0
        while index < len(parts):
            if self._is_schema_array_record(schema_node):
                part = parts[index]
                if part.isdigit():
                    output.append(part)
                    index += 1
                else:
                    output.append("0")
                schema_node = (schema_node.get("items") or {}) if isinstance(schema_node, dict) else {}
                continue

            part = parts[index]
            output.append(part)
            schema_node = (
                (schema_node.get("properties") or {}).get(part)
                if isinstance(schema_node, dict) and isinstance(schema_node.get("properties"), dict)
                else None
            )
            index += 1
        return ".".join(output)

    def _is_schema_array_record(self, schema_node: Any) -> bool:
        return (
            isinstance(schema_node, dict)
            and schema_node.get("type") == "array"
            and isinstance((schema_node.get("items") or {}).get("properties"), dict)
        )

    def _path_has_index(self, field_path: str) -> bool:
        return any(part.isdigit() for part in str(field_path or "").split("."))

    def _event_display_value(self, event: FieldValueEvent) -> Any:
        if event.value_json is not None:
            return event.value_json
        if event.value_number is not None:
            return float(event.value_number)
        if event.value_date is not None:
            return event.value_date.isoformat()
        if event.value_datetime is not None:
            return event.value_datetime.isoformat()
        return event.value_text

    def _current_display_value(self, current: FieldCurrentValue) -> Any:
        if current.value_json is not None:
            return current.value_json
        if current.value_number is not None:
            return float(current.value_number)
        if current.value_date is not None:
            return current.value_date.isoformat()
        if current.value_datetime is not None:
            return current.value_datetime.isoformat()
        return current.value_text
