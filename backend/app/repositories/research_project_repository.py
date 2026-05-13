from datetime import datetime

from sqlalchemy import func, select, update

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

    async def list_projects(
        self,
        *,
        status: str | None = None,
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
        query = query.order_by(ResearchProject.created_at.desc())
        result = await session.execute(query.limit(limit).offset(offset))
        return list(result.scalars().all())

    async def count_projects(self, *, status: str | None = None, owner_id: str | None = None) -> int:
        query = select(func.count()).select_from(ResearchProject)
        if owner_id is not None:
            query = query.where(ResearchProject.owner_id == owner_id)
        if status is not None:
            query = query.where(ResearchProject.status == status)
        else:
            query = query.where(ResearchProject.status != "deleted")
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

    async def list_by_project(self, project_id: str) -> list[ProjectPatient]:
        query = (
            select(ProjectPatient)
            .where(ProjectPatient.project_id == project_id)
            .order_by(ProjectPatient.created_at.desc())
        )
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

    async def list_projects_by_patient(self, patient_id: str) -> list[tuple[ProjectPatient, ResearchProject]]:
        """返回某个患者参与的所有项目（含项目元信息），排除已撤回的入组记录。"""
        query = (
            select(ProjectPatient, ResearchProject)
            .join(ResearchProject, ResearchProject.id == ProjectPatient.project_id)
            .where(ProjectPatient.patient_id == patient_id)
            .where(ProjectPatient.status != "withdrawn")
            .where(ResearchProject.status != "deleted")
            .order_by(ProjectPatient.created_at.desc())
        )
        result = await session.execute(query)
        return [(pp, rp) for pp, rp in result.all()]

    async def withdraw_by_patient(self, patient_id: str) -> int:
        query = (
            update(ProjectPatient)
            .where(ProjectPatient.patient_id == patient_id)
            .where(ProjectPatient.status != "withdrawn")
            .values(status="withdrawn", withdrawn_at=datetime.utcnow())
        )
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
