from sqlalchemy import select

from app.models import ExtractionJob, ExtractionRun, FieldValueEvent
from core.db import session
from core.repository.base import BaseRepo


class ExtractionJobRepository(BaseRepo[ExtractionJob]):
    def __init__(self):
        super().__init__(ExtractionJob)

    async def list_by_status(self, status: str, *, limit: int = 100) -> list[ExtractionJob]:
        query = select(ExtractionJob).where(ExtractionJob.status == status).limit(limit)
        result = await session.execute(query)
        return list(result.scalars().all())


class ExtractionRunRepository(BaseRepo[ExtractionRun]):
    def __init__(self):
        super().__init__(ExtractionRun)

    async def list_by_job(self, job_id: str) -> list[ExtractionRun]:
        query = select(ExtractionRun).where(ExtractionRun.job_id == job_id).order_by(ExtractionRun.run_no)
        result = await session.execute(query)
        return list(result.scalars().all())

    async def has_field_events(self, job_id: str) -> bool:
        query = (
            select(FieldValueEvent.id)
            .join(ExtractionRun, ExtractionRun.id == FieldValueEvent.extraction_run_id)
            .where(ExtractionRun.job_id == job_id)
            .limit(1)
        )
        result = await session.execute(query)
        return result.scalar_one_or_none() is not None
