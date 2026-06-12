from __future__ import annotations

from typing import Any

from sqlalchemy import select

from app.models import DataContext, FieldCurrentValue, Patient, ProjectPatient, RecordInstance, ResearchProject
from app.repositories import ProjectTemplateBindingRepository, ResearchProjectRepository
from app.services.research_project_export_rows import ResearchProjectExportRowsMixin
from app.services.research_project_export_schema import ResearchProjectExportSchemaMixin
from app.services.research_project_export_types import ExportField, ExportRequest
from app.services.research_project_export_values import ResearchProjectExportValuesMixin
from app.services.research_project_service import ResearchProjectNotFoundError
from app.services.schema_service import SchemaService
from app.services.simple_xlsx_writer import SimpleXlsxWriter
from core.db import session


class ResearchProjectExportService(
    ResearchProjectExportSchemaMixin,
    ResearchProjectExportRowsMixin,
    ResearchProjectExportValuesMixin,
):
    def __init__(self) -> None:
        self.project_repository = ResearchProjectRepository()
        self.binding_repository = ProjectTemplateBindingRepository()
        self.schema_service = SchemaService()

    async def export_crf_xlsx(self, project_id: str, request: ExportRequest, *, owner_id: str | None = None) -> bytes:
        project = await self.project_repository.get_by_id(project_id)
        if project is None or project.status == "deleted" or (owner_id is not None and str(project.owner_id) != str(owner_id)):
            raise ResearchProjectNotFoundError("Research project not found")

        binding = await self.binding_repository.get_active_primary_crf(project_id)
        if binding is None:
            raise ResearchProjectNotFoundError("Project CRF template not found")
        schema_version = await self.schema_service.get_version(binding.schema_version_id)
        if schema_version is None:
            raise ResearchProjectNotFoundError("Project CRF schema version not found")

        schema_json = schema_version.schema_json or {}
        fields = self._dedupe_export_fields(self._build_export_fields(schema_json))
        form_order = self._build_form_order(schema_json, fields)
        datasets = await self._load_project_dataset(project_id, schema_version.id, request)

        writer = SimpleXlsxWriter()
        writer.add_sheet("概览", self._build_overview_rows(project, binding, schema_version, datasets, fields))
        writer.add_sheet("患者数据", self._build_patient_rows(project, fields, form_order, datasets))
        writer.add_sheet("分析宽表(全展开)", self._build_wide_rows(project, fields, form_order, datasets, request.expand_repeatable_rows))
        writer.add_sheet("统计明细(长表)", self._build_long_rows(fields, datasets))
        writer.add_sheet("数据字典", self._build_dictionary_rows(fields, form_order, datasets))
        for form_key, form_title in form_order:
            form_fields = [field for field in fields if field.form_key == form_key]
            form_rows = self._build_form_rows(form_key, form_fields, datasets, request.expand_repeatable_rows)
            if len(form_rows) > 1 and len(form_rows[0]) > 3:
                writer.add_sheet(form_title or form_key, form_rows)
        return writer.to_bytes()

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
