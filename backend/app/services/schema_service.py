from typing import Any
from datetime import datetime
import re

from app.models import SchemaTemplate, SchemaTemplateVersion
from app.repositories import SchemaTemplateRepository, SchemaTemplateVersionRepository
from core.db import Transactional


class SchemaServiceError(ValueError):
    pass


class SchemaNotFoundError(SchemaServiceError):
    pass


class SchemaConflictError(SchemaServiceError):
    pass


class SchemaService:
    def __init__(
        self,
        template_repository: SchemaTemplateRepository | None = None,
        version_repository: SchemaTemplateVersionRepository | None = None,
    ):
        self.template_repository = template_repository or SchemaTemplateRepository()
        self.version_repository = version_repository or SchemaTemplateVersionRepository()

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
        if created_by is not None and template.created_by != created_by:
            return None
        return template

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
    ) -> SchemaTemplate:
        template = await self.get_template(template_id)
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
        version_no: int,
        schema_json: dict[str, Any],
        **params: Any,
    ) -> SchemaTemplateVersion:
        template = await self.get_template(template_id)
        if template is None or template.status == "archived":
            raise SchemaNotFoundError("Schema template not found")
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

    @Transactional()
    async def archive_template(self, template_id: str) -> SchemaTemplate:
        template = await self.get_template(template_id)
        if template is None:
            raise SchemaNotFoundError("Schema template not found")
        template.status = "archived"
        template.updated_at = datetime.utcnow()
        return await self.template_repository.save(template)

    @Transactional()
    async def publish_version(self, version_id: str) -> SchemaTemplateVersion:
        version = await self.get_version(version_id)
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
    async def delete_version(self, version_id: str) -> None:
        version = await self.get_version(version_id)
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
