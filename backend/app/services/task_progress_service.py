from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select

from app.models import AsyncTaskBatch, AsyncTaskEvent, AsyncTaskItem, ExtractionJob
from app.repositories import AsyncTaskBatchRepository, AsyncTaskEventRepository, AsyncTaskItemRepository
from core.db import session


TERMINAL_STATUSES = {"succeeded", "succeeded_empty", "failed", "cancelled"}
ACTIVE_BATCH_STATUSES = {"created", "queued", "running"}
ITEM_STALE_AFTER = timedelta(minutes=15)
ITEM_STALE_MESSAGE = "任务长时间无进度更新，已自动标记失败（可重新提交）"


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

    async def mark_job_queued(
        self,
        job_id: str,
        *,
        celery_task_id: str | None = None,
        commit: bool = False,
        message: str | None = None,
        reset_progress: bool = False,
    ) -> None:
        await self.update_job_progress(
            job_id,
            status="queued",
            progress=5,
            stage="queued",
            stage_label="已进入队列",
            message=message or "任务已进入后台队列",
            celery_task_id=celery_task_id,
            event_type="state_changed",
            reset_progress=reset_progress,
            clear_error=reset_progress,
            clear_finished=reset_progress,
            commit=commit,
        )

    async def mark_job_waiting_for_scheduler(
        self,
        job: ExtractionJob,
        *,
        message: str | None = None,
        reset_progress: bool = False,
        commit: bool = False,
    ) -> None:
        await self.update_job_progress(
            job,
            status="queued",
            progress=0,
            stage="waiting_scheduler",
            stage_label="等待调度",
            message=message or "任务正在等待公平调度",
            event_type="state_changed",
            reset_progress=reset_progress,
            clear_error=reset_progress,
            clear_finished=reset_progress,
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

    async def mark_job_cancelled(self, job: ExtractionJob, *, message: str | None = None, commit: bool = False) -> None:
        cancellation_message = message or "任务已取消"
        await self.update_job_progress(
            job,
            status="cancelled",
            stage="cancelled",
            stage_label="已取消",
            message=cancellation_message,
            error_message=cancellation_message,
            event_type="state_changed",
            commit=commit,
        )

    async def mark_job_succeeded(
        self,
        job: ExtractionJob,
        *,
        commit: bool = False,
        warning_message: str | None = None,
    ) -> None:
        """Mark a job item as succeeded.

        When ``warning_message`` is provided, the item is recorded as
        ``succeeded_empty`` so the frontend can clearly distinguish a job that
        finished without producing any fields (e.g. LLM returned valid_empty,
        normalization dropped everything) from a fully successful one. The
        message is also stored on ``item.error_message`` so existing UI fields
        that surface diagnostics on completed items pick it up automatically.
        """
        await self.update_job_progress(
            job,
            status="succeeded_empty" if warning_message else "succeeded",
            progress=100,
            stage="completed_empty" if warning_message else "completed",
            stage_label="已完成（无字段）" if warning_message else "已完成",
            message=warning_message or "抽取完成",
            error_message=warning_message,
            event_type="state_changed",
            commit=commit,
        )

    async def list_active_batches_for_project(
        self,
        project_id: str,
        *,
        requested_by: str | None = None,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        """返回项目下仍在进行中的抽取批次，供前端离开页面后恢复进度条。"""
        query = (
            select(AsyncTaskBatch)
            .where(
                AsyncTaskBatch.project_id == project_id,
                AsyncTaskBatch.status.in_(tuple(ACTIVE_BATCH_STATUSES)),
            )
            .order_by(AsyncTaskBatch.created_at.desc())
            .limit(max(1, min(limit, 20)))
        )
        if requested_by is not None:
            query = query.where(AsyncTaskBatch.requested_by == requested_by)
        result = await session.execute(query)
        batches = list(result.scalars().all())
        payloads: list[dict[str, Any]] = []
        for batch in batches:
            payload = await self.get_batch_payload(batch.id, requested_by=requested_by)
            if payload is not None:
                payloads.append(payload)
        return payloads

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
                if job is not None and job.status in {"pending", "running"}:
                    job.status = "failed"
                    job.error_type = "stale_progress"
                    job.error_message = ITEM_STALE_MESSAGE
                    job.finished_at = job.finished_at or now
                    session.add(job)
            changed = True
        if changed:
            await session.flush()

    async def aggregate_batch(self, batch_id: str | None) -> AsyncTaskBatch | None:
        if batch_id is None:
            return None
        batch = await self.batch_repository.get_by_id(batch_id)
        if batch is None:
            return None
        items = await self.item_repository.list_by_batch(batch_id)
        await self._reconcile_stale_items(items)
        items = await self.item_repository.list_by_batch(batch_id)
        total = len(items)
        # ``succeeded_empty`` items finished cleanly but produced 0 fields; we
        # still count them as succeeded for batch aggregation (they are not
        # failures), and surface the empty count separately for the UI.
        succeeded = sum(1 for item in items if item.status in ("succeeded", "succeeded_empty"))
        succeeded_empty = sum(1 for item in items if item.status == "succeeded_empty")
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

    async def get_batch_payload(
        self,
        batch_id: str,
        *,
        requested_by: str | None = None,
    ) -> dict[str, Any] | None:
        batch = await self.aggregate_batch(batch_id)
        if batch is None:
            return None
        if requested_by is not None and str(batch.requested_by) != str(requested_by):
            return None
        items = await self.item_repository.list_by_batch(batch_id)
        running = sum(1 for item in items if item.status == "running")
        queued = sum(1 for item in items if item.status == "queued")
        empty = sum(1 for item in items if item.status == "succeeded_empty")
        plan_summary = self._plan_skipped_summary(batch.plan_json)
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
            # Empty-result jobs are counted inside succeeded_items; this extra
            # field lets the UI render a separate warning badge without
            # double-counting them.
            "empty_items": empty,
            "failed_items": batch.failed_items,
            "cancelled_items": batch.cancelled_items,
            "message": batch.message,
            "error_message": batch.error_message,
            # Documents that the planner could not map to any form (typically
            # because no schema form had an x-sources.primary matching the
            # document's doc_type/doc_subtype). These docs never produced any
            # field, so surface them so the operator can fix the template or
            # re-classify the document.
            "plan_summary": plan_summary,
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

    def _plan_skipped_summary(self, plan_json: Any) -> dict[str, Any]:
        if not isinstance(plan_json, dict):
            return {"skipped_documents": 0, "skipped": []}
        stats = plan_json.get("stats") if isinstance(plan_json.get("stats"), dict) else {}
        skipped_entries: list[dict[str, Any]] = []
        for entry in plan_json.get("skipped") or []:
            if not isinstance(entry, dict):
                continue
            skipped_entries.append({
                "document_id": entry.get("document_id"),
                "reason": entry.get("reason") or "no primary source matched",
            })
        return {
            "skipped_documents": int(stats.get("skipped_documents") or len(skipped_entries) or 0),
            "skipped": skipped_entries[:50],
        }

    async def list_batch_events(
        self,
        batch_id: str,
        *,
        after_id: str | None = None,
        limit: int = 200,
        requested_by: str | None = None,
    ) -> list[AsyncTaskEvent]:
        if requested_by is not None:
            batch = await self.batch_repository.get_by_id(batch_id)
            if batch is None or str(batch.requested_by) != str(requested_by):
                return []
        return await self.event_repository.list_by_batch(batch_id, after_id=after_id, limit=limit)

    def _merge_event_payload(
        self,
        *,
        item: AsyncTaskItem,
        payload_json: dict[str, Any] | None,
        error_message: str | None = None,
    ) -> dict[str, Any]:
        merged: dict[str, Any] = {
            "extraction_job_id": item.extraction_job_id,
            "item_id": item.id,
            "document_id": item.document_id,
            "target_form_key": item.target_form_key,
            "stage": item.stage,
            "current_step": item.current_step,
            "total_steps": item.total_steps,
        }
        if payload_json:
            merged.update(payload_json)
        if error_message:
            merged["error_message"] = error_message
        return merged

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
                "payload_json": self._merge_event_payload(item=item, payload_json=payload_json),
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
