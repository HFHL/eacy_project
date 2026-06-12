from __future__ import annotations

from typing import Any

from app.services.research_project_export_types import ExportField
from app.services.schema_field_planner import plan_schema_fields, schema_top_level_forms


class ResearchProjectExportSchemaMixin:
    def _dedupe_export_fields(self, fields: list[ExportField]) -> list[ExportField]:
        unique: list[ExportField] = []
        seen: set[str] = set()
        for field in fields:
            key = self._normalize_indexed_path(field.field_path) or field.field_path or field.field_key
            if key in seen:
                continue
            seen.add(key)
            unique.append(field)
        return unique

    def _build_export_fields(self, schema_json: dict[str, Any]) -> list[ExportField]:
        planned = plan_schema_fields(schema_json)
        return [
            ExportField(
                field_path=field.field_path,
                field_key=field.field_key,
                field_title=field.field_title,
                value_type=field.value_type,
                group_key=field.group_key or "",
                group_title=field.group_title or field.group_key or "",
                form_key=field.record_form_key or field.group_key or "CRF",
                form_title=field.record_form_title or field.group_title or field.record_form_key or "CRF",
            )
            for field in planned
        ]

    def _build_form_order(self, schema_json: dict[str, Any], fields: list[ExportField]) -> list[tuple[str, str]]:
        ordered: list[tuple[str, str]] = []
        seen: set[str] = set()
        for form in schema_top_level_forms(schema_json):
            form_key = str(form.get("form_key") or "")
            if form_key and form_key not in seen:
                ordered.append((form_key, str(form.get("form_title") or form_key)))
                seen.add(form_key)
        for field in fields:
            if field.form_key not in seen:
                ordered.append((field.form_key, field.form_title))
                seen.add(field.form_key)
        return ordered
