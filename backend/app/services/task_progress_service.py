from datetime import datetime
from typing import Any

from app.models import AsyncTaskBatch, AsyncTaskEvent, AsyncTaskItem, ExtractionJob
from app.repositories import AsyncTaskBatchRepository, AsyncTaskEventRepository, AsyncTaskItemRepository
from core.db import session


TERMINAL_STATUSES = {"succeeded", "failed", "cancelled"}


class TaskProgressService:
    def __init__(
        self,
        batch_repository: AsyncTaskBatchRepository | None = None,
        item_repository: AsyncTaskItemRepository | None = None,
        event_repository: AsyncTaskEventRepository | None = None,
    ):
        self.batch_repository = batch_repository or AsyncTaskBatchRepository()
        self.item_repository = item_repository or AsyncTaskItemRepository()
        self.event_repository = event_repository or AsyncTaskEventRepository()

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
    ) -> AsyncTaskItem:
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
        await self.aggregate_batch(batch_id)
        return item

    async def mark_job_queued(self, job_id: str, *, celery_task_id: str | None = None, commit: bool = False) -> None:
        await self.update_job_progress(
            job_id,
            status="queued",
            progress=5,
            stage="queued",
            stage_label="已进入队列",
            message="任务已进入后台队列",
            celery_task_id=celery_task_id,
            event_type="state_changed",
            commit=commit,
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
        commit: bool = False,
    ) -> None:
        job_id = job_or_id.id if isinstance(job_or_id, ExtractionJob) else job_or_id
        item = await self.item_repository.get_by_extraction_job(job_id)
        if item is None:
            return

        now = datetime.utcnow()
        if status is not None:
            item.status = status
            if status == "running" and item.started_at is None:
                item.started_at = now
            if status in TERMINAL_STATUSES:
                item.finished_at = now
        if progress is not None:
            item.progress = max(int(item.progress or 0), int(progress))
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
        if current_step is not None:
            item.current_step = current_step
        item.heartbeat_at = now
        await self.item_repository.save(item)
        await self._create_event(
            item=item,
            event_type=event_type,
            message=message,
            payload_json={"error_message": error_message} if error_message else None,
        )
        await self.aggregate_batch(item.batch_id)
        if commit:
            await session.commit()

    async def mark_job_failed(self, job: ExtractionJob, *, error_message: str, commit: bool = False) -> None:
        await self.update_job_progress(
            job,
            status="failed",
            stage="failed",
            stage_label="抽取失败",
            message=error_message,
            error_message=error_message,
            event_type="error",
            commit=commit,
        )

    async def mark_job_succeeded(self, job: ExtractionJob, *, commit: bool = False) -> None:
        await self.update_job_progress(
            job,
            status="succeeded",
            progress=100,
            stage="completed",
            stage_label="已完成",
            message="抽取完成",
            event_type="state_changed",
            commit=commit,
        )

    async def aggregate_batch(self, batch_id: str | None) -> AsyncTaskBatch | None:
        if batch_id is None:
            return None
        batch = await self.batch_repository.get_by_id(batch_id)
        if batch is None:
            return None
        items = await self.item_repository.list_by_batch(batch_id)
        total = len(items)
        succeeded = sum(1 for item in items if item.status == "succeeded")
        failed = sum(1 for item in items if item.status == "failed")
        cancelled = sum(1 for item in items if item.status == "cancelled")
        running = sum(1 for item in items if item.status == "running")
        queued = sum(1 for item in items if item.status == "queued")
        progress = int(round(sum(int(item.progress or 0) for item in items) / total)) if total else 0
        terminal = succeeded + failed + cancelled

        batch.total_items = total
        batch.succeeded_items = succeeded
        batch.failed_items = failed
        batch.cancelled_items = cancelled
        batch.progress = progress
        batch.heartbeat_at = datetime.utcnow()
        if total == 0:
            batch.status = "succeeded"
            batch.progress = 100
            batch.finished_at = batch.finished_at or datetime.utcnow()
        elif terminal == total:
            batch.status = "failed" if failed and not succeeded else ("completed_with_errors" if failed else "succeeded")
            batch.progress = 100 if not failed else progress
            batch.finished_at = batch.finished_at or datetime.utcnow()
        elif running:
            batch.status = "running"
            batch.started_at = batch.started_at or datetime.utcnow()
        elif queued:
            batch.status = "queued"
        else:
            batch.status = "created"
        batch.message = self._batch_message(total=total, running=running, queued=queued, succeeded=succeeded, failed=failed, cancelled=cancelled)
        await self.batch_repository.save(batch)
        await session.refresh(batch)
        return batch

    async def get_batch_payload(self, batch_id: str) -> dict[str, Any] | None:
        batch = await self.aggregate_batch(batch_id)
        if batch is None:
            return None
        items = await self.item_repository.list_by_batch(batch_id)
        running = sum(1 for item in items if item.status == "running")
        queued = sum(1 for item in items if item.status == "queued")
        return {
            "batch_id": batch.id,
            "id": batch.id,
            "task_type": batch.task_type,
            "title": batch.title,
            "status": batch.status,
            "progress": batch.progress,
            "total_items": batch.total_items,
            "running_items": running,
            "queued_items": queued,
            "succeeded_items": batch.succeeded_items,
            "failed_items": batch.failed_items,
            "cancelled_items": batch.cancelled_items,
            "message": batch.message,
            "error_message": batch.error_message,
            "patient_id": batch.patient_id,
            "document_id": batch.document_id,
            "project_id": batch.project_id,
            "project_patient_id": batch.project_patient_id,
            "created_at": batch.created_at,
            "updated_at": batch.updated_at,
            "started_at": batch.started_at,
            "finished_at": batch.finished_at,
            "items": [self._item_payload(item) for item in items],
        }

    async def list_batch_events(self, batch_id: str, *, after_id: str | None = None, limit: int = 200) -> list[AsyncTaskEvent]:
        return await self.event_repository.list_by_batch(batch_id, after_id=after_id, limit=limit)

    async def _create_event(
        self,
        *,
        item: AsyncTaskItem,
        event_type: str,
        message: str | None = None,
        payload_json: dict[str, Any] | None = None,
    ) -> AsyncTaskEvent:
        return await self.event_repository.create(
            {
                "batch_id": item.batch_id,
                "item_id": item.id,
                "event_type": event_type,
                "status": item.status,
                "progress": item.progress,
                "stage": item.stage,
                "message": message if message is not None else item.message,
                "payload_json": payload_json,
                "created_at": datetime.utcnow(),
            }
        )

    def _item_payload(self, item: AsyncTaskItem) -> dict[str, Any]:
        return {
            "task_id": item.id,
            "id": item.id,
            "batch_id": item.batch_id,
            "task_type": item.task_type,
            "status": item.status,
            "progress": item.progress,
            "stage": item.stage,
            "stage_label": item.stage_label,
            "message": item.message,
            "document_id": item.document_id,
            "patient_id": item.patient_id,
            "project_id": item.project_id,
            "project_patient_id": item.project_patient_id,
            "target_form_key": item.target_form_key,
            "extraction_job_id": item.extraction_job_id,
            "extraction_run_id": item.extraction_run_id,
            "error_message": item.error_message,
            "created_at": item.created_at,
            "updated_at": item.updated_at,
            "started_at": item.started_at,
            "finished_at": item.finished_at,
        }

    def _job_message(self, job: ExtractionJob) -> str:
        if job.target_form_key:
            return f"等待抽取 {job.target_form_key}"
        if job.document_id:
            return "等待抽取文档"
        return "等待抽取"

    def _batch_message(self, *, total: int, running: int, queued: int, succeeded: int, failed: int, cancelled: int) -> str:
        if total == 0:
            return "暂无可提交的抽取任务"
        if failed and succeeded + failed + cancelled == total:
            return f"已完成 {succeeded}/{total}，失败 {failed}"
        if succeeded + cancelled == total:
            return f"已完成 {succeeded}/{total}"
        active = running or queued
        return f"已完成 {succeeded}/{total}，进行中 {active}，失败 {failed}"
