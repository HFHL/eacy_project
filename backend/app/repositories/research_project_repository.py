from datetime import datetime

from sqlalchemy import func, or_, select, update

from app.models import ProjectPatient, ProjectTemplateBinding, ResearchProject
from core.db import session
from core.repository.base import BaseRepo


class ResearchProjectRepository(BaseRepo[ResearchProject]):
    def __init__(self):
        super().__init__(ResearchProject)

    async def get_by_code(self, project_code: str, *, owner_id: str | None = None) -> ResearchProject | None:
        query = select(ResearchProject).where(ResearchProject.project_code == project_code)
        if owner_id is not None:
            query = query.where(ResearchProject.owner_id == owner_id)
        result = await session.execute(query)
        return result.scalars().first()

    def _apply_search_filter(self, query, search: str | None):
        keyword = (search or "").strip()
        if not keyword:
            return query
        pattern = f"%{keyword}%"
        return query.where(
            or_(
                ResearchProject.project_name.ilike(pattern),
                ResearchProject.description.ilike(pattern),
                ResearchProject.project_code.ilike(pattern),
            )
        )

    async def list_projects(
        self,
        *,
        status: str | None = None,
        search: str | None = None,
        limit: int = 100,
        offset: int = 0,
        owner_id: str | None = None,
    ) -> list[ResearchProject]:
        query = select(ResearchProject)
        if owner_id is not None:
            query = query.where(ResearchProject.owner_id == owner_id)
        if status is not None:
            query = query.where(ResearchProject.status == status)
        else:
            query = query.where(ResearchProject.status != "deleted")
        query = self._apply_search_filter(query, search)
        query = query.order_by(ResearchProject.created_at.desc())
        result = await session.execute(query.limit(limit).offset(offset))
        return list(result.scalars().all())

    async def count_projects(
        self,
        *,
        status: str | None = None,
        search: str | None = None,
        owner_id: str | None = None,
    ) -> int:
        query = select(func.count()).select_from(ResearchProject)
        if owner_id is not None:
            query = query.where(ResearchProject.owner_id == owner_id)
        if status is not None:
            query = query.where(ResearchProject.status == status)
        else:
            query = query.where(ResearchProject.status != "deleted")
        query = self._apply_search_filter(query, search)
        result = await session.execute(query)
        return int(result.scalar_one())


