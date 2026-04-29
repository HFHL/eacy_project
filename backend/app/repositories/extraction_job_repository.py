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

    async def list_by_patient_documents(self, *, patient_id: str, document_ids: list[str]) -> list[ExtractionJob]:
        if not document_ids:
            return []
        query = (
            select(ExtractionJob)
            .where(ExtractionJob.patient_id == patient_id)
            .where(ExtractionJob.document_id.in_(document_ids))
            .where(ExtractionJob.status != "cancelled")
        )
        result = await session.execute(query)
        return list(result.scalars().all())

    async def list_pending_waiting_for_document(self, document_id: str) -> list[ExtractionJob]:
        query = (
            select(ExtractionJob)
            .where(ExtractionJob.document_id == document_id)
            .where(ExtractionJob.status == "pending")
        )
        result = await session.execute(query)
        return [
            job
            for job in result.scalars().all()
            if isinstance(job.input_json, dict) and job.input_json.get("wait_for_document_ready") is True
        ]


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
