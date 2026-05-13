from sqlalchemy import func, select

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

    async def list_project_crfs_by_project_patients(
        self,
        project_patient_ids: list[str],
    ) -> list[DataContext]:
        """批量按 project_patient_id 列出 project_crf 类型的上下文。"""
        if not project_patient_ids:
            return []
        query = (
            select(DataContext)
            .where(DataContext.context_type == "project_crf")
            .where(DataContext.project_patient_id.in_(project_patient_ids))
        )
        result = await session.execute(query)
        return list(result.scalars().all())

    async def list_latest_patient_ehrs_by_patients(
        self,
        patient_ids: list[str],
    ) -> list[DataContext]:
        """批量按 patient_id 列出 patient_ehr 上下文。

        当同一患者存在多个 schema 版本的上下文时全部返回，由调用方按 patient_id 取最新。
        """
        if not patient_ids:
            return []
        query = (
            select(DataContext)
            .where(DataContext.context_type == "patient_ehr")
            .where(DataContext.patient_id.in_(patient_ids))
            .order_by(DataContext.created_at.desc())
        )
        result = await session.execute(query)
        return list(result.scalars().all())


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

    async def next_repeat_index(self, *, context_id: str, form_key: str) -> int:
        query = select(func.max(RecordInstance.repeat_index)).where(RecordInstance.context_id == context_id).where(RecordInstance.form_key == form_key)
        result = await session.execute(query)
        current = result.scalar()
        return int(current or 0) + 1
