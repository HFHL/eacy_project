from sqlalchemy import desc, func, select

from app.models import DataContext, ProjectTemplateBinding, SchemaTemplate, SchemaTemplateVersion
from core.db import session
from core.repository.base import BaseRepo


class SchemaTemplateRepository(BaseRepo[SchemaTemplate]):
    def __init__(self):
        super().__init__(SchemaTemplate)

    async def get_by_code(self, template_code: str) -> SchemaTemplate | None:
        query = select(SchemaTemplate).where(SchemaTemplate.template_code == template_code)
        result = await session.execute(query)
        return result.scalars().first()

    async def list_templates(
        self,
        *,
        template_type: str | None = None,
        status: str | None = None,
        limit: int = 100,
        offset: int = 0,
        created_by: str | None = None,
    ) -> list[SchemaTemplate]:
        query = select(SchemaTemplate)
        if created_by is not None:
            query = query.where(SchemaTemplate.created_by == created_by)
        query = query.order_by(SchemaTemplate.created_at.desc())
        if template_type is not None:
            query = query.where(SchemaTemplate.template_type == template_type)
        if status is not None:
            query = query.where(SchemaTemplate.status == status)
        result = await session.execute(query.limit(limit).offset(offset))
        return list(result.scalars().all())

    async def count_templates(
        self,
        *,
        template_type: str | None = None,
        status: str | None = None,
        created_by: str | None = None,
    ) -> int:
        query = select(func.count()).select_from(SchemaTemplate)
        if created_by is not None:
            query = query.where(SchemaTemplate.created_by == created_by)
        if template_type is not None:
            query = query.where(SchemaTemplate.template_type == template_type)
        if status is not None:
            query = query.where(SchemaTemplate.status == status)
        result = await session.execute(query)
        return int(result.scalar_one())


class SchemaTemplateVersionRepository(BaseRepo[SchemaTemplateVersion]):
    def __init__(self):
        super().__init__(SchemaTemplateVersion)

    async def get_latest_published(self, template_type: str) -> SchemaTemplateVersion | None:
        query = (
            select(SchemaTemplateVersion)
            .join(SchemaTemplate, SchemaTemplate.id == SchemaTemplateVersion.template_id)
            .where(SchemaTemplate.template_type == template_type)
            .where(SchemaTemplate.status == "active")
            .where(SchemaTemplateVersion.status == "published")
            .order_by(desc(SchemaTemplateVersion.version_no))
            .limit(1)
        )
        result = await session.execute(query)
        return result.scalars().first()

    async def list_by_template(self, template_id: str) -> list[SchemaTemplateVersion]:
        query = (
            select(SchemaTemplateVersion)
            .where(SchemaTemplateVersion.template_id == template_id)
            .order_by(desc(SchemaTemplateVersion.version_no))
        )
        result = await session.execute(query)
        return list(result.scalars().all())

    async def has_references(self, version_id: str) -> bool:
        data_context_query = select(func.count()).select_from(DataContext).where(DataContext.schema_version_id == version_id)
        binding_query = (
            select(func.count())
            .select_from(ProjectTemplateBinding)
            .where(ProjectTemplateBinding.schema_version_id == version_id)
        )
        data_context_count = await session.execute(data_context_query)
        binding_count = await session.execute(binding_query)
        return int(data_context_count.scalar_one()) > 0 or int(binding_count.scalar_one()) > 0
