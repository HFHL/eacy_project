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
from core.config import config
from core.db import Transactional, session


class ExtractionSchedulerMixin:
    def _scheduler_user_key(self, job: ExtractionJob) -> str:
        return str(getattr(job, "requested_by", None) or "__system__")

    def _scheduler_project_key(self, job: ExtractionJob) -> str | None:
        project_id = getattr(job, "project_id", None)
        return str(project_id) if project_id else None

    def _scheduler_queue_limits(self) -> dict[str, int]:
        return {
            "extraction": max(0, int(config.EXTRACTION_CONCURRENCY or 0)),
            "claude-code": max(0, int(config.CLAUDE_CODE_CONCURRENCY or 0)),
        }

    def _choose_jobs_for_fair_dispatch(
        self,
        *,
        candidates: list[ExtractionJob],
        active_jobs: list[ExtractionJob],
        global_limit: int,
        user_limit: int,
        project_limit: int,
        max_to_dispatch: int,
        queue_limits: dict[str, int] | None = None,
    ) -> list[ExtractionJob]:
        if global_limit <= 0 or max_to_dispatch <= 0:
            return []
        active_total = len(active_jobs)
        global_slots = max(0, min(max_to_dispatch, global_limit - active_total))
        if global_slots <= 0:
            return []

        user_counts = Counter(self._scheduler_user_key(job) for job in active_jobs)
        project_counts = Counter(
            project_key
            for job in active_jobs
            if (project_key := self._scheduler_project_key(job)) is not None
        )
        queue_counts = Counter(extraction_queue_for_job(job) for job in active_jobs)
        grouped: dict[str, list[ExtractionJob]] = defaultdict(list)
        for job in candidates:
            grouped[self._scheduler_user_key(job)].append(job)

        selected: list[ExtractionJob] = []
        user_order = sorted(
            grouped,
            key=lambda user_key: (
                user_counts[user_key],
                getattr(grouped[user_key][0], "created_at", None) or datetime.min,
                user_key,
            ),
        )
        while global_slots > 0 and user_order:
            made_progress = False
            for user_key in list(user_order):
                if global_slots <= 0:
                    break
                if user_limit > 0 and user_counts[user_key] >= user_limit:
                    continue
                queue = grouped.get(user_key) or []
                chosen_index: int | None = None
                for index, job in enumerate(queue):
                    queue_key = extraction_queue_for_job(job)
                    queue_limit = (queue_limits or {}).get(queue_key)
                    if queue_limit is not None and queue_counts[queue_key] >= queue_limit:
                        continue
                    project_key = self._scheduler_project_key(job)
                    if project_key is not None and project_limit > 0 and project_counts[project_key] >= project_limit:
                        continue
                    chosen_index = index
                    break
                if chosen_index is None:
                    continue
                job = queue.pop(chosen_index)
                selected.append(job)
                user_counts[user_key] += 1
                project_key = self._scheduler_project_key(job)
                if project_key is not None:
                    project_counts[project_key] += 1
                queue_counts[extraction_queue_for_job(job)] += 1
                global_slots -= 1
                made_progress = True
                if not queue:
                    user_order.remove(user_key)
            if not made_progress:
                break
        return selected

    async def _schedule_or_enqueue_extraction_task(
        self,
        job_id: str,
        *,
        reset_progress: bool = False,
        waiting_message: str | None = None,
        queued_message: str | None = None,
    ) -> None:
        if not config.EXTRACTION_SCHEDULER_ENABLED:
            await self._enqueue_extraction_task(
                job_id,
                reset_progress=reset_progress,
                queued_message=queued_message,
            )
            return
        job = await self.get_job(job_id)
        if job is None:
            raise ExtractionNotFoundError("Extraction job not found")
        job.status = "pending"
        if reset_progress:
            job.progress = 0
        await self.job_repository.save(job)
        await self.task_progress_service.mark_job_waiting_for_scheduler(
            job,
            message=waiting_message,
            reset_progress=reset_progress,
            commit=True,
        )

    @Transactional()
    async def schedule_pending_extraction_jobs(
        self,
        *,
        global_limit: int | None = None,
        user_limit: int | None = None,
        project_limit: int | None = None,
        batch_size: int | None = None,
    ) -> dict[str, Any]:
        if not config.EXTRACTION_SCHEDULER_ENABLED:
            return {
                "skipped": True,
                "reason": "EXTRACTION_SCHEDULER_ENABLED is false",
                "dispatched_jobs": 0,
                "job_ids": [],
            }
        effective_global_limit = global_limit if global_limit is not None else config.EXTRACTION_GLOBAL_CONCURRENCY
        effective_user_limit = user_limit if user_limit is not None else config.EXTRACTION_USER_CONCURRENCY
        effective_project_limit = project_limit if project_limit is not None else config.EXTRACTION_PROJECT_CONCURRENCY
        effective_batch_size = max(1, batch_size if batch_size is not None else config.EXTRACTION_SCHEDULER_BATCH_SIZE)
        queue_limits = self._scheduler_queue_limits()
        active_jobs = await self.job_repository.list_active_for_scheduler()
        candidate_limit = max(effective_batch_size * 5, effective_batch_size)
        candidates = [
            job
            for job in await self.job_repository.list_pending_for_scheduler(limit=candidate_limit)
            if not (isinstance(job.input_json, dict) and job.input_json.get("wait_for_document_ready") is True)
        ]
        selected = self._choose_jobs_for_fair_dispatch(
            candidates=candidates,
            active_jobs=active_jobs,
            global_limit=effective_global_limit,
            user_limit=effective_user_limit,
            project_limit=effective_project_limit,
            max_to_dispatch=effective_batch_size,
            queue_limits=queue_limits,
        )
        dispatched: list[str] = []
        for job in selected:
            await self._enqueue_extraction_task(
                job.id,
                queued_message="任务已由公平调度器进入后台队列",
                commit_progress=False,
            )
            dispatched.append(job.id)
        return {
            "skipped": False,
            "global_limit": effective_global_limit,
            "user_limit": effective_user_limit,
            "project_limit": effective_project_limit,
            "queue_limits": queue_limits,
            "active_jobs": len(active_jobs),
            "candidate_jobs": len(candidates),
            "dispatched_jobs": len(dispatched),
            "job_ids": dispatched,
        }

    async def _enqueue_extraction_task(
        self,
        job_id: str,
        *,
        reset_progress: bool = False,
        queued_message: str | None = None,
        commit_progress: bool = True,
    ) -> None:
        from app.workers.celery_app import EXTRACTION_QUEUE, EXTRACTION_TASK_NAME, celery_app

        job = await self.get_job(job_id)
        queue = extraction_queue_for_job(job) if job is not None else EXTRACTION_QUEUE
        try:
            result = celery_app.send_task(
                EXTRACTION_TASK_NAME,
                args=[job_id],
                queue=queue,
                routing_key=queue,
            )
        except Exception as error:
            error_message = f"Extraction task could not be queued: {error}"
            if job is not None:
                job.status = "failed"
                job.error_type = "enqueue_failed"
                job.error_message = error_message
                job.finished_at = datetime.utcnow()
                await self.job_repository.save(job)
                await self.task_progress_service.mark_job_failed(job, error_message=error_message)
            await session.commit()
            raise ExtractionConflictError(error_message) from error
        if job is not None:
            job.status = "queued"
            job.progress = max(int(job.progress or 0), 5)
            if job.error_type == "enqueue_failed":
                job.error_type = None
                job.error_message = None
            await self.job_repository.save(job)
        await self.task_progress_service.mark_job_queued(
            job_id,
            celery_task_id=getattr(result, "id", None),
            message=queued_message,
            reset_progress=reset_progress,
            commit=commit_progress,
        )

    async def _commit_pending_jobs_before_enqueue(self) -> None:
        try:
            await session.commit()
        except LookupError:
            return
