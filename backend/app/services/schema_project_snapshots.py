from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from typing import Any

from app.models import SchemaTemplate, SchemaTemplateVersion
from app.services.schema_constants import PROJECT_CRF_TEMPLATE_TYPE
from app.services.schema_errors import SchemaNotFoundError
from core.db import Transactional


class SchemaProjectSnapshotMixin:
    def is_project_snapshot_template(self, template: SchemaTemplate | None) -> bool:
        return bool(template is not None and template.template_type == PROJECT_CRF_TEMPLATE_TYPE)

    def _snapshot_schema_json(
        self,
        schema_json: dict[str, Any],
        *,
        project_id: str,
        source_template_id: str,
        source_schema_version_id: str,
        created_at: datetime,
    ) -> dict[str, Any]:
        snapshot = deepcopy(schema_json or {})
        snapshot_meta = {
            "scope": "project",
            "project_id": str(project_id),
            "source_template_id": str(source_template_id),
            "source_schema_version_id": str(source_schema_version_id),
            "snapshot_created_at": created_at.isoformat(),
        }
        layout_config = dict(snapshot.get("layout_config") or {})
        layout_config["project_snapshot"] = snapshot_meta
        snapshot["layout_config"] = layout_config
        snapshot["project_snapshot"] = snapshot_meta
        return snapshot

    async def create_project_snapshot_template(
        self,
        *,
        project_id: str,
        project_name: str,
        source_template: SchemaTemplate,
        source_version: SchemaTemplateVersion,
        created_by: str | None = None,
    ) -> tuple[SchemaTemplate, SchemaTemplateVersion]:
        now = datetime.utcnow()
        source_code = source_template.template_code or "crf_template"
        base_code = f"project_{str(project_id).replace('-', '')[:16]}_{source_code}"[:80]
        template_code = await self._ensure_unique_template_code(base_code)
        template_name = f"{project_name or '科研项目'} / {source_template.template_name or 'CRF模板'}"[:200]
        template = await self.template_repository.create(
            {
                "template_code": template_code,
                "template_name": template_name,
                "template_type": PROJECT_CRF_TEMPLATE_TYPE,
                "description": (
                    f"Project CRF snapshot from {source_template.template_name or source_template.id} "
                    f"v{source_version.version_no}"
                ),
                "status": "active",
                "created_by": created_by,
                "is_system": False,
                "created_at": now,
                "updated_at": now,
            }
        )
        version = await self.version_repository.create(
            {
                "template_id": template.id,
                "version_no": 1,
                "version_name": f"v1 snapshot from v{source_version.version_no}",
                "schema_json": self._snapshot_schema_json(
                    source_version.schema_json,
                    project_id=project_id,
                    source_template_id=source_template.id,
                    source_schema_version_id=source_version.id,
                    created_at=now,
                ),
                "status": "published",
                "published_at": now,
                "created_by": created_by,
                "created_at": now,
                "updated_at": now,
            }
        )
        return template, version

    async def _set_project_template_refs(
        self,
        project_id: str,
        *,
        template_id: str,
        schema_version_id: str,
        template_name: str,
        source_template_id: str | None = None,
        source_schema_version_id: str | None = None,
    ) -> None:
        project = await self.project_repository.get_by_id(project_id)
        if project is None:
            return
        extra = dict(getattr(project, "extra_json", None) or {})
        template_scope_config = dict(extra.get("template_scope_config") or {})
        template_scope_config.update(
            {
                "template_id": template_id,
                "template_name": template_name,
                "schema_version_id": schema_version_id,
            }
        )
        if source_template_id:
            template_scope_config["source_template_id"] = source_template_id
        if source_schema_version_id:
            template_scope_config["source_schema_version_id"] = source_schema_version_id
        extra["crf_template_id"] = template_id
        extra["template_scope_config"] = template_scope_config
        extra["template_info"] = {
            **dict(extra.get("template_info") or {}),
            "template_id": template_id,
            "template_name": template_name,
            "schema_version_id": schema_version_id,
        }
        project.extra_json = extra
        project.updated_at = datetime.utcnow()
        await self.project_repository.save(project)

    async def _clear_project_template_refs(self, project_id: str) -> None:
        project = await self.project_repository.get_by_id(project_id)
        if project is None:
            return
        extra = dict(project.extra_json or {})
        extra.pop("crf_template_id", None)
        extra.pop("template_scope_config", None)
        extra.pop("template_info", None)
        project.extra_json = extra or None
        project.updated_at = datetime.utcnow()
        await self.project_repository.save(project)

    async def _snapshot_active_projects_for_template(
        self,
        template_id: str,
        *,
        owner_id: str | None = None,
    ) -> int:
        template = await self.template_repository.get_by_id(template_id)
        if template is None or self.is_project_snapshot_template(template):
            return 0
        bindings = await self.binding_repository.list_active_bindings_by_template(
            template_id,
            owner_id=owner_id,
        )
        if not bindings:
            return 0
        snapshotted_projects: set[str] = set()
        snapshotted_binding_keys: set[tuple[str, str]] = set()
        for binding in bindings:
            binding_key = (str(binding.project_id), str(binding.binding_type))
            if binding_key in snapshotted_binding_keys:
                binding.status = "disabled"
                binding.updated_at = datetime.utcnow()
                await self.binding_repository.save(binding)
                continue
            project = await self.project_repository.get_by_id(binding.project_id)
            version = await self.version_repository.get_by_id(binding.schema_version_id)
            if project is None or version is None:
                continue
            snapshotted_binding_keys.add(binding_key)
            snapshot_template, snapshot_version = await self.create_project_snapshot_template(
                project_id=project.id,
                project_name=project.project_name,
                source_template=template,
                source_version=version,
                created_by=getattr(project, "owner_id", None),
            )
            binding.status = "disabled"
            binding.updated_at = datetime.utcnow()
            await self.binding_repository.save(binding)
            await self.binding_repository.create(
                {
                    "project_id": project.id,
                    "template_id": snapshot_template.id,
                    "schema_version_id": snapshot_version.id,
                    "binding_type": binding.binding_type,
                    "status": "active",
                    "locked_at": getattr(binding, "locked_at", None),
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                }
            )
            await self._set_project_template_refs(
                project.id,
                template_id=snapshot_template.id,
                schema_version_id=snapshot_version.id,
                template_name=snapshot_template.template_name,
                source_template_id=template.id,
                source_schema_version_id=version.id,
            )
            snapshotted_projects.add(project.id)
        return len(snapshotted_projects)

    @Transactional()
    async def archive_template(
        self,
        template_id: str,
        *,
        editable_by: str | None = None,
    ) -> SchemaTemplate:
        template = await self._get_mutable_template(template_id, editable_by=editable_by)
        if template is None:
            raise SchemaNotFoundError("Schema template not found")
        await self._snapshot_active_projects_for_template(template_id, owner_id=editable_by)
        template.status = "archived"
        template.updated_at = datetime.utcnow()
        return await self.template_repository.save(template)
