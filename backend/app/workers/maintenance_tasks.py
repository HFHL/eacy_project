import asyncio
import uuid
from datetime import datetime
from typing import Any

from app.services.extraction_service import ExtractionService
from app.services.task_progress_service import TaskProgressService
from app.workers.async_db import reset_worker_db_connections
from app.workers.celery_app import (
    ABANDON_STALE_PENDING_TASK_NAME,
    PROJECT_CRF_FOLDER_BATCH_PLAN_TASK_NAME,
    PROJECT_CRF_FOLDER_PLAN_TASK_NAME,
    SCHEDULE_PENDING_EXTRACTION_TASK_NAME,
    celery_app,
)
from core.config import config
from core.db.session import reset_session_context, session, set_session_context


def _folder_update_result(task_name: str, result: dict[str, Any]) -> dict[str, Any]:
    jobs = result.get("jobs") or []
    return {
        "task": task_name,
        **{key: value for key, value in result.items() if key != "jobs"},
        "job_ids": [job.id for job in jobs],
    }


async def _mark_planning_batch_failed(batch_id: str | None, error: Exception) -> None:
    if not batch_id:
        return
    try:
        await session.rollback()
    except Exception:
        pass
    batch = await TaskProgressService().batch_repository.get_by_id(batch_id)
    if batch is None:
        return
    message = f"抽取任务规划失败: {error}"
    now = datetime.utcnow()
    batch.status = "failed"
    batch.progress = 100
    batch.message = message
    batch.error_message = message
    batch.finished_at = now
    batch.heartbeat_at = now
    batch.plan_json = {
        **(batch.plan_json if isinstance(batch.plan_json, dict) else {}),
        "planning": False,
        "error": message,
    }
    await TaskProgressService().batch_repository.save(batch)
    await session.commit()


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


@celery_app.task(name=PROJECT_CRF_FOLDER_PLAN_TASK_NAME)
def plan_project_crf_folder_update(
    *,
    batch_id: str,
    project_id: str,
    project_patient_id: str,
    requested_by: str | None = None,
    target_form_keys: list[str] | None = None,
    mode: str | None = None,
) -> dict[str, object]:
    async def _run() -> dict[str, object]:
        token = set_session_context(str(uuid.uuid4()))
        try:
            await reset_worker_db_connections()
            result = await ExtractionService().update_project_crf_folder(
                project_id=project_id,
                project_patient_id=project_patient_id,
                requested_by=requested_by,
                target_form_keys=target_form_keys,
                mode=mode,
                batch_id=batch_id,
            )
            return _folder_update_result(PROJECT_CRF_FOLDER_PLAN_TASK_NAME, result)
        except Exception as error:
            await _mark_planning_batch_failed(batch_id, error)
            raise
        finally:
            await session.remove()
            await reset_worker_db_connections()
            reset_session_context(token)

    return asyncio.run(_run())


@celery_app.task(name=PROJECT_CRF_FOLDER_BATCH_PLAN_TASK_NAME)
def plan_project_crf_folder_batch_update(
    *,
    batch_id: str,
    project_id: str,
    project_patient_ids: list[str] | None = None,
    requested_by: str | None = None,
    target_form_keys: list[str] | None = None,
    mode: str | None = None,
) -> dict[str, object]:
    async def _run() -> dict[str, object]:
        token = set_session_context(str(uuid.uuid4()))
        try:
            await reset_worker_db_connections()
            result = await ExtractionService().update_project_crf_folder_batch(
                project_id=project_id,
                project_patient_ids=project_patient_ids,
                requested_by=requested_by,
                target_form_keys=target_form_keys,
                mode=mode,
                batch_id=batch_id,
            )
            return _folder_update_result(PROJECT_CRF_FOLDER_BATCH_PLAN_TASK_NAME, result)
        except Exception as error:
            await _mark_planning_batch_failed(batch_id, error)
            raise
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
