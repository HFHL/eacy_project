from __future__ import annotations

from datetime import datetime
from typing import Any

from app.models import DataContext, FieldCurrentValue, Patient, ProjectPatient, ResearchProject
from app.services.research_project_export_types import ExportField


class ResearchProjectExportRowsMixin:
    def _build_wide_rows(
        self,
        project: ResearchProject,
        fields: list[ExportField],
        form_order: list[tuple[str, str]],
        datasets: list[dict[str, Any]],
        expand_repeatable_rows: bool,
    ) -> list[list[Any]]:
        base_headers = self._base_headers()
        form_fields = {form_key: [field for field in fields if field.form_key == form_key] for form_key, _ in form_order}
        headers = [*base_headers]
        for form_key, form_title in form_order:
            headers.append(f"{form_title}__记录序号")
            headers.extend(self._unique_field_headers(form_fields.get(form_key, []), include_group=True))
        rows = [headers]
        for item in datasets:
            expanded_by_form = {
                form_key: self._expanded_form_rows(item, self._records_for_form(item["records"], form_key), form_fields.get(form_key, []), expand_repeatable_rows)
                for form_key, _ in form_order
            }
            max_count = max([len(expanded) for expanded in expanded_by_form.values()] or [1])
            for row_index in range(max(max_count, 1)):
                row = self._base_values(project, item["project_patient"], item["patient"], item["context"])
                for form_key, _ in form_order:
                    expanded = expanded_by_form.get(form_key) or []
                    record, nested_index, value_map = expanded[row_index] if row_index < len(expanded) else (None, None, {})
                    record_label = ""
                    if record is not None:
                        record_label = record.repeat_index + 1
                        if nested_index is not None:
                            record_label = f"{record_label}.{nested_index + 1}"
                    row.append(record_label)
                    for field in form_fields.get(form_key, []):
                        row.append(self._display_value(value_map.get(field.field_path)))
                rows.append(row)
        return self._drop_empty_and_duplicate_columns(rows, protected_columns=len(base_headers))

    def _build_overview_rows(
        self,
        project: ResearchProject,
        binding: Any,
        schema_version: Any,
        datasets: list[dict[str, Any]],
        fields: list[ExportField],
    ) -> list[list[Any]]:
        records_count = sum(len(item["records"]) for item in datasets)
        values_count = 0
        for item in datasets:
            context = item["context"]
            if context is None:
                continue
            for (context_id, _), values in item["values"].items():
                if context_id == context.id:
                    values_count += sum(1 for value in values.values() if self._is_meaningful(self._display_value(value)))
        return [
            ["项目名称", project.project_name],
            ["项目编号", project.project_code],
            ["项目状态", project.status],
            ["模板ID", getattr(binding, "schema_template_id", "") or ""],
            ["模板版本ID", getattr(schema_version, "id", "") or ""],
            ["患者数量", len(datasets)],
            ["记录数量", records_count],
            ["字段数量", len(fields)],
            ["非空取值数量", values_count],
            ["导出时间", datetime.now().strftime("%Y-%m-%d %H:%M:%S")],
        ]

    def _build_patient_rows(
        self,
        project: ResearchProject,
        fields: list[ExportField],
        form_order: list[tuple[str, str]],
        datasets: list[dict[str, Any]],
    ) -> list[list[Any]]:
        headers = [*self._patient_headers(), *self._unique_field_headers(fields, include_group=True)]
        rows = [headers]
        for item in datasets:
            value_map = self._patient_collapsed_values(item, fields, form_order)
            row = [*self._patient_values(project, item["project_patient"], item["patient"], item["context"], value_map, fields)]
            row.extend(self._display_value(value_map.get(field.field_path)) for field in fields)
            rows.append(row)
        return self._drop_empty_and_duplicate_columns(rows, protected_columns=len(self._patient_headers()))

    def _build_long_rows(self, fields: list[ExportField], datasets: list[dict[str, Any]]) -> list[list[Any]]:
        field_by_path = {self._normalize_indexed_path(field.field_path): field for field in fields}
        headers = ["编号", "患者ID", "患者姓名", "分组", "状态", "来源", "字段组", "字段", "记录序号", "溯源等级", "来源文档ID", "字段路径", "值"]
        rows = [headers]
        for item in datasets:
            project_patient = item["project_patient"]
            patient = item["patient"]
            for record in self._sorted_records(item["records"]):
                values = self._values_for_record(item, record)
                for raw_path, current in sorted(values.items(), key=lambda pair: pair[0]):
                    value = self._display_value(current)
                    if not self._is_meaningful(value):
                        continue
                    field = field_by_path.get(self._normalize_indexed_path(raw_path))
                    rows.append(
                        [
                            project_patient.enroll_no or project_patient.id,
                            patient.id,
                            patient.name,
                            getattr(field, "form_title", "") or record.form_key,
                            project_patient.status,
                            record.form_key,
                            getattr(field, "group_title", "") or "",
                            getattr(field, "field_title", "") or current.field_key,
                            record.repeat_index + 1,
                            current.review_status or "",
                            current.selected_event_id or "",
                            raw_path,
                            value,
                        ]
                    )
        return rows

    def _build_dictionary_rows(
        self,
        fields: list[ExportField],
        form_order: list[tuple[str, str]],
        datasets: list[dict[str, Any]],
    ) -> list[list[Any]]:
        used_paths = self._used_field_paths(fields, form_order, datasets)
        rows = [["字段组", "组ID", "字段路径", "显示名", "所属表单", "值类型", "在宽表中的列名"]]
        headers = self._unique_field_headers(fields, include_group=True)
        for field, header in zip(fields, headers, strict=False):
            if field.field_path not in used_paths:
                continue
            rows.append([field.group_title, field.group_key, field.field_path, field.field_title, field.form_title, field.value_type, header])
        return rows

    def _build_form_rows(
        self,
        form_key: str,
        fields: list[ExportField],
        datasets: list[dict[str, Any]],
        expand_repeatable_rows: bool,
    ) -> list[list[Any]]:
        field_headers = self._unique_field_headers(fields, include_group=False)
        rows = [["编号", "患者姓名", "序号", *field_headers]]
        for item in datasets:
            records = self._records_for_form(item["records"], form_key)
            for record, nested_index, value_map in self._expanded_form_rows(item, records, fields, expand_repeatable_rows):
                if record is None and not any(self._is_meaningful(self._display_value(value_map.get(field.field_path))) for field in fields):
                    continue
                sequence = ""
                if record is not None:
                    sequence = record.repeat_index + 1
                    if nested_index is not None:
                        sequence = f"{sequence}.{nested_index + 1}"
                row = [item["project_patient"].enroll_no or item["project_patient"].id, item["patient"].name, sequence]
                row.extend(self._display_value(value_map.get(field.field_path)) for field in fields)
                rows.append(row)
        return self._drop_empty_and_duplicate_columns(rows, protected_columns=3)

    def _base_headers(self) -> list[str]:
        return ["项目编号", "项目名称", "项目患者ID", "入组编号", "入组状态", "患者ID", "姓名", "性别", "年龄", "出生日期", "科室", "主要诊断"]

    def _base_values(self, project: ResearchProject | None, project_patient: ProjectPatient, patient: Patient, context: DataContext | None) -> list[Any]:
        return [
            project.project_code if project is not None else "",
            project.project_name if project is not None else "",
            project_patient.id,
            project_patient.enroll_no or "",
            project_patient.status,
            patient.id,
            patient.name,
            patient.gender or "",
            patient.age if patient.age is not None else "",
            patient.birth_date.isoformat() if patient.birth_date else "",
            patient.department or "",
            patient.main_diagnosis or "",
        ]

    def _patient_headers(self) -> list[str]:
        return ["编号", "患者ID", "患者姓名", "分组", "状态", "CRF完整度(%)", "性别", "年龄", "出生日期", "科室", "主要诊断"]

    def _patient_values(
        self,
        project: ResearchProject | None,
        project_patient: ProjectPatient,
        patient: Patient,
        context: DataContext | None,
        value_map: dict[str, FieldCurrentValue],
        fields: list[ExportField],
    ) -> list[Any]:
        return [
            project_patient.enroll_no or project_patient.id,
            patient.id,
            patient.name,
            project.project_name if project is not None else "",
            project_patient.status,
            self._completion_percent(value_map, fields),
            patient.gender or "",
            patient.age if patient.age is not None else "",
            patient.birth_date.isoformat() if patient.birth_date else "",
            patient.department or "",
            patient.main_diagnosis or "",
        ]

    def _completion_percent(self, value_map: dict[str, FieldCurrentValue], fields: list[ExportField]) -> float | str:
        if not fields:
            return ""
        filled = sum(1 for field in fields if self._is_meaningful(self._display_value(value_map.get(field.field_path))))
        return round(filled * 100 / len(fields), 2)
