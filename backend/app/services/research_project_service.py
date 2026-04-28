from datetime import datetime
from typing import Any

from app.models import (
    DataContext,
    FieldCurrentValue,
    FieldValueEvent,
    FieldValueEvidence,
    ProjectPatient,
    ProjectTemplateBinding,
    RecordInstance,
    ResearchProject,
)
from app.repositories import (
    DataContextRepository,
    FieldCurrentValueRepository,
    FieldValueEventRepository,
    FieldValueEvidenceRepository,
    PatientRepository,
    ProjectPatientRepository,
    ProjectTemplateBindingRepository,
    RecordInstanceRepository,
    ResearchProjectRepository,
)
from app.services.schema_service import SchemaService
from app.services.structured_value_service import StructuredValueService
from core.db import Transactional


class ResearchProjectServiceError(ValueError):
    pass


class ResearchProjectNotFoundError(ResearchProjectServiceError):
    pass


class ResearchProjectConflictError(ResearchProjectServiceError):
    pass


class ResearchProjectService:
    def __init__(
        self,
        project_repository: ResearchProjectRepository | None = None,
        project_patient_repository: ProjectPatientRepository | None = None,
        binding_repository: ProjectTemplateBindingRepository | None = None,
        context_repository: DataContextRepository | None = None,
        patient_repository: PatientRepository | None = None,
        record_repository: RecordInstanceRepository | None = None,
        schema_service: SchemaService | None = None,
        value_service: StructuredValueService | None = None,
        current_repository: FieldCurrentValueRepository | None = None,
        event_repository: FieldValueEventRepository | None = None,
        evidence_repository: FieldValueEvidenceRepository | None = None,
    ):
        self.project_repository = project_repository or ResearchProjectRepository()
        self.project_patient_repository = project_patient_repository or ProjectPatientRepository()
        self.binding_repository = binding_repository or ProjectTemplateBindingRepository()
        self.context_repository = context_repository or DataContextRepository()
        self.patient_repository = patient_repository or PatientRepository()
        self.record_repository = record_repository or RecordInstanceRepository()
        self.schema_service = schema_service or SchemaService()
        self.value_service = value_service or StructuredValueService()
        self.current_repository = current_repository or FieldCurrentValueRepository()
        self.event_repository = event_repository or FieldValueEventRepository()
        self.evidence_repository = evidence_repository or FieldValueEvidenceRepository()

    async def list_projects(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        status: str | None = None,
    ) -> tuple[list[ResearchProject], int]:
        offset = (page - 1) * page_size
        projects = await self.project_repository.list_projects(status=status, limit=page_size, offset=offset)
        total = await self.project_repository.count_projects(status=status)
        return projects, total

    async def get_project(self, project_id: str) -> ResearchProject | None:
        return await self.project_repository.get_by_id(project_id)

    async def list_template_bindings(self, project_id: str) -> list[ProjectTemplateBinding]:
        project = await self.get_project(project_id)
        if project is None:
            raise ResearchProjectNotFoundError("Research project not found")
        return await self.binding_repository.list_by_project(project_id)

    async def list_project_patients(self, project_id: str) -> list[ProjectPatient]:
        project = await self.get_project(project_id)
        if project is None:
            raise ResearchProjectNotFoundError("Research project not found")
        return await self.project_patient_repository.list_by_project(project_id)

    @Transactional()
    async def create_project(self, *, project_code: str, project_name: str, **params: Any) -> ResearchProject:
        existing = await self.project_repository.get_by_code(project_code)
        if existing is not None:
            raise ResearchProjectConflictError("Research project code already exists")
        return await self.project_repository.create(
            {"project_code": project_code, "project_name": project_name, **params}
        )

    @Transactional()
    async def update_project(self, project_id: str, **params: Any) -> ResearchProject:
        project = await self.get_project(project_id)
        if project is None:
            raise ResearchProjectNotFoundError("Research project not found")
        for key, value in params.items():
            setattr(project, key, value)
        return await self.project_repository.save(project)

    @Transactional()
    async def archive_project(self, project_id: str) -> ResearchProject:
        project = await self.get_project(project_id)
        if project is None:
            raise ResearchProjectNotFoundError("Research project not found")
        project.status = "archived"
        return await self.project_repository.save(project)

    @Transactional()
    async def bind_crf_template(
        self,
        *,
        project_id: str,
        template_id: str,
        schema_version_id: str,
        binding_type: str = "primary_crf",
    ) -> ProjectTemplateBinding:
        project = await self.get_project(project_id)
        if project is None or project.status == "archived":
            raise ResearchProjectNotFoundError("Research project not found")
        version = await self.schema_service.get_version(schema_version_id)
        if version is None or version.template_id != template_id:
            raise ResearchProjectNotFoundError("Schema template version not found")
        return await self.binding_repository.create(
            {
                "project_id": project_id,
                "template_id": template_id,
                "schema_version_id": schema_version_id,
                "binding_type": binding_type,
                "status": "active",
            }
        )

    @Transactional()
    async def disable_template_binding(self, *, project_id: str, binding_id: str) -> ProjectTemplateBinding:
        binding = await self.binding_repository.get_by_id(binding_id)
        if binding is None or binding.project_id != project_id:
            raise ResearchProjectNotFoundError("Project template binding not found")
        binding.status = "disabled"
        return await self.binding_repository.save(binding)

    @Transactional()
    async def enroll_patient(
        self,
        *,
        project_id: str,
        patient_id: str,
        enroll_no: str | None = None,
        extra_json: dict[str, Any] | None = None,
        created_by: str | None = None,
    ) -> ProjectPatient:
        project = await self.get_project(project_id)
        if project is None or project.status == "archived":
            raise ResearchProjectNotFoundError("Research project not found")

        patient = await self.patient_repository.get_active_by_id(patient_id)
        if patient is None:
            raise ResearchProjectNotFoundError("Patient not found")

        existing = await self.project_patient_repository.get_by_project_patient(project_id, patient_id)
        if existing is not None:
            project_patient = existing
            if project_patient.status == "withdrawn":
                project_patient.status = "enrolled"
                project_patient.withdrawn_at = None
                project_patient.enrolled_at = datetime.utcnow()
                project_patient = await self.project_patient_repository.save(project_patient)
        else:
            project_patient = await self.project_patient_repository.create(
                {
                    "project_id": project_id,
                    "patient_id": patient_id,
                    "enroll_no": enroll_no,
                    "status": "enrolled",
                    "enrolled_at": datetime.utcnow(),
                    "extra_json": extra_json,
                }
            )

        binding = await self.binding_repository.get_active_primary_crf(project_id)
        if binding is not None:
            await self.get_or_create_project_crf_context(
                project_patient=project_patient,
                binding=binding,
                created_by=created_by,
            )

        return project_patient

    @Transactional()
    async def withdraw_project_patient(self, *, project_id: str, project_patient_id: str) -> ProjectPatient:
        project_patient = await self.project_patient_repository.get_by_id(project_patient_id)
        if project_patient is None or project_patient.project_id != project_id:
            raise ResearchProjectNotFoundError("Project patient not found")
        project_patient.status = "withdrawn"
        project_patient.withdrawn_at = datetime.utcnow()
        return await self.project_patient_repository.save(project_patient)

    async def get_or_create_project_crf_context(
        self,
        *,
        project_patient: ProjectPatient,
        binding: ProjectTemplateBinding,
        created_by: str | None = None,
    ) -> DataContext:
        context = await self.context_repository.get_project_crf(project_patient.id, binding.schema_version_id)
        if context is not None:
            return context

        context = await self.context_repository.create(
            {
                "context_type": "project_crf",
                "patient_id": project_patient.patient_id,
                "project_id": project_patient.project_id,
                "project_patient_id": project_patient.id,
                "schema_version_id": binding.schema_version_id,
                "status": "draft",
                "created_by": created_by,
            }
        )
        version = await self.schema_service.get_version(binding.schema_version_id)
        if version is not None:
            await self.initialize_default_record_instances(context_id=context.id, schema_json=version.schema_json)
        return context

    async def get_project_crf(
        self,
        *,
        project_id: str,
        project_patient_id: str,
        created_by: str | None = None,
    ) -> dict[str, Any]:
        project_patient = await self._get_project_patient_or_404(project_id, project_patient_id)
        binding = await self.binding_repository.get_active_primary_crf(project_id)
        if binding is None:
            return {"context": None, "schema": None, "records": [], "current_values": {}}

        context = await self.get_or_create_project_crf_context(
            project_patient=project_patient,
            binding=binding,
            created_by=created_by,
        )
        schema_version = await self.schema_service.get_version(context.schema_version_id)
        records = await self.record_repository.list_by_context(context.id)
        current_values = await self.current_repository.list_by_context(context.id)
        return {
            "context": context,
            "schema": schema_version.schema_json if schema_version is not None else None,
            "records": records,
            "current_values": {value.field_path: value for value in current_values},
        }

    async def list_crf_field_events(
        self,
        *,
        project_id: str,
        project_patient_id: str,
        field_path: str,
    ) -> list[FieldValueEvent]:
        context = await self._get_project_crf_context_or_404(project_id, project_patient_id)
        return await self.event_repository.list_by_field(context_id=context.id, field_path=field_path)

    async def list_crf_field_evidence(
        self,
        *,
        project_id: str,
        project_patient_id: str,
        field_path: str,
    ) -> list[FieldValueEvidence]:
        context = await self._get_project_crf_context_or_404(project_id, project_patient_id)
        return await self.evidence_repository.list_by_field(context_id=context.id, field_path=field_path)

    @Transactional()
    async def manual_update_crf_field(
        self,
        *,
        project_id: str,
        project_patient_id: str,
        field_path: str,
        value_type: str,
        record_instance_id: str | None = None,
        field_key: str | None = None,
        edited_by: str | None = None,
        note: str | None = None,
        values: dict[str, Any],
    ) -> FieldCurrentValue:
        context = await self._get_project_crf_context_or_404(project_id, project_patient_id)
        record = await self._resolve_record(context.id, record_instance_id)
        return await self.value_service.manual_edit(
            context_id=context.id,
            record_instance_id=record.id,
            field_key=field_key or field_path.split(".")[-1],
            field_path=field_path,
            value_type=value_type,
            edited_by=edited_by,
            note=note,
            **values,
        )

    @Transactional()
    async def select_crf_field_event(
        self,
        *,
        project_id: str,
        project_patient_id: str,
        field_path: str,
        event_id: str,
        selected_by: str | None = None,
    ) -> FieldCurrentValue:
        context = await self._get_project_crf_context_or_404(project_id, project_patient_id)
        event = await self.event_repository.get_by_id(event_id)
        if event is None or event.context_id != context.id or event.field_path != field_path:
            raise ResearchProjectNotFoundError("CRF field event not found")
        return await self.value_service.select_current_value(event=event, selected_by=selected_by)

    async def _get_project_patient_or_404(self, project_id: str, project_patient_id: str) -> ProjectPatient:
        project_patient = await self.project_patient_repository.get_by_id(project_patient_id)
        if project_patient is None or project_patient.project_id != project_id or project_patient.status == "withdrawn":
            raise ResearchProjectNotFoundError("Project patient not found")
        return project_patient

    async def _get_project_crf_context_or_404(self, project_id: str, project_patient_id: str) -> DataContext:
        crf = await self.get_project_crf(project_id=project_id, project_patient_id=project_patient_id)
        context = crf["context"]
        if context is None:
            raise ResearchProjectNotFoundError("Project CRF context not found")
        return context

    async def _resolve_record(self, context_id: str, record_instance_id: str | None) -> RecordInstance:
        if record_instance_id is not None:
            record = await self.record_repository.get_by_id(record_instance_id)
            if record is None or record.context_id != context_id:
                raise ResearchProjectNotFoundError("Record instance not found")
            return record

        records = await self.record_repository.list_by_context(context_id)
        if not records:
            raise ResearchProjectNotFoundError("Record instance not found")
        return records[0]

    async def initialize_default_record_instances(
        self,
        *,
        context_id: str,
        schema_json: dict[str, Any],
    ):
        created = []
        for group in schema_json.get("groups", []):
            for form in group.get("forms", []):
                if form.get("repeatable", False):
                    continue
                existing = await self.record_repository.get_by_form(
                    context_id=context_id,
                    form_key=form["key"],
                    repeat_index=0,
                )
                if existing is not None:
                    continue
                created.append(
                    await self.record_repository.create(
                        {
                            "context_id": context_id,
                            "group_key": group.get("key"),
                            "group_title": group.get("title"),
                            "form_key": form["key"],
                            "form_title": form.get("title", form["key"]),
                            "repeat_index": 0,
                            "instance_label": form.get("title", form["key"]),
                            "review_status": "unreviewed",
                        }
                    )
                )
        return created
