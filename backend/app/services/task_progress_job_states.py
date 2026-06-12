from __future__ import annotations

from app.models import ExtractionJob


class TaskProgressJobStateMixin:
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
        """Mark a job item as succeeded, including empty-result successes."""
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

    def _job_message(self, job: ExtractionJob) -> str:
        if job.target_form_key:
            return f"等待抽取 {job.target_form_key}"
        if job.document_id:
            return "等待抽取文档"
        return "等待抽取"
