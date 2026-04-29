import asyncio
import uuid

from app.services.extraction_service import TRANSIENT_EXTRACTION_ERRORS, ExtractionService
from app.workers.async_db import reset_worker_db_connections
from app.workers.celery_app import EXTRACTION_TASK_NAME, celery_app
from core.db.session import reset_session_context, session, set_session_context


@celery_app.task(
    name=EXTRACTION_TASK_NAME,
    autoretry_for=TRANSIENT_EXTRACTION_ERRORS,
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)
def process_extraction_job(job_id: str) -> dict[str, str | int | None]:
    async def _run() -> dict[str, str | int | None]:
        token = set_session_context(str(uuid.uuid4()))
        try:
            await reset_worker_db_connections()
            job = await ExtractionService().process_existing_job(job_id)
            return {
                "task": EXTRACTION_TASK_NAME,
                "job_id": job.id,
                "status": job.status,
                "progress": job.progress,
                "error_message": job.error_message,
            }
        finally:
            await session.remove()
            await reset_worker_db_connections()
            reset_session_context(token)

    return asyncio.run(_run())
