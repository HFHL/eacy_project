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


class ResearchProjectTemplateMixin:
    async def list_template_bindings(self, project_id: str, *, owner_id: str | None = None) -> list[ProjectTemplateBinding]:
        project = await self.get_project(project_id, owner_id=owner_id)
        if project is None:
            raise ResearchProjectNotFoundError("Research project not found")
        return await self.binding_repository.list_by_project(project_id)

    async def _disable_active_template_bindings(
        self,
        *,
        project_id: str,
        binding_type: str,
        active_bindings: list[ProjectTemplateBinding] | None = None,
    ) -> None:
        bindings = active_bindings if active_bindings is not None else await self.binding_repository.list_by_project(project_id)
        now = datetime.utcnow()
        for binding in bindings:
            if binding.status == "active" and binding.binding_type == binding_type:
                binding.status = "disabled"
                binding.updated_at = now
                await self.binding_repository.save(binding)

    def _project_snapshot_meta(self, schema_json: dict[str, Any] | None) -> dict[str, Any]:
        if not isinstance(schema_json, dict):
            return {}
        layout_config = schema_json.get("layout_config")
        if isinstance(layout_config, dict) and isinstance(layout_config.get("project_snapshot"), dict):
            return layout_config["project_snapshot"]
        snapshot = schema_json.get("project_snapshot")
        return snapshot if isinstance(snapshot, dict) else {}

    @Transactional()
    async def bind_crf_template(
        self,
        *,
        project_id: str,
        template_id: str,
        schema_version_id: str,
        binding_type: str = "primary_crf",
        owner_id: str | None = None,
    ) -> ProjectTemplateBinding:
        project = await self.get_project(project_id, owner_id=owner_id)
        if project is None or project.status == "archived":
            raise ResearchProjectNotFoundError("Research project not found")
        template = await self.schema_service.get_template(template_id, created_by=owner_id)
        if template is None:
            raise ResearchProjectNotFoundError("Schema template not found")
        version = await self.schema_service.get_version(schema_version_id)
        if version is None or version.template_id != template_id:
            raise ResearchProjectNotFoundError("Schema template version not found")

        project_bindings = await self.binding_repository.list_by_project(project_id)
        active_same_type = [
            binding
            for binding in project_bindings
            if binding.status == "active" and binding.binding_type == binding_type
        ]
        if self.schema_service.is_project_snapshot_template(template):
            existing_active = next(
                (
                    binding
                    for binding in active_same_type
                    if binding.template_id == template_id and binding.schema_version_id == schema_version_id
                ),
                None,
            )
            if existing_active is not None:
                return existing_active

        binding_template = template
        binding_version = version
        if self.schema_service.is_project_snapshot_template(template):
            meta = self._project_snapshot_meta(version.schema_json)
            meta_project_id = meta.get("project_id")
            if meta_project_id and str(meta_project_id) != str(project_id):
                raise ResearchProjectConflictError("Project CRF snapshot belongs to another project")
        else:
            binding_template, binding_version = await self.schema_service.create_project_snapshot_template(
                project_id=project.id,
                project_name=project.project_name,
                source_template=template,
                source_version=version,
                created_by=owner_id or getattr(project, "owner_id", None),
            )

        await self._disable_active_template_bindings(
            project_id=project_id,
            binding_type=binding_type,
            active_bindings=active_same_type,
        )
        now = datetime.utcnow()
        binding = await self.binding_repository.create(
            {
                "project_id": project_id,
                "template_id": binding_template.id,
                "schema_version_id": binding_version.id,
                "binding_type": binding_type,
                "status": "active",
                "created_at": now,
                "updated_at": now,
            }
        )
        await self.schema_service._set_project_template_refs(
            project_id,
            template_id=binding_template.id,
            schema_version_id=binding_version.id,
            template_name=binding_template.template_name,
            source_template_id=None if self.schema_service.is_project_snapshot_template(template) else template.id,
            source_schema_version_id=None if self.schema_service.is_project_snapshot_template(template) else version.id,
        )
        return binding

    @Transactional()
    async def disable_template_binding(
        self,
        *,
        project_id: str,
        binding_id: str,
        owner_id: str | None = None,
    ) -> ProjectTemplateBinding:
        project = await self.get_project(project_id, owner_id=owner_id)
        if project is None:
            raise ResearchProjectNotFoundError("Research project not found")
        binding = await self.binding_repository.get_by_id(binding_id)
        if binding is None or binding.project_id != project_id:
            raise ResearchProjectNotFoundError("Project template binding not found")
        binding.status = "disabled"
        return await self.binding_repository.save(binding)
