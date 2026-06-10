import asyncio
import uuid

from app.services.extraction_service import (
    ExtractionConflictError,
    ExtractionNotFoundError,
    ExtractionService,
)
from app.workers.async_db import reset_worker_db_connections
from app.workers.celery_app import EXTRACTION_TASK_NAME, celery_app
from core.db.session import reset_session_context, session, set_session_context


@celery_app.task(
    name=EXTRACTION_TASK_NAME,
    bind=True,
    max_retries=3,
)
def process_extraction_job(self, job_id: str) -> dict[str, str | int | None]:
    async def _run() -> dict[str, str | int | None]:
        token = set_session_context(str(uuid.uuid4()))
        try:
            await reset_worker_db_connections()
            try:
                job = await ExtractionService().process_existing_job(job_id)
            except ExtractionNotFoundError:
                return {
                    "task": EXTRACTION_TASK_NAME,
                    "job_id": job_id,
                    "status": "not_found",
                    "progress": 0,
                    "error_message": "Extraction job not found",
                }
            except ExtractionConflictError as error:
                # 终态 job 被 Celery 重复投递时不应无限重试，直接 ack 跳过。
                return {
                    "task": EXTRACTION_TASK_NAME,
                    "job_id": job_id,
                    "status": "skipped",
                    "progress": 0,
                    "error_message": str(error),
                }
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

    async def _handle_transient_failure(error: Exception) -> dict[str, str | int | None]:
        token = set_session_context(str(uuid.uuid4()))
        try:
            await reset_worker_db_connections()
            job = await ExtractionService().handle_worker_transient_failure(
                job_id,
                error=error,
                max_retries=int(self.max_retries or 0),
            )
            return {
                "task": EXTRACTION_TASK_NAME,
                "job_id": job_id,
                "status": getattr(job, "status", "not_found") if job is not None else "not_found",
                "progress": getattr(job, "progress", 0) if job is not None else 0,
                "error_message": getattr(job, "error_message", None) if job is not None else "Extraction job not found",
            }
        finally:
            await session.remove()
            await reset_worker_db_connections()
            reset_session_context(token)

    try:
        return asyncio.run(_run())
    except Exception as error:
        service = ExtractionService()
        if not service._is_transient_error(error):
            raise
        return asyncio.run(_handle_transient_failure(error))
