from sqlalchemy import select

from app.models import FieldCurrentValue, FieldValueEvent, FieldValueEvidence
from core.db import session
from core.repository.base import BaseRepo


class FieldValueEventRepository(BaseRepo[FieldValueEvent]):
    def __init__(self):
        super().__init__(FieldValueEvent)

    async def list_candidates(
        self,
        *,
        record_instance_id: str,
        field_path: str,
    ) -> list[FieldValueEvent]:
        query = (
            select(FieldValueEvent)
            .where(FieldValueEvent.record_instance_id == record_instance_id)
            .where(FieldValueEvent.field_path == field_path)
            .where(FieldValueEvent.review_status == "candidate")
        )
        result = await session.execute(query)
        return list(result.scalars().all())

    async def list_by_field(
        self,
        *,
        context_id: str,
        field_path: str,
    ) -> list[FieldValueEvent]:
        query = (
            select(FieldValueEvent)
            .where(FieldValueEvent.context_id == context_id)
            .where(FieldValueEvent.field_path == field_path)
            .order_by(FieldValueEvent.created_at.desc())
        )
        result = await session.execute(query)
        return list(result.scalars().all())


class FieldCurrentValueRepository(BaseRepo[FieldCurrentValue]):
    def __init__(self):
        super().__init__(FieldCurrentValue)

    async def get_by_field(
        self,
        *,
        context_id: str,
        record_instance_id: str,
        field_path: str,
    ) -> FieldCurrentValue | None:
        query = (
            select(FieldCurrentValue)
            .where(FieldCurrentValue.context_id == context_id)
            .where(FieldCurrentValue.record_instance_id == record_instance_id)
            .where(FieldCurrentValue.field_path == field_path)
        )
        result = await session.execute(query)
        return result.scalars().first()

    async def list_by_context(self, context_id: str) -> list[FieldCurrentValue]:
        query = select(FieldCurrentValue).where(FieldCurrentValue.context_id == context_id)
        result = await session.execute(query)
        return list(result.scalars().all())


class FieldValueEvidenceRepository(BaseRepo[FieldValueEvidence]):
    def __init__(self):
        super().__init__(FieldValueEvidence)

    async def list_by_event(self, value_event_id: str) -> list[FieldValueEvidence]:
        query = select(FieldValueEvidence).where(FieldValueEvidence.value_event_id == value_event_id)
        result = await session.execute(query)
        return list(result.scalars().all())

    async def list_by_field(
        self,
        *,
        context_id: str,
        field_path: str,
    ) -> list[FieldValueEvidence]:
        query = (
            select(FieldValueEvidence)
            .join(FieldValueEvent, FieldValueEvent.id == FieldValueEvidence.value_event_id)
            .where(FieldValueEvent.context_id == context_id)
            .where(FieldValueEvent.field_path == field_path)
            .order_by(FieldValueEvidence.created_at.desc())
        )
        result = await session.execute(query)
        return list(result.scalars().all())
