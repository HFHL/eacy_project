from typing import Any
from datetime import datetime

from app.models import SchemaTemplate, SchemaTemplateVersion
from app.repositories import SchemaTemplateRepository, SchemaTemplateVersionRepository


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
    ) -> tuple[list[SchemaTemplate], int]:
        offset = (page - 1) * page_size
        templates = await self.template_repository.list_templates(
            template_type=template_type,
            status=status,
            limit=page_size,
            offset=offset,
        )
        total = await self.template_repository.count_templates(template_type=template_type, status=status)
        return templates, total

    async def get_template(self, template_id: str) -> SchemaTemplate | None:
        return await self.template_repository.get_by_id(template_id)

    async def list_versions(self, template_id: str) -> list[SchemaTemplateVersion]:
        return await self.version_repository.list_by_template(template_id)

    async def create_template(
        self,
        *,
        template_code: str,
        template_name: str,
        template_type: str,
        **params: Any,
    ) -> SchemaTemplate:
        existing = await self.template_repository.get_by_code(template_code)
        if existing is not None:
            raise SchemaConflictError("Schema template code already exists")
        return await self.template_repository.create(
            {
                "template_code": template_code,
                "template_name": template_name,
                "template_type": template_type,
                **params,
            }
        )

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
        return await self.version_repository.create(
            {
                "template_id": template_id,
                "version_no": version_no,
                "schema_json": schema_json,
                **params,
            }
        )

    async def archive_template(self, template_id: str) -> SchemaTemplate:
        template = await self.get_template(template_id)
        if template is None:
            raise SchemaNotFoundError("Schema template not found")
        template.status = "archived"
        return await self.template_repository.save(template)

    async def publish_version(self, version_id: str) -> SchemaTemplateVersion:
        version = await self.get_version(version_id)
        if version is None:
            raise SchemaNotFoundError("Schema template version not found")
        if version.status == "deprecated":
            raise SchemaConflictError("Deprecated schema template version cannot be published")
        version.status = "published"
        version.published_at = datetime.utcnow()
        return await self.version_repository.save(version)

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
        await self.version_repository.save(version)

    async def get_latest_published(self, template_type: str) -> SchemaTemplateVersion | None:
        return await self.version_repository.get_latest_published(template_type)

    async def get_version(self, version_id: str) -> SchemaTemplateVersion | None:
        return await self.version_repository.get_by_id(version_id)
