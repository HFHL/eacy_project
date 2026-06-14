from datetime import datetime
from typing import Any

from app.models import AsyncTaskBatch, AsyncTaskItem, ExtractionJob
from app.repositories import AsyncTaskBatchRepository, AsyncTaskEventRepository, AsyncTaskItemRepository
from app.services.task_progress_batch import TaskProgressBatchMixin
from app.services.task_progress_constants import (
    ACTIVE_BATCH_STATUSES,
    ITEM_STALE_AFTER,
    ITEM_STALE_MESSAGE,
    TERMINAL_STATUSES,
)
from app.services.task_progress_job_states import TaskProgressJobStateMixin
from core.db import session


class TaskProgressService(TaskProgressJobStateMixin, TaskProgressBatchMixin):
    def __init__(
        self,
        batch_repository: AsyncTaskBatchRepository | None = None,
        item_repository: AsyncTaskItemRepository | None = None,
        event_repository: AsyncTaskEventRepository | None = None,
    ):
        self.batch_repository = batch_repository or AsyncTaskBatchRepository()
        self.item_repository = item_repository or AsyncTaskItemRepository()
        self.event_repository = event_repository or AsyncTaskEventRepository()

    async def persist_plan_snapshot(self, batch_id: str, plan_json: dict[str, Any]) -> AsyncTaskBatch | None:
        batch = await self.batch_repository.get_by_id(batch_id)
        if batch is None:
            return None
        batch.plan_json = plan_json
        await self.batch_repository.save(batch)
        return batch

    async def create_batch(
        self,
        *,
        task_type: str,
        title: str,
        scope_type: str,
        requested_by: str | None = None,
        patient_id: str | None = None,
        document_id: str | None = None,
        project_id: str | None = None,
        project_patient_id: str | None = None,
        message: str | None = None,
    ) -> AsyncTaskBatch:
        now = datetime.utcnow()
        return await self.batch_repository.create(
            {
                "task_type": task_type,
                "status": "created",
                "progress": 0,
                "title": title,
                "scope_type": scope_type,
                "requested_by": requested_by,
                "patient_id": patient_id,
                "document_id": document_id,
                "project_id": project_id,
                "project_patient_id": project_patient_id,
                "message": message,
                "heartbeat_at": now,
            }
        )

    async def create_item_for_job(
        self,
        *,
        batch_id: str | None,
        task_type: str,
        job: ExtractionJob,
        stage: str = "created",
        stage_label: str = "已创建任务",
        message: str | None = None,
        aggregate: bool = True,
    ) -> AsyncTaskItem:
        existing = await self.item_repository.get_by_extraction_job(job.id)
        if existing is not None:
            if batch_id and not existing.batch_id:
                existing.batch_id = batch_id
            existing.task_type = task_type or existing.task_type
            existing.document_id = existing.document_id or job.document_id
            existing.patient_id = existing.patient_id or job.patient_id
            existing.project_id = existing.project_id or job.project_id
            existing.project_patient_id = existing.project_patient_id or job.project_patient_id
            existing.context_id = existing.context_id or job.context_id
            existing.target_form_key = existing.target_form_key or job.target_form_key
            existing.heartbeat_at = datetime.utcnow()
            await self.item_repository.save(existing)
            if aggregate:
                await self.aggregate_batch(existing.batch_id or batch_id)
            return existing
        item = await self.item_repository.create(
            {
                "batch_id": batch_id,
                "task_type": task_type,
                "status": "created",
                "progress": int(job.progress or 0),
                "stage": stage,
                "stage_label": stage_label,
                "message": message or self._job_message(job),
                "extraction_job_id": job.id,
                "document_id": job.document_id,
                "patient_id": job.patient_id,
                "project_id": job.project_id,
                "project_patient_id": job.project_patient_id,
                "context_id": job.context_id,
                "target_form_key": job.target_form_key,
                "total_steps": 6,
                "heartbeat_at": datetime.utcnow(),
            }
        )
        await self._create_event(item=item, event_type="state_changed", message=item.message)
        if aggregate:
            await self.aggregate_batch(batch_id)
        return item

    async def ensure_item_for_job(
        self,
        *,
        job: ExtractionJob,
        batch_id: str | None = None,
        task_type: str | None = None,
        aggregate: bool = True,
    ) -> AsyncTaskItem | None:
        resolved_batch_id = batch_id
        resolved_task_type = task_type
        input_json = job.input_json if isinstance(job.input_json, dict) else {}
        resolved_batch_id = resolved_batch_id or input_json.get("async_task_batch_id")
        resolved_task_type = resolved_task_type or input_json.get("async_task_type") or job.job_type
        if not resolved_batch_id:
            return await self.item_repository.get_by_extraction_job(job.id)
        return await self.create_item_for_job(
            batch_id=resolved_batch_id,
            task_type=resolved_task_type,
            job=job,
            aggregate=aggregate,
        )

    async def update_job_progress(
        self,
        job_or_id: ExtractionJob | str,
        *,
        status: str | None = None,
        progress: int | None = None,
        stage: str | None = None,
        stage_label: str | None = None,
        message: str | None = None,
        celery_task_id: str | None = None,
        extraction_run_id: str | None = None,
        error_message: str | None = None,
        current_step: int | None = None,
        event_type: str = "progress",
        payload_json: dict[str, Any] | None = None,
        reset_progress: bool = False,
        clear_error: bool = False,
        clear_finished: bool = False,
        commit: bool = False,
    ) -> None:
        if isinstance(job_or_id, str):
            job_id = job_or_id
        else:
            job_id = job_or_id.id
        item = await self.item_repository.get_by_extraction_job(job_id)
        if item is None:
            job = job_or_id if not isinstance(job_or_id, str) else await session.get(ExtractionJob, job_id)
            if job is not None:
                item = await self.ensure_item_for_job(job=job)
        if item is None:
            if commit:
                await session.commit()
            return

        now = datetime.utcnow()
        if status is not None:
            item.status = status
            if status == "running" and item.started_at is None:
                item.started_at = now
            if status in TERMINAL_STATUSES:
                item.finished_at = now
            elif clear_finished:
                item.finished_at = None
        if progress is not None:
            item.progress = int(progress) if reset_progress else max(int(item.progress or 0), int(progress))
        if stage is not None:
            item.stage = stage
        if stage_label is not None:
            item.stage_label = stage_label
        if message is not None:
            item.message = message
        if celery_task_id is not None:
            item.celery_task_id = celery_task_id
        if extraction_run_id is not None:
            item.extraction_run_id = extraction_run_id
        if error_message is not None:
            item.error_message = error_message
        elif clear_error:
            item.error_message = None
        if current_step is not None:
            item.current_step = current_step
        item.heartbeat_at = now
        await self.item_repository.save(item)
        event_payload = self._merge_event_payload(
            item=item,
            payload_json=payload_json,
            error_message=error_message,
        )
        await self._create_event(
            item=item,
            event_type=event_type,
            message=message,
            payload_json=event_payload,
        )
        await self.aggregate_batch(item.batch_id)
        if commit:
            await session.commit()

    async def _reconcile_stale_items(self, items: list[AsyncTaskItem]) -> None:
        """将长时间无心跳的 queued/running 子任务标为 failed，避免批次永远卡在排队中。"""
        now = datetime.utcnow()
        changed = False
        for item in items:
            if item.status not in {"queued", "running"}:
                continue
            marker = item.heartbeat_at or item.updated_at or item.started_at
            if marker is None or now - marker <= ITEM_STALE_AFTER:
                continue
            if await self._should_keep_stale_item_active(item):
                continue
            item.status = "failed"
            item.progress = max(int(item.progress or 0), 0)
            item.error_message = ITEM_STALE_MESSAGE
            item.message = ITEM_STALE_MESSAGE
            item.finished_at = item.finished_at or now
            item.heartbeat_at = now
            await self.item_repository.save(item)
            job_id = getattr(item, "extraction_job_id", None)
            if isinstance(job_id, str) and job_id:
                job = await session.get(ExtractionJob, job_id)
                if job is not None and job.status in {"queued", "pending", "running"}:
                    job.status = "failed"
                    job.error_type = "stale_progress"
                    job.error_message = ITEM_STALE_MESSAGE
                    job.finished_at = job.finished_at or now
                    session.add(job)
            changed = True
        if changed:
            await session.flush()

    async def _should_keep_stale_item_active(self, item: AsyncTaskItem) -> bool:
        """Do not fail jobs that are still legitimately waiting for the fair scheduler."""
        if item.stage != "waiting_scheduler" or not item.extraction_job_id:
            return False
        job = await session.get(ExtractionJob, item.extraction_job_id)
        return bool(job is not None and job.status == "pending")
