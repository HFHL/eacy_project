from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select

from app.models import AsyncTaskBatch, AsyncTaskEvent, AsyncTaskItem
from app.services.task_progress_constants import ACTIVE_BATCH_STATUSES
from core.db import session


class TaskProgressBatchMixin:
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
        succeeded = sum(1 for item in items if item.status in ("succeeded", "succeeded_empty"))
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
        planning = isinstance(batch.plan_json, dict) and batch.plan_json.get("planning") is True
        preserve_existing_message = False
        if total == 0 and batch.status == "failed":
            batch.progress = 100
            batch.finished_at = batch.finished_at or datetime.utcnow()
            preserve_existing_message = True
        elif total == 0 and planning and batch.status in ACTIVE_BATCH_STATUSES:
            batch.status = "running"
            batch.progress = max(int(batch.progress or 0), 5)
            batch.started_at = batch.started_at or datetime.utcnow()
            batch.finished_at = None
            batch.message = batch.message or "正在规划抽取任务"
            preserve_existing_message = True
        elif total == 0:
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
        if not preserve_existing_message:
            batch.message = self._batch_message(
                total=total,
                running=running,
                queued=queued,
                succeeded=succeeded,
                failed=failed,
                cancelled=cancelled,
            )
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
            "empty_items": empty,
            "failed_items": batch.failed_items,
            "cancelled_items": batch.cancelled_items,
            "message": batch.message,
            "error_message": batch.error_message,
            "plan_summary": self._plan_skipped_summary(batch.plan_json),
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
            skipped_entries.append(
                {
                    "document_id": entry.get("document_id"),
                    "reason": entry.get("reason") or "no primary source matched",
                }
            )
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

    def _batch_message(self, *, total: int, running: int, queued: int, succeeded: int, failed: int, cancelled: int) -> str:
        if total == 0:
            return "暂无可提交的抽取任务"
        if failed and succeeded + failed + cancelled == total:
            return f"已完成 {succeeded}/{total}，失败 {failed}"
        if succeeded + cancelled == total:
            return f"已完成 {succeeded}/{total}"
        active = running or queued
        return f"已完成 {succeeded}/{total}，进行中 {active}，失败 {failed}"
