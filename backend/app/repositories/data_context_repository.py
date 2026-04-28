from sqlalchemy import select

from app.models import DataContext, RecordInstance
from core.db import session
from core.repository.base import BaseRepo


class DataContextRepository(BaseRepo[DataContext]):
    def __init__(self):
        super().__init__(DataContext)

    async def get_patient_ehr(self, patient_id: str, schema_version_id: str) -> DataContext | None:
        query = (
            select(DataContext)
            .where(DataContext.context_type == "patient_ehr")
            .where(DataContext.patient_id == patient_id)
            .where(DataContext.schema_version_id == schema_version_id)
        )
        result = await session.execute(query)
        return result.scalars().first()

    async def get_project_crf(self, project_patient_id: str, schema_version_id: str) -> DataContext | None:
        query = (
            select(DataContext)
            .where(DataContext.context_type == "project_crf")
            .where(DataContext.project_patient_id == project_patient_id)
            .where(DataContext.schema_version_id == schema_version_id)
        )
        result = await session.execute(query)
        return result.scalars().first()

    async def get_latest_patient_ehr(self, patient_id: str) -> DataContext | None:
        query = (
            select(DataContext)
            .where(DataContext.context_type == "patient_ehr")
            .where(DataContext.patient_id == patient_id)
            .order_by(DataContext.created_at.desc())
            .limit(1)
        )
        result = await session.execute(query)
        return result.scalars().first()


class RecordInstanceRepository(BaseRepo[RecordInstance]):
    def __init__(self):
        super().__init__(RecordInstance)

    async def get_by_form(
        self,
        *,
        context_id: str,
        form_key: str,
        repeat_index: int = 0,
    ) -> RecordInstance | None:
        query = (
            select(RecordInstance)
            .where(RecordInstance.context_id == context_id)
            .where(RecordInstance.form_key == form_key)
            .where(RecordInstance.repeat_index == repeat_index)
        )
        result = await session.execute(query)
        return result.scalars().first()

    async def list_by_context(self, context_id: str) -> list[RecordInstance]:
        query = select(RecordInstance).where(RecordInstance.context_id == context_id).order_by(RecordInstance.created_at)
        result = await session.execute(query)
        return list(result.scalars().all())
