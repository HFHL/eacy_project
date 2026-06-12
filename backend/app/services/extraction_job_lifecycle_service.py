from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from types import SimpleNamespace
from typing import Any

from sqlalchemy import text

from app.models import DataContext, Document, ExtractionJob, ExtractionRun, RecordInstance
from app.services import extraction_service_runtime
from app.services.evidence_location_resolver import (
    build_ocr_reading_units,
    evidence_location_is_trusted,
    flatten_reading_unit_corpus,
    resolve_evidence_locations,
)
from app.services.extraction_errors import (
    ExtractionCancelledError,
    ExtractionConflictError,
    ExtractionNotFoundError,
    ExtractionTargetValidationError,
)
from app.services.extraction_plan_trace import build_folder_plan_json, build_single_job_plan_json, document_trace_terms
from app.services.extraction_strategy import extraction_queue_for_job, job_uses_claude_code, with_default_extraction_strategy
from app.services.extraction_types import (
    TRANSIENT_EXTRACTION_ERRORS,
    FolderUpdateOptions,
    SharedDocumentExtractionState,
    _TRANSIENT_DB_ORIG_EXCEPTIONS,
)
from app.services.llm_call_logger import ERROR_TIMEOUT, classify_exception, flush_llm_call_logs
from app.services.record_instance_label import record_instance_label
from app.services.record_instance_merge import RecordInstanceMergeResolver
from app.services.schema_field_planner import plan_schema_fields
from core.db import Transactional, session


