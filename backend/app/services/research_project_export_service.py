from __future__ import annotations

import html
import re
import zipfile
from dataclasses import dataclass
from datetime import date, datetime
from io import BytesIO
from typing import Any

from sqlalchemy import select

from app.models import DataContext, FieldCurrentValue, Patient, ProjectPatient, RecordInstance, ResearchProject
from app.repositories import ProjectTemplateBindingRepository, ResearchProjectRepository
from app.services.research_project_service import ResearchProjectNotFoundError
from app.services.schema_field_planner import plan_schema_fields, schema_top_level_forms
from app.services.schema_service import SchemaService
from core.db import session


@dataclass(frozen=True)
class ExportField:
    field_path: str
    field_key: str
    field_title: str
    value_type: str
    group_key: str
    group_title: str
    form_key: str
    form_title: str


@dataclass(frozen=True)
class ExportRequest:
    scope: str = "all"
    patient_ids: tuple[str, ...] = ()
    expand_repeatable_rows: bool = True


class SimpleXlsxWriter:
    def __init__(self) -> None:
        self.sheets: list[tuple[str, list[list[Any]]]] = []

    def add_sheet(self, name: str, rows: list[list[Any]]) -> None:
        safe_name = self._safe_sheet_name(name)
        used = {item[0] for item in self.sheets}
        if safe_name in used:
            base = safe_name[:28]
            index = 2
            while f"{base}_{index}" in used:
                index += 1
            safe_name = f"{base}_{index}"
        self.sheets.append((safe_name, rows or [[]]))

    def to_bytes(self) -> bytes:
        buffer = BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("[Content_Types].xml", self._content_types())
            archive.writestr("_rels/.rels", self._root_rels())
            archive.writestr("xl/workbook.xml", self._workbook())
            archive.writestr("xl/_rels/workbook.xml.rels", self._workbook_rels())
            archive.writestr("xl/styles.xml", self._styles())
            for index, (_, rows) in enumerate(self.sheets, start=1):
                archive.writestr(f"xl/worksheets/sheet{index}.xml", self._worksheet(rows))
        return buffer.getvalue()

    def _safe_sheet_name(self, name: str) -> str:
        safe = re.sub(r"[\\/*?:\[\]]+", "_", str(name or "Sheet")).strip() or "Sheet"
        return safe[:31]

    def _content_types(self) -> str:
        sheet_overrides = "".join(
            f'<Override PartName="/xl/worksheets/sheet{idx}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            for idx in range(1, len(self.sheets) + 1)
        )
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            f'{sheet_overrides}'
            '</Types>'
        )

    def _root_rels(self) -> str:
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            '</Relationships>'
        )

    def _workbook(self) -> str:
        sheets = "".join(
            f'<sheet name="{html.escape(name)}" sheetId="{idx}" r:id="rId{idx}"/>'
            for idx, (name, _) in enumerate(self.sheets, start=1)
        )
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f'<sheets>{sheets}</sheets>'
            '</workbook>'
        )

    def _workbook_rels(self) -> str:
        rels = "".join(
            f'<Relationship Id="rId{idx}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{idx}.xml"/>'
            for idx in range(1, len(self.sheets) + 1)
        )
        rels += f'<Relationship Id="rId{len(self.sheets) + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f'{rels}'
            '</Relationships>'
        )

    def _styles(self) -> str:
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
            '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
            '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
            '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
            '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
            '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
            '</styleSheet>'
        )

    def _worksheet(self, rows: list[list[Any]]) -> str:
        sheet_data = []
        for row_index, row in enumerate(rows, start=1):
            cells = []
            for column_index, value in enumerate(row, start=1):
                cells.append(self._cell(row_index, column_index, value, header=row_index == 1))
            sheet_data.append(f'<row r="{row_index}">{"".join(cells)}</row>')
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
            f'<sheetData>{"".join(sheet_data)}</sheetData>'
            '</worksheet>'
        )

    def _cell(self, row_index: int, column_index: int, value: Any, *, header: bool = False) -> str:
        ref = f"{self._column_name(column_index)}{row_index}"
        style = ' s="1"' if header else ""
        if value is None:
            return f'<c r="{ref}"{style}/>'
        if isinstance(value, bool):
            return f'<c r="{ref}" t="b"{style}><v>{1 if value else 0}</v></c>'
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return f'<c r="{ref}"{style}><v>{value}</v></c>'
        text = html.escape(self._stringify(value), quote=False)
        return f'<c r="{ref}" t="inlineStr"{style}><is><t>{text}</t></is></c>'

    def _column_name(self, index: int) -> str:
        name = ""
        while index:
            index, remainder = divmod(index - 1, 26)
            name = chr(65 + remainder) + name
        return name

    def _stringify(self, value: Any) -> str:
        if isinstance(value, (datetime, date)):
            return value.isoformat()
        return str(value)


