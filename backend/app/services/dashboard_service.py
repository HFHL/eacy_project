from __future__ import annotations

import copy
import time as monotonic_clock
from collections import Counter
from datetime import datetime, time
from typing import Any

from app.services.dashboard_formatters import _document_task_status, _project_status_label
from app.services.dashboard_presenters import DashboardPresenterMixin
from app.services.dashboard_queries import DashboardQueryMixin
from core.db import session


DASHBOARD_CACHE_TTL_SECONDS = 5.0


def _today_start() -> datetime:
    return datetime.combine(datetime.utcnow().date(), time.min)


class DashboardService(DashboardQueryMixin, DashboardPresenterMixin):
    _dashboard_cache: dict[str, tuple[float, dict[str, Any]]] = {}

    def _session(self):
        return session

    async def get_dashboard(self, *, user_id: str | None = None) -> dict[str, Any]:
        cache_key = user_id or "__all__"
        now = monotonic_clock.monotonic()
        cached = self._dashboard_cache.get(cache_key)
        if cached is not None and now - cached[0] <= DASHBOARD_CACHE_TTL_SECONDS:
            return copy.deepcopy(cached[1])

        payload = await self._build_dashboard(user_id=user_id)
        self._dashboard_cache[cache_key] = (now, payload)
        return copy.deepcopy(payload)

    async def _build_dashboard(self, *, user_id: str | None = None) -> dict[str, Any]:
        today = _today_start()
        document_summary = await self._document_summary_from_db(user_id=user_id, today=today)
        patient_summary = await self._patient_summary_from_db(user_id=user_id, today=today)
        project_summary = await self._project_summary_from_db(user_id=user_id, today=today)

        task_status_counts = Counter(document_summary["task_status_counts"])
        unarchived_documents = await self._list_unarchived_documents(user_id=user_id)
        grouping_patients = await self._list_patients(user_id=user_id) if unarchived_documents else []
        self._apply_archive_group_statuses(task_status_counts, unarchived_documents, grouping_patients)

        recent_documents = await self._list_documents(user_id=user_id, limit=8)
        queue_documents = await self._list_queue_documents(user_id=user_id, limit=20)
        recent_patients = await self._list_patients(user_id=user_id, limit=5)
        recent_projects = await self._list_projects(user_id=user_id, limit=6)
        recent_jobs = await self._list_jobs(user_id=user_id, limit=30)

        return {
            "overview": {
                "patients_total": patient_summary["total"],
                "documents_total": document_summary["total"],
                "total_projects": project_summary["total"],
                "pending_field_conflicts": await self._count_pending_field_conflicts(user_id=user_id),
            },
            "documents": {
                "total": document_summary["total"],
                "today_added": document_summary["today_added"],
                "task_status_counts": dict(task_status_counts),
            },
            "patients": {
                "total": patient_summary["total"],
                "recently_added_today": patient_summary["today_added"],
                "project_distribution": await self._patient_project_distribution_from_db(
                    user_id=user_id,
                    total_patients=patient_summary["total"],
                ),
                "completeness_distribution": patient_summary["completeness_distribution"],
                "conflict_distribution": await self._patient_conflict_distribution(
                    user_id=user_id,
                    total_patients=patient_summary["total"],
                ),
            },
            "projects": {
                "total": project_summary["total"],
                "today_added": project_summary["today_added"],
                "status_distribution": project_summary["status_distribution"],
                "enrollment_progress": await self._project_enrollment_progress_from_db(recent_projects),
                "extraction_progress": await self._project_extraction_progress_from_db(
                    recent_projects,
                    user_id=user_id,
                ),
            },
            "tasks": {
                "queue": self._document_queue_items(queue_documents, task_status_counts),
                "recent_activities": [],
                # KPI 必须用 DB 端 count，避免被 _list_jobs(limit=500) 截断。
                # 旧版基于 len(jobs) 的实现会让"任务"卡片在抽取量大时卡在 500。
                "project_extraction_summary": await self._job_summary_from_db(
                    user_id=user_id, today=today
                ),
            },
            "activities": {
                "recent": self._recent_activities(recent_documents, recent_patients, recent_projects, recent_jobs),
            },
        }

    async def get_active_tasks(self, *, user_id: str | None = None) -> dict[str, Any]:
        jobs = await self._list_jobs(user_id=user_id, limit=100)
        active_statuses = {"pending", "running", "failed", "completed_with_errors"}
        active_jobs = [job for job in jobs if job.status in active_statuses]
        tasks = [self._job_task_item(job) for job in active_jobs[:30]]
        return {
            "tasks": tasks,
            "total": len(tasks),
            "active_count": sum(1 for job in active_jobs if job.status in {"pending", "running"}),
            "summary_by_status": dict(Counter(job.status for job in active_jobs)),
            "summary_by_category": dict(Counter(item["task_category"] for item in tasks)),
        }