class ExtractionJobLifecycleMixin:
    @Transactional()
    async def process_existing_job(self, job_id: str) -> ExtractionJob:
        job = await self.get_job(job_id)
        if job is None:
            raise ExtractionNotFoundError("Extraction job not found")
        self._ensure_can_process(job)
        return await self._process_job(job=job, input_snapshot_extra={"worker": True}, raise_on_failure=False)

    @Transactional()
    async def retry_job(self, job_id: str, *, requested_by: str | None = None) -> ExtractionJob:
        job = await self.get_job(job_id, requested_by=requested_by)
        if job is None:
            raise ExtractionNotFoundError("Extraction job not found")
        self._ensure_can_retry(job)
        job.status = "pending"
        job.progress = 0
        job.error_message = None
        job.error_type = None
        job.timeout_at = None
        job.started_at = None
        job.finished_at = None
        if isinstance(job.input_json, dict):
            input_json = dict(job.input_json)
            input_json.pop("worker_retry_count", None)
            input_json.pop("last_retry_scheduled_at", None)
            job.input_json = input_json
        await self.job_repository.save(job)
        await self._commit_pending_jobs_before_enqueue()
        await self._schedule_or_enqueue_extraction_task(
            job.id,
            reset_progress=True,
            waiting_message="任务已重新提交，正在等待公平调度",
            queued_message="任务已重新提交到后台队列",
        )
        try:
            await session.refresh(job)
        except Exception:
            pass
        return job

    @Transactional()
    async def cancel_job(self, job_id: str, *, requested_by: str | None = None) -> ExtractionJob:
        job = await self.get_job(job_id, requested_by=requested_by)
        if job is None:
            raise ExtractionNotFoundError("Extraction job not found")
        if job.status == "completed":
            raise ExtractionConflictError("Completed extraction job cannot be cancelled")
        job.status = "cancelled"
        job.error_type = "cancelled"
        job.error_message = "任务已取消"
        job.finished_at = datetime.utcnow()
        await self.job_repository.save(job)
        await self.task_progress_service.mark_job_cancelled(job, message=job.error_message)
        return job

    @Transactional()
    async def handle_worker_transient_failure(
        self,
        job_id: str,
        *,
        error: Exception,
        max_retries: int,
    ) -> ExtractionJob | None:
        job = await self.get_job(job_id)
        if job is None or job.status in {"cancelled", "completed"}:
            return job
        input_json = dict(job.input_json or {}) if isinstance(job.input_json, dict) else {}
        retry_count = int(input_json.get("worker_retry_count") or 0)
        if retry_count >= max(0, max_retries):
            await self.mark_worker_retry_exhausted(job_id, error=error)
            return await self.get_job(job_id)
        return await self.mark_worker_retry_scheduled(
            job_id,
            error=error,
            retry_number=retry_count + 1,
        )

    @Transactional()
    async def mark_worker_retry_scheduled(self, job_id: str, *, error: Exception, retry_number: int) -> ExtractionJob | None:
        job = await self.get_job(job_id)
        if job is None or job.status in {"cancelled", "completed"}:
            return job
        input_json = dict(job.input_json or {}) if isinstance(job.input_json, dict) else {}
        input_json["worker_retry_count"] = max(int(input_json.get("worker_retry_count") or 0), retry_number)
        input_json["last_retry_scheduled_at"] = datetime.utcnow().isoformat()
        job.status = "pending"
        job.error_type = "retry_scheduled"
        job.error_message = f"临时错误，已安排第 {retry_number} 次重试：{str(error) or error.__class__.__name__}"
        job.input_json = input_json
        job.started_at = None
        job.finished_at = None
        await self.job_repository.save(job)
        runs = await self.run_repository.list_by_job(job.id)
        if runs:
            run = runs[-1]
            run.status = "failed"
            run.finished_at = datetime.utcnow()
            run.error_type = "retry_scheduled"
            run.error_message = job.error_message
            await self.run_repository.save(run)
        await self.task_progress_service.mark_job_waiting_for_scheduler(
            job,
            message=job.error_message,
            reset_progress=True,
        )
        await session.commit()
        return job

    @Transactional()
    async def mark_worker_retry_exhausted(self, job_id: str, *, error: Exception) -> ExtractionJob | None:
        job = await self.get_job(job_id)
        if job is None or job.status in {"cancelled", "completed"}:
            return job
        runs = await self.run_repository.list_by_job(job.id)
        run = runs[-1] if runs else await self.start_run(
            job_id=job.id,
            run_no=1,
            model_name=self._model_name_for_job(job),
            prompt_version="worker-retry-exhausted",
        )
        await self._mark_failed(job=job, run=run, error=error)
        return job

    STALE_PENDING_DEFAULT_HOURS = 24
    STALE_PENDING_ERROR_MESSAGE = (
        "Stale pending extraction job: no worker progress within the expected window. "
        "Use retry to run again."
    )

    @Transactional()
    async def abandon_stale_pending_jobs(
        self,
        *,
        older_than_hours: int = STALE_PENDING_DEFAULT_HOURS,
        limit: int = 500,
        dry_run: bool = False,
    ) -> dict[str, Any]:
        """Mark long-idle pending jobs as failed so they can be retried via ``retry_job``."""
        if older_than_hours < 0:
            raise ExtractionServiceError("older_than_hours must be non-negative")
        cutoff = datetime.utcnow() - timedelta(hours=older_than_hours)
        jobs = await self.job_repository.list_stale_pending(
            older_than=cutoff,
            limit=limit,
            statuses=("pending", "queued"),
        )
        if dry_run:
            return {
                "dry_run": True,
                "older_than_hours": older_than_hours,
                "cutoff": cutoff.isoformat(),
                "count": len(jobs),
                "job_ids": [job.id for job in jobs],
            }

        abandoned: list[str] = []
        finished_at = datetime.utcnow()
        for job in jobs:
            job.status = "failed"
            job.error_type = "stale"
            job.error_message = self.STALE_PENDING_ERROR_MESSAGE
            job.finished_at = finished_at
            await self.job_repository.save(job)
            await self.task_progress_service.mark_job_failed(job, error_message=job.error_message)
            abandoned.append(job.id)

        return {
            "dry_run": False,
            "older_than_hours": older_than_hours,
            "cutoff": cutoff.isoformat(),
            "count": len(abandoned),
            "job_ids": abandoned,
        }

    @Transactional()
    async def delete_job(self, job_id: str, *, requested_by: str | None = None) -> None:
        job = await self.get_job(job_id, requested_by=requested_by)
        if job is None:
            raise ExtractionNotFoundError("Extraction job not found")
        runs = await self.run_repository.list_by_job(job_id)
        if runs or await self.run_repository.has_field_events(job_id):
            raise ExtractionConflictError("Extraction job has runs or field events and cannot be deleted")
        job.status = "cancelled"
        job.finished_at = datetime.utcnow()
        await self.job_repository.save(job)
