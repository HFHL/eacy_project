import asyncio
import uuid

from app.services.extraction_service import ExtractionService
from app.workers.async_db import reset_worker_db_connections
from app.workers.celery_app import ABANDON_STALE_PENDING_TASK_NAME, SCHEDULE_PENDING_EXTRACTION_TASK_NAME, celery_app
from core.config import config
from core.db.session import reset_session_context, session, set_session_context


@celery_app.task(name=ABANDON_STALE_PENDING_TASK_NAME)
def abandon_stale_pending_extraction_jobs(older_than_hours: int | None = None) -> dict[str, object]:
    async def _run() -> dict[str, object]:
        if not config.STALE_PENDING_ABANDON_ENABLED:
            return {
                "task": ABANDON_STALE_PENDING_TASK_NAME,
                "skipped": True,
                "reason": "STALE_PENDING_ABANDON_ENABLED is false",
            }

        token = set_session_context(str(uuid.uuid4()))
        try:
            await reset_worker_db_connections()
            hours = (
                older_than_hours
                if older_than_hours is not None
                else config.STALE_PENDING_ABANDON_HOURS
            )
            result = await ExtractionService().abandon_stale_pending_jobs(
                older_than_hours=hours,
                limit=config.STALE_PENDING_ABANDON_LIMIT,
                dry_run=False,
            )
            return {"task": ABANDON_STALE_PENDING_TASK_NAME, **result}
        finally:
            await session.remove()
            await reset_worker_db_connections()
            reset_session_context(token)

    return asyncio.run(_run())


@celery_app.task(name=SCHEDULE_PENDING_EXTRACTION_TASK_NAME)
def schedule_pending_extraction_jobs() -> dict[str, object]:
    async def _run() -> dict[str, object]:
        if not config.EXTRACTION_SCHEDULER_ENABLED:
            return {
                "task": SCHEDULE_PENDING_EXTRACTION_TASK_NAME,
                "skipped": True,
                "reason": "EXTRACTION_SCHEDULER_ENABLED is false",
            }

        token = set_session_context(str(uuid.uuid4()))
        try:
            await reset_worker_db_connections()
            result = await ExtractionService().schedule_pending_extraction_jobs(
                global_limit=config.EXTRACTION_GLOBAL_CONCURRENCY,
                user_limit=config.EXTRACTION_USER_CONCURRENCY,
                project_limit=config.EXTRACTION_PROJECT_CONCURRENCY,
                batch_size=config.EXTRACTION_SCHEDULER_BATCH_SIZE,
            )
            return {"task": SCHEDULE_PENDING_EXTRACTION_TASK_NAME, **result}
        finally:
            await session.remove()
            await reset_worker_db_connections()
            reset_session_context(token)

    return asyncio.run(_run())
