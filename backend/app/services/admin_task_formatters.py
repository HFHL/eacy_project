from __future__ import annotations

from datetime import datetime
from typing import Any

from app.models import AsyncTaskBatch, AsyncTaskEvent, AsyncTaskItem, ExtractionJob, FieldValueEvent
from app.services.admin_task_types import ADMIN_TASK_STALE_AFTER


class AdminTaskFormattersMixin:
    def _normalize_batch_status(self, batch: AsyncTaskBatch) -> str:
        if self._is_stale(status=batch.status, heartbeat_at=batch.heartbeat_at, updated_at=batch.updated_at):
            return "stale"
        mapping = {"created": "pending", "succeeded": "completed"}
        return mapping.get(batch.status, batch.status)

    def _normalize_item_status(self, item: AsyncTaskItem | None) -> str:
        if item is None:
            return "pending"
        if self._is_stale(status=item.status, heartbeat_at=item.heartbeat_at, updated_at=item.updated_at):
            return "stale"
        mapping = {"created": "pending", "succeeded": "completed"}
        return mapping.get(item.status, item.status)

    def _normalize_job_status(self, job: ExtractionJob) -> str:
        if self._is_stale(status=job.status, heartbeat_at=None, updated_at=job.updated_at):
            return "stale"
        return job.status

    def _is_stale(self, *, status: str, heartbeat_at: datetime | None, updated_at: datetime | None) -> bool:
        if status not in {"running", "queued"}:
            return False
        marker = heartbeat_at or updated_at
        return bool(marker and datetime.utcnow() - marker > ADMIN_TASK_STALE_AFTER)

    def _admin_task_type(self, task_type: str | None, items: list[AsyncTaskItem]) -> str:
        value = task_type or ""
        if "project_crf" in value:
            return "project_crf"
        if "targeted" in value or any(item.target_form_key for item in items):
            return "targeted"
        if "patient_ehr" in value:
            return "patient_ehr"
        return value or "all"

    def _task_type_for_job(self, job: ExtractionJob) -> str:
        if job.job_type == "project_crf":
            return "project_crf_targeted_extract" if job.target_form_key else "project_crf_folder_extract"
        if job.job_type == "targeted_schema":
            return "patient_ehr_targeted_extract"
        return "patient_ehr_targeted_extract" if job.target_form_key else "patient_ehr_folder_extract"

    def _event_payload(self, event: AsyncTaskEvent, *, task_id: str) -> dict[str, Any]:
        return {
            "id": event.id,
            "task_id": task_id,
            "batch_id": event.batch_id,
            "item_id": event.item_id,
            "type": event.event_type,
            "status": event.status,
            "progress": event.progress,
            "node": event.stage,
            "message": event.message,
            "payload_json": event.payload_json,
            "ts": event.created_at,
            "created_at": event.created_at,
        }

    def _event_value(self, event: FieldValueEvent) -> Any:
        if event.value_type == "number":
            return float(event.value_number) if event.value_number is not None else None
        if event.value_type == "date":
            return event.value_date.isoformat() if event.value_date is not None else None
        if event.value_type == "datetime":
            return event.value_datetime.isoformat() if event.value_datetime is not None else None
        if event.value_type == "json":
            return event.value_json
        return event.value_text
