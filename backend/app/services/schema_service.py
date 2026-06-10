from copy import deepcopy
from typing import Any
from datetime import datetime
import re

from app.models import SchemaTemplate, SchemaTemplateVersion
from app.repositories import (
    ProjectTemplateBindingRepository,
    ResearchProjectRepository,
    SchemaTemplateRepository,
    SchemaTemplateVersionRepository,
)
from core.db import Transactional


class SchemaServiceError(ValueError):
    pass


class SchemaNotFoundError(SchemaServiceError):
    pass


class SchemaConflictError(SchemaServiceError):
    pass


PROJECT_CRF_TEMPLATE_TYPE = "project_crf"


class SchemaService:
    def __init__(
        self,
        template_repository: SchemaTemplateRepository | None = None,
        version_repository: SchemaTemplateVersionRepository | None = None,
        binding_repository: ProjectTemplateBindingRepository | None = None,
        project_repository: ResearchProjectRepository | None = None,
    ):
        self.template_repository = template_repository or SchemaTemplateRepository()
        self.version_repository = version_repository or SchemaTemplateVersionRepository()
        self.binding_repository = binding_repository or ProjectTemplateBindingRepository()
        self.project_repository = project_repository or ResearchProjectRepository()

    async def list_templates(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        template_type: str | None = None,
        status: str | None = None,
        created_by: str | None = None,
    ) -> tuple[list[SchemaTemplate], int]:
        offset = (page - 1) * page_size
        templates = await self.template_repository.list_templates(
            template_type=template_type,
            status=status,
            limit=page_size,
            offset=offset,
            created_by=created_by,
        )
        total = await self.template_repository.count_templates(template_type=template_type, status=status, created_by=created_by)
        return templates, total

    async def get_template(self, template_id: str, *, created_by: str | None = None) -> SchemaTemplate | None:
        template = await self.template_repository.get_by_id(template_id)
        if template is None:
            return None
        if created_by is not None and str(template.created_by) != str(created_by) and not template.is_system:
            return None
        return template

    async def _get_mutable_template(
        self,
        template_id: str,
        *,
        editable_by: str | None = None,
    ) -> SchemaTemplate | None:
        template = await self.template_repository.get_by_id(template_id)
        if template is None:
            return None
        if editable_by is not None and (str(template.created_by) != str(editable_by) or template.is_system):
            return None
        return template

    async def _get_mutable_version(
        self,
        version_id: str,
        *,
        editable_by: str | None = None,
    ) -> SchemaTemplateVersion | None:
        version = await self.get_version(version_id)
        if version is None:
            return None
        template = await self._get_mutable_template(version.template_id, editable_by=editable_by)
        if template is None:
            return None
        return version

    async def list_versions(self, template_id: str) -> list[SchemaTemplateVersion]:
        return await self.version_repository.list_by_template(template_id)

    def _slug_template_code(self, template_name: str) -> str:
        slug = re.sub(r"[^0-9a-zA-Z\u4e00-\u9fa5]+", "_", template_name.strip().lower()).strip("_")
        return (slug or "crf_template")[:80]

    async def _ensure_unique_template_code(self, base_code: str) -> str:
        code = base_code[:100] or "crf_template"
        existing = await self.template_repository.get_by_code(code)
        if existing is None:
            return code
        for index in range(2, 1000):
            suffix = f"_{index}"
            candidate = f"{code[:100 - len(suffix)]}{suffix}"
            existing = await self.template_repository.get_by_code(candidate)
            if existing is None:
                return candidate
        raise SchemaConflictError("Unable to generate unique schema template code")

    @Transactional()
    async def create_template(
        self,
        *,
        template_name: str,
        template_type: str,
        template_code: str | None = None,
        **params: Any,
    ) -> SchemaTemplate:
        base_code = template_code or self._slug_template_code(template_name)
        if template_code:
            existing = await self.template_repository.get_by_code(template_code)
            if existing is not None:
                raise SchemaConflictError("Schema template code already exists")
            resolved_code = template_code
        else:
            resolved_code = await self._ensure_unique_template_code(base_code)
        now = datetime.utcnow()
        return await self.template_repository.create(
            {
                "template_code": resolved_code,
                "template_name": template_name,
                "template_type": template_type,
                "created_at": params.pop("created_at", now),
                "updated_at": params.pop("updated_at", now),
                **params,
            }
        )

    @Transactional()
    async def update_template(
        self,
        *,
        template_id: str,
        template_name: str | None = None,
        description: str | None = None,
        status: str | None = None,
        editable_by: str | None = None,
    ) -> SchemaTemplate:
        template = await self._get_mutable_template(template_id, editable_by=editable_by)
        if template is None:
            raise SchemaNotFoundError("Schema template not found")
        if template.status == "archived" and status != "active":
            raise SchemaConflictError("Archived schema template cannot be updated")
        if template_name is not None:
            template.template_name = template_name
        if description is not None:
            template.description = description
        if status is not None:
            template.status = status
        template.updated_at = datetime.utcnow()
        return await self.template_repository.save(template)

    @Transactional()
    async def create_version(
        self,
        *,
        template_id: str,
        version_no: int | None = None,
        schema_json: dict[str, Any],
        editable_by: str | None = None,
        **params: Any,
    ) -> SchemaTemplateVersion:
        template = await self._get_mutable_template(template_id, editable_by=editable_by)
        if template is None or template.status == "archived":
            raise SchemaNotFoundError("Schema template not found")
        if version_no is None:
            version_no = await self.version_repository.next_version_no(template_id)
        now = datetime.utcnow()
        return await self.version_repository.create(
            {
                "template_id": template_id,
                "version_no": version_no,
                "schema_json": schema_json,
                "created_at": params.pop("created_at", now),
                "updated_at": params.pop("updated_at", now),
                **params,
            }
        )

    async def list_active_project_usages(
        self,
        template_id: str,
        *,
        accessible_by: str | None = None,
    ) -> list[dict[str, str]]:
        template = await self.get_template(template_id, created_by=accessible_by)
        if template is None:
            raise SchemaNotFoundError("Schema template not found")
        return await self.binding_repository.list_active_projects_by_template(
            template_id,
            owner_id=accessible_by,
        )

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

    @Transactional()
    async def publish_version(
        self,
        version_id: str,
        *,
        editable_by: str | None = None,
    ) -> SchemaTemplateVersion:
        version = await self._get_mutable_version(version_id, editable_by=editable_by)
        if version is None:
            raise SchemaNotFoundError("Schema template version not found")
        if version.status == "deprecated":
            raise SchemaConflictError("Deprecated schema template version cannot be published")
        now = datetime.utcnow()
        version.status = "published"
        version.published_at = now
        version.updated_at = now
        return await self.version_repository.save(version)

    @Transactional()
    async def delete_version(
        self,
        version_id: str,
        *,
        editable_by: str | None = None,
    ) -> None:
        version = await self._get_mutable_version(version_id, editable_by=editable_by)
        if version is None:
            raise SchemaNotFoundError("Schema template version not found")

        has_references = await self.version_repository.has_references(version_id)
        if version.status == "draft":
            if has_references:
                raise SchemaConflictError("Referenced draft schema template version cannot be deleted")
            await self.version_repository.delete(version)
            return

        version.status = "deprecated"
        version.updated_at = datetime.utcnow()
        await self.version_repository.save(version)

    async def get_latest_published(self, template_type: str) -> SchemaTemplateVersion | None:
        return await self.version_repository.get_latest_published(template_type)

    async def get_version(self, version_id: str) -> SchemaTemplateVersion | None:
        return await self.version_repository.get_by_id(version_id)
