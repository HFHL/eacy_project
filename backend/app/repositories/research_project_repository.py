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