class ResearchProjectExportService:
    def __init__(self) -> None:
        self.project_repository = ResearchProjectRepository()
        self.binding_repository = ProjectTemplateBindingRepository()
        self.schema_service = SchemaService()

    async def export_crf_xlsx(self, project_id: str, request: ExportRequest, *, owner_id: str | None = None) -> bytes:
        project = await self.project_repository.get_by_id(project_id)
        if project is None or project.status == "deleted" or (owner_id is not None and project.owner_id != owner_id):
            raise ResearchProjectNotFoundError("Research project not found")

        binding = await self.binding_repository.get_active_primary_crf(project_id)
        if binding is None:
            raise ResearchProjectNotFoundError("Project CRF template not found")
        schema_version = await self.schema_service.get_version(binding.schema_version_id)
        if schema_version is None:
            raise ResearchProjectNotFoundError("Project CRF schema version not found")

        schema_json = schema_version.schema_json or {}
        fields = self._build_export_fields(schema_json)
        form_order = self._build_form_order(schema_json, fields)
        datasets = await self._load_project_dataset(project_id, schema_version.id, request)

        writer = SimpleXlsxWriter()
        writer.add_sheet("宽表展开", self._build_wide_rows(project, fields, form_order, datasets, request.expand_repeatable_rows))
        for form_key, form_title in form_order:
            form_fields = [field for field in fields if field.form_key == form_key]
            writer.add_sheet(form_title or form_key, self._build_form_rows(project, form_key, form_fields, datasets, request.expand_repeatable_rows))
        return writer.to_bytes()

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

    async def _load_project_dataset(self, project_id: str, schema_version_id: str, request: ExportRequest) -> list[dict[str, Any]]:
        query = (
            select(ProjectPatient, Patient, DataContext)
            .join(Patient, Patient.id == ProjectPatient.patient_id)
            .outerjoin(
                DataContext,
                (DataContext.project_patient_id == ProjectPatient.id)
                & (DataContext.schema_version_id == schema_version_id)
                & (DataContext.context_type == "project_crf"),
            )
            .where(ProjectPatient.project_id == project_id)
            .where(ProjectPatient.status != "withdrawn")
            .where(Patient.deleted_at.is_(None))
            .order_by(ProjectPatient.created_at.asc())
        )
        if request.scope == "selected" and request.patient_ids:
            ids = set(request.patient_ids)
            query = query.where((ProjectPatient.id.in_(ids)) | (ProjectPatient.patient_id.in_(ids)) | (ProjectPatient.enroll_no.in_(ids)))
        result = await session.execute(query)
        rows = result.all()
        context_ids = [context.id for _, _, context in rows if context is not None]
        records_by_context: dict[str, list[RecordInstance]] = {context_id: [] for context_id in context_ids}
        values_by_context_record: dict[tuple[str, str], dict[str, FieldCurrentValue]] = {}
        if context_ids:
            record_result = await session.execute(select(RecordInstance).where(RecordInstance.context_id.in_(context_ids)).order_by(RecordInstance.repeat_index.asc(), RecordInstance.created_at.asc()))
            for record in record_result.scalars().all():
                records_by_context.setdefault(record.context_id, []).append(record)
            value_result = await session.execute(select(FieldCurrentValue).where(FieldCurrentValue.context_id.in_(context_ids)))
            for current in value_result.scalars().all():
                values_by_context_record.setdefault((current.context_id, current.record_instance_id), {})[current.field_path] = current
        return [
            {
                "project_patient": project_patient,
                "patient": patient,
                "context": context,
                "records": records_by_context.get(context.id, []) if context is not None else [],
                "values": values_by_context_record,
            }
            for project_patient, patient, context in rows
        ]

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
            for field in form_fields.get(form_key, []):
                headers.append(self._field_header(field, include_group=True))
        rows = [headers]
        for item in datasets:
            expanded_by_form = {
                form_key: self._expanded_form_rows(item, self._records_for_form(item["records"], form_key), form_fields.get(form_key, []), expand_repeatable_rows)
                for form_key, _ in form_order
            }
            max_count = max([len(expanded) for expanded in expanded_by_form.values()] or [1])
            max_count = max(max_count, 1)
            for row_index in range(max_count):
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
        return rows

    def _build_form_rows(
        self,
        project: ResearchProject,
        form_key: str,
        fields: list[ExportField],
        datasets: list[dict[str, Any]],
        expand_repeatable_rows: bool,
    ) -> list[list[Any]]:
        headers = [*self._base_headers(), "表单", "记录序号", "嵌套行序号", *[self._field_header(field, include_group=False) for field in fields]]
        rows = [headers]
        for item in datasets:
            records = self._records_for_form(item["records"], form_key)
            for record, nested_index, value_map in self._expanded_form_rows(item, records, fields, expand_repeatable_rows):
                row = [
                    *self._base_values(project, item["project_patient"], item["patient"], item["context"]),
                    form_key,
                    record.repeat_index + 1 if record else "",
                    nested_index + 1 if nested_index is not None else "",
                ]
                row.extend(self._display_value(value_map.get(field.field_path)) for field in fields)
                rows.append(row)
        return rows

    def _records_for_form(self, records: list[RecordInstance], form_key: str) -> list[RecordInstance]:
        matched = [record for record in records if record.form_key == form_key]
        return sorted(matched, key=lambda item: (item.repeat_index, item.created_at or datetime.min))

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
        return {field_path: self._find_current_value(values, field_path) for field_path in field_paths if self._find_current_value(values, field_path) is not None}

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
        parts = []
        if include_group and field.group_title:
            parts.append(field.group_title)
        if field.form_title:
            parts.append(field.form_title)
        parts.append(field.field_title or field.field_key)
        return "__".join(part for part in parts if part)

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