class ProjectPatientRepository(BaseRepo[ProjectPatient]):
    def __init__(self):
        super().__init__(ProjectPatient)

    async def get_by_project_patient(self, project_id: str, patient_id: str) -> ProjectPatient | None:
        query = (
            select(ProjectPatient)
            .where(ProjectPatient.project_id == project_id)
            .where(ProjectPatient.patient_id == patient_id)
        )
        result = await session.execute(query)
        return result.scalars().first()

    async def list_by_project(
        self,
        project_id: str,
        *,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[ProjectPatient]:
        query = (
            select(ProjectPatient)
            .where(ProjectPatient.project_id == project_id)
            .where(ProjectPatient.status != "withdrawn")
            .order_by(ProjectPatient.created_at.desc())
        )
        if limit is not None:
            query = query.limit(limit).offset(max(offset, 0))
        result = await session.execute(query)
        return list(result.scalars().all())

    async def count_by_project(self, project_id: str) -> int:
        query = (
            select(func.count())
            .select_from(ProjectPatient)
            .where(ProjectPatient.project_id == project_id)
            .where(ProjectPatient.status != "withdrawn")
        )
        result = await session.execute(query)
        return int(result.scalar_one())

    async def list_by_ids(self, project_patient_ids: list[str]) -> list[ProjectPatient]:
        if not project_patient_ids:
            return []
        unique_ids = list({str(item) for item in project_patient_ids if item})
        query = select(ProjectPatient).where(ProjectPatient.id.in_(unique_ids))
        result = await session.execute(query)
        return list(result.scalars().all())

    async def count_active_by_projects(self, project_ids: list[str]) -> dict[str, int]:
        """每个项目当前有效（未撤回）的入组人数。批量返回 {project_id: count}。"""
        if not project_ids:
            return {}
        query = (
            select(ProjectPatient.project_id, func.count(ProjectPatient.id))
            .where(ProjectPatient.project_id.in_(project_ids))
            .where(ProjectPatient.status != "withdrawn")
            .group_by(ProjectPatient.project_id)
        )
        result = await session.execute(query)
        return {project_id: int(count) for project_id, count in result.all()}

    async def list_active_by_projects(self, project_ids: list[str]) -> list[ProjectPatient]:
        """列出多个项目下所有当前有效的入组记录（未撤回），用于批量计算完整度。"""
        if not project_ids:
            return []
        query = (
            select(ProjectPatient)
            .where(ProjectPatient.project_id.in_(project_ids))
            .where(ProjectPatient.status != "withdrawn")
        )
        result = await session.execute(query)
        return list(result.scalars().all())

    async def list_projects_by_patient(
        self,
        patient_id: str,
        *,
        owner_id: str | None = None,
    ) -> list[tuple[ProjectPatient, ResearchProject]]:
        """返回某个患者参与的所有项目（含项目元信息），排除已撤回的入组记录。"""
        query = (
            select(ProjectPatient, ResearchProject)
            .join(ResearchProject, ResearchProject.id == ProjectPatient.project_id)
            .where(ProjectPatient.patient_id == patient_id)
            .where(ProjectPatient.status != "withdrawn")
            .where(ResearchProject.status != "deleted")
            .order_by(ProjectPatient.created_at.desc())
        )
        if owner_id is not None:
            query = query.where(ResearchProject.owner_id == owner_id)
        result = await session.execute(query)
        return [(pp, rp) for pp, rp in result.all()]

    async def withdraw_by_patient(self, patient_id: str, *, owner_id: str | None = None) -> int:
        query = update(ProjectPatient).where(ProjectPatient.patient_id == patient_id).where(ProjectPatient.status != "withdrawn")
        if owner_id is not None:
            id_query = (
                select(ProjectPatient.id)
                .join(ResearchProject, ResearchProject.id == ProjectPatient.project_id)
                .where(ProjectPatient.patient_id == patient_id)
                .where(ProjectPatient.status != "withdrawn")
                .where(ResearchProject.owner_id == owner_id)
            )
            id_result = await session.execute(id_query)
            project_patient_ids = [row_id for row_id in id_result.scalars().all()]
            if not project_patient_ids:
                return 0
            query = update(ProjectPatient).where(ProjectPatient.id.in_(project_patient_ids))
        query = query.values(status="withdrawn", withdrawn_at=datetime.utcnow())
        result = await session.execute(query)
        return int(result.rowcount or 0)


class ProjectTemplateBindingRepository(BaseRepo[ProjectTemplateBinding]):
    def __init__(self):
        super().__init__(ProjectTemplateBinding)

    async def get_active_primary_crf(self, project_id: str) -> ProjectTemplateBinding | None:
        query = (
            select(ProjectTemplateBinding)
            .where(ProjectTemplateBinding.project_id == project_id)
            .where(ProjectTemplateBinding.binding_type == "primary_crf")
            .where(ProjectTemplateBinding.status == "active")
            .limit(1)
        )
        result = await session.execute(query)
        return result.scalars().first()

    async def list_by_project(self, project_id: str) -> list[ProjectTemplateBinding]:
        query = (
            select(ProjectTemplateBinding)
            .where(ProjectTemplateBinding.project_id == project_id)
            .order_by(ProjectTemplateBinding.created_at.desc())
        )
        result = await session.execute(query)
        return list(result.scalars().all())

    async def list_active_primary_crf_by_projects(self, project_ids: list[str]) -> list[ProjectTemplateBinding]:
        """批量返回多个项目当前激活的 primary_crf 绑定（每个项目最多 1 条）。"""
        if not project_ids:
            return []
        query = (
            select(ProjectTemplateBinding)
            .where(ProjectTemplateBinding.project_id.in_(project_ids))
            .where(ProjectTemplateBinding.binding_type == "primary_crf")
            .where(ProjectTemplateBinding.status == "active")
        )
        result = await session.execute(query)
        return list(result.scalars().all())

    async def list_active_bindings_by_template(
        self,
        template_id: str,
        *,
        owner_id: str | None = None,
    ) -> list[ProjectTemplateBinding]:
        query = (
            select(ProjectTemplateBinding)
            .join(ResearchProject, ResearchProject.id == ProjectTemplateBinding.project_id)
            .where(ProjectTemplateBinding.template_id == template_id)
            .where(ProjectTemplateBinding.status == "active")
            .order_by(ProjectTemplateBinding.created_at.desc())
        )
        if owner_id is not None:
            query = query.where(ResearchProject.owner_id == owner_id)
        result = await session.execute(query)
        return list(result.scalars().all())

    async def list_active_projects_by_template(
        self,
        template_id: str,
        *,
        owner_id: str | None = None,
    ) -> list[dict[str, str]]:
        """返回仍激活绑定指定模板的项目（去重）。"""
        query = (
            select(ResearchProject.id, ResearchProject.project_name)
            .join(
                ProjectTemplateBinding,
                ProjectTemplateBinding.project_id == ResearchProject.id,
            )
            .where(ProjectTemplateBinding.template_id == template_id)
            .where(ProjectTemplateBinding.status == "active")
            .distinct()
            .order_by(ResearchProject.project_name.asc())
        )
        if owner_id is not None:
            query = query.where(ResearchProject.owner_id == owner_id)
        result = await session.execute(query)
        return [
            {"id": str(row.id), "project_name": row.project_name or "未命名项目"}
            for row in result.all()
        ]
