from __future__ import annotations

import asyncio
from typing import Any

from fastapi import HTTPException, status

from app.models import DataContext, FieldCurrentValue, RecordInstance, SchemaTemplateVersion
from app.services.record_instance_label import record_instance_label
from app.services.schema_field_planner import schema_top_level_forms


class EhrContextMixin:
    async def get_or_create_patient_ehr_context(
        self,
        *,
        patient_id: str,
        schema_version: SchemaTemplateVersion,
        created_by: str | None = None,
    ) -> DataContext:
        context = await self.context_repository.get_patient_ehr(patient_id, schema_version.id)
        if context is not None:
            return context

        context = await self.context_repository.create(
            {
                "context_type": "patient_ehr",
                "patient_id": patient_id,
                "schema_version_id": schema_version.id,
                "status": "draft",
                "created_by": created_by,
            }
        )
        await self.initialize_default_record_instances(context_id=context.id, schema_json=schema_version.schema_json)
        return context

    async def get_patient_ehr_schema(self, patient_id: str, *, owner_id: str | None = None) -> dict[str, Any]:
        await self._ensure_patient_access(patient_id, owner_id=owner_id)
        schema_version = await self.schema_service.get_latest_published("ehr")
        if schema_version is None:
            context = await self.context_repository.get_latest_patient_ehr(patient_id)
            if context is not None:
                schema_version = await self.schema_service.get_version(context.schema_version_id)
        return {"schema": schema_version.schema_json if schema_version else None}

    async def get_patient_ehr(
        self,
        patient_id: str,
        *,
        created_by: str | None = None,
        owner_id: str | None = None,
    ) -> dict[str, Any]:
        await self._ensure_patient_access(patient_id, owner_id=owner_id)
        schema_version = await self.schema_service.get_latest_published("ehr")

        context = None
        if schema_version is not None:
            context = await self.get_or_create_patient_ehr_context(
                patient_id=patient_id,
                schema_version=schema_version,
                created_by=created_by,
            )
        else:
            context = await self.context_repository.get_latest_patient_ehr(patient_id)
            if context is not None:
                schema_version = await self.schema_service.get_version(context.schema_version_id)

        if context is None or schema_version is None:
            return {"context": None, "schema": None, "records": [], "current_values": {}}

        records, current_values = await asyncio.gather(
            self.record_repository.list_by_context(context.id),
            self.current_repository.list_by_context(context.id),
        )
        if not records:
            records = await self.initialize_default_record_instances(context_id=context.id, schema_json=schema_version.schema_json)
        return {
            "context": context,
            "schema": schema_version.schema_json,
            "records": records,
            "current_values": self._current_values_by_display_path(current_values, schema_version.schema_json, records),
        }

    async def _ensure_patient_access(self, patient_id: str, *, owner_id: str | None = None):
        patient = await self.patient_repository.get_active_by_id(patient_id, owner_id=owner_id)
        if patient is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
        return patient

    async def _get_patient_context_or_404(self, patient_id: str, *, owner_id: str | None = None) -> DataContext:
        await self._ensure_patient_access(patient_id, owner_id=owner_id)
        context = await self.context_repository.get_latest_patient_ehr(patient_id)
        if context is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient EHR context not found")
        return context

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

    async def initialize_default_record_instances(
        self,
        *,
        context_id: str,
        schema_json: dict[str, Any],
    ) -> list[RecordInstance]:
        created: list[RecordInstance] = []
        for form in schema_top_level_forms(schema_json):
            existing = await self.record_repository.get_by_form(
                context_id=context_id,
                form_key=form["form_key"],
                repeat_index=0,
            )
            if existing is not None:
                continue
            created.append(
                await self.record_repository.create(
                    {
                        "context_id": context_id,
                        "group_key": form.get("group_key"),
                        "group_title": form.get("group_title"),
                        "form_key": form["form_key"],
                        "form_title": form["form_title"] or form["form_key"],
                        "repeat_index": 0,
                        "instance_label": record_instance_label(form.get("form_title"), form.get("form_key"), 0),
                        "review_status": "unreviewed",
                    }
                )
            )
        return created
