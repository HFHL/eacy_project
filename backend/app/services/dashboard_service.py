from __future__ import annotations

import copy
import time as monotonic_clock
from collections import Counter, defaultdict
from datetime import datetime, time
from typing import Any

from sqlalchemy import and_, case, func, or_, select

from app.models import Document, ExtractionJob, FieldValueEvent, Patient, ProjectPatient, ResearchProject
from app.services.archive_grouping_service import ArchiveGroupingService
from core.db import session


DASHBOARD_CACHE_TTL_SECONDS = 5.0


def _today_start() -> datetime:
    return datetime.combine(datetime.utcnow().date(), time.min)


def _document_task_status(document: Document) -> str:
    if document.status == "archived" or document.archived_at is not None:
        return "archived"
    if document.status == "failed" or document.ocr_status == "failed":
        return "parse_failed"
    if document.status == "ocr_pending" or document.ocr_status in {"queued", "running"}:
        return "parsing"
    if document.status == "ocr_completed" or document.ocr_status == "completed":
        return "parsed"
    return document.status or "uploaded"


def _project_status_label(status: str | None) -> str:
    labels = {
        "planning": "规划中",
        "active": "进行中",
        "paused": "已暂停",
        "completed": "已完成",
        "archived": "已归档",
        "draft": "草稿",
    }
    return labels.get(status or "", status or "未知")


class DashboardService:
    _dashboard_cache: dict[str, tuple[float, dict[str, Any]]] = {}

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

    async def _list_documents(self, *, user_id: str | None, limit: int | None = None) -> list[Document]:
        query = select(Document).where(Document.status != "deleted").order_by(Document.created_at.desc())
        if user_id is not None:
            query = query.where(Document.uploaded_by == user_id)
        if limit is not None:
            query = query.limit(limit)
        result = await session.execute(query)
        return list(result.scalars().all())

    async def _list_patients(self, *, user_id: str | None, limit: int | None = None) -> list[Patient]:
        query = select(Patient).where(Patient.deleted_at.is_(None)).order_by(Patient.created_at.desc())
        if user_id is not None:
            query = query.where(Patient.owner_id == user_id)
        if limit is not None:
            query = query.limit(limit)
        result = await session.execute(query)
        return list(result.scalars().all())

    async def _list_projects(self, *, user_id: str | None, limit: int | None = None) -> list[ResearchProject]:
        # research_project_service.archive_project 通过把 status 置为 "deleted" 实现软删，
        # 仪表盘 KPI 必须把这部分过滤掉，否则与"科研项目"列表对不上账。
        query = (
            select(ResearchProject)
            .where(ResearchProject.status != "deleted")
            .order_by(ResearchProject.created_at.desc())
        )
        if user_id is not None:
            query = query.where(ResearchProject.owner_id == user_id)
        if limit is not None:
            query = query.limit(limit)
        result = await session.execute(query)
        return list(result.scalars().all())

    async def _list_jobs(self, *, user_id: str | None, limit: int = 500) -> list[ExtractionJob]:
        query = select(ExtractionJob).order_by(ExtractionJob.created_at.desc()).limit(limit)
        if user_id is not None:
            query = query.where(ExtractionJob.requested_by == user_id)
        result = await session.execute(query)
        return list(result.scalars().all())

    async def _list_unarchived_documents(self, *, user_id: str | None) -> list[Document]:
        query = (
            select(Document)
            .where(
                Document.status != "deleted",
                Document.status != "archived",
                Document.archived_at.is_(None),
            )
            .order_by(Document.created_at.desc())
        )
        if user_id is not None:
            query = query.where(Document.uploaded_by == user_id)
        result = await session.execute(query)
        return list(result.scalars().all())

    async def _list_queue_documents(self, *, user_id: str | None, limit: int = 20) -> list[Document]:
        query = (
            select(Document)
            .where(
                Document.status != "deleted",
                or_(
                    Document.status == "failed",
                    Document.ocr_status == "failed",
                    Document.status == "ocr_pending",
                    Document.ocr_status.in_(["queued", "running"]),
                ),
            )
            .order_by(Document.updated_at.desc(), Document.created_at.desc())
            .limit(limit)
        )
        if user_id is not None:
            query = query.where(Document.uploaded_by == user_id)
        result = await session.execute(query)
        return list(result.scalars().all())

    async def _document_summary_from_db(self, *, user_id: str | None, today: datetime) -> dict[str, Any]:
        task_status = case(
            (or_(Document.status == "archived", Document.archived_at.is_not(None)), "archived"),
            (or_(Document.status == "failed", Document.ocr_status == "failed"), "parse_failed"),
            (or_(Document.status == "ocr_pending", Document.ocr_status.in_(["queued", "running"])), "parsing"),
            (or_(Document.status == "ocr_completed", Document.ocr_status == "completed"), "parsed"),
            else_=func.coalesce(Document.status, "uploaded"),
        )
        is_today = case((Document.created_at >= today, 1), else_=0)
        query = (
            select(
                task_status.label("task_status"),
                func.count().label("total"),
                func.coalesce(func.sum(is_today), 0).label("today"),
            )
            .where(Document.status != "deleted")
            .group_by(task_status)
        )
        if user_id is not None:
            query = query.where(Document.uploaded_by == user_id)

        result = await session.execute(query)
        rows = result.all()
        status_counts: dict[str, int] = {}
        total = 0
        today_added = 0
        for row in rows:
            status = str(row.task_status or "uploaded")
            count = int(row.total or 0)
            total += count
            today_added += int(row.today or 0)
            status_counts[status] = count
        return {
            "total": total,
            "today_added": today_added,
            "task_status_counts": status_counts,
        }

    async def _patient_summary_from_db(self, *, user_id: str | None, today: datetime) -> dict[str, Any]:
        filled_name = case((and_(Patient.name.is_not(None), Patient.name != ""), 1), else_=0)
        filled_gender = case((and_(Patient.gender.is_not(None), Patient.gender != ""), 1), else_=0)
        filled_birth_or_age = case((or_(Patient.birth_date.is_not(None), Patient.age.is_not(None)), 1), else_=0)
        filled_department = case((and_(Patient.department.is_not(None), Patient.department != ""), 1), else_=0)
        filled_diagnosis = case((and_(Patient.main_diagnosis.is_not(None), Patient.main_diagnosis != ""), 1), else_=0)
        filled_doctor = case((and_(Patient.doctor_name.is_not(None), Patient.doctor_name != ""), 1), else_=0)
        filled_count = (
            filled_name
            + filled_gender
            + filled_birth_or_age
            + filled_department
            + filled_diagnosis
            + filled_doctor
        )
        is_today = case((Patient.created_at >= today, 1), else_=0)
        query = select(
            func.count().label("total"),
            func.coalesce(func.sum(is_today), 0).label("today"),
            func.coalesce(func.sum(case((filled_count >= 5, 1), else_=0)), 0).label("high"),
            func.coalesce(func.sum(case((and_(filled_count >= 3, filled_count < 5), 1), else_=0)), 0).label("medium"),
            func.coalesce(func.sum(case((filled_count < 3, 1), else_=0)), 0).label("low"),
        ).where(Patient.deleted_at.is_(None))
        if user_id is not None:
            query = query.where(Patient.owner_id == user_id)

        result = await session.execute(query)
        row = result.one()
        high = int(row.high or 0)
        medium = int(row.medium or 0)
        low = int(row.low or 0)
        return {
            "total": int(row.total or 0),
            "today_added": int(row.today or 0),
            "completeness_distribution": [
                {"key": "high", "label": "较完整", "value": high, "color": "#52c41a"},
                {"key": "medium", "label": "部分完整", "value": medium, "color": "#faad14"},
                {"key": "low", "label": "待补充", "value": low, "color": "#ff4d4f"},
            ],
        }

    async def _project_summary_from_db(self, *, user_id: str | None, today: datetime) -> dict[str, Any]:
        is_today = case((ResearchProject.created_at >= today, 1), else_=0)
        query = (
            select(
                ResearchProject.status.label("status"),
                func.count().label("total"),
                func.coalesce(func.sum(is_today), 0).label("today"),
            )
            .where(ResearchProject.status != "deleted")
            .group_by(ResearchProject.status)
        )
        if user_id is not None:
            query = query.where(ResearchProject.owner_id == user_id)

        result = await session.execute(query)
        rows = result.all()
        total = 0
        today_added = 0
        colors = {"planning": "#1677ff", "active": "#52c41a", "paused": "#faad14", "completed": "#722ed1", "archived": "#8c8c8c", "draft": "#d9d9d9"}
        status_distribution = []
        for row in rows:
            status = row.status or "unknown"
            count = int(row.total or 0)
            total += count
            today_added += int(row.today or 0)
            status_distribution.append(
                {
                    "key": status,
                    "label": _project_status_label(status),
                    "value": count,
                    "color": colors.get(status, "#8c8c8c"),
                }
            )
        return {
            "total": total,
            "today_added": today_added,
            "status_distribution": status_distribution,
        }

    async def _list_project_patients(self, projects: list[ResearchProject]) -> list[ProjectPatient]:
        project_ids = [project.id for project in projects]
        if not project_ids:
            return []
        result = await session.execute(select(ProjectPatient).where(ProjectPatient.project_id.in_(project_ids)))
        return list(result.scalars().all())

    def _apply_archive_group_statuses(self, counts: Counter, documents: list[Document], patients: list[Patient]) -> None:
        unarchived = [document for document in documents if document.status != "archived" and document.archived_at is None]
        if not unarchived:
            return
        groups = ArchiveGroupingService().build_groups(unarchived, patients, include_raw_documents=True)
        for group in groups:
            status = group.get("status")
            if status == "new_patient_candidate":
                counts["pending_confirm_new"] += len(group.get("documents") or [])
            elif status == "matched_existing":
                counts["auto_archived"] += len(group.get("documents") or [])
            elif status == "needs_confirmation":
                counts["pending_confirm_review"] += len(group.get("documents") or [])
            elif status == "uncertain":
                counts["pending_confirm_uncertain"] += len(group.get("documents") or [])

    async def _count_pending_field_conflicts(self, *, user_id: str | None) -> int:
        query = select(func.count()).select_from(FieldValueEvent).where(FieldValueEvent.review_status == "conflict")
        if user_id is not None:
            query = query.where(FieldValueEvent.created_by == user_id)
        result = await session.execute(query)
        return int(result.scalar_one() or 0)

    async def _count_patients_with_field_conflicts(self, *, user_id: str | None) -> int:
        from app.models import DataContext

        query = (
            select(func.count(func.distinct(DataContext.patient_id)))
            .select_from(FieldValueEvent)
            .join(DataContext, FieldValueEvent.context_id == DataContext.id)
            .where(FieldValueEvent.review_status == "conflict")
        )
        if user_id is not None:
            query = query.join(Patient, DataContext.patient_id == Patient.id).where(Patient.owner_id == user_id)
        result = await session.execute(query)
        return int(result.scalar_one() or 0)

    async def _patient_conflict_distribution(
        self,
        *,
        user_id: str | None,
        total_patients: int | None = None,
        patients: list[Patient] | None = None,
    ) -> list[dict[str, Any]]:
        with_conflict = await self._count_patients_with_field_conflicts(user_id=user_id)
        total = int(total_patients if total_patients is not None else len(patients or []))
        without_conflict = max(total - with_conflict, 0)
        return [
            {"key": "conflict", "label": "有冲突", "value": with_conflict, "color": "#faad14"},
            {"key": "normal", "label": "无冲突", "value": without_conflict, "color": "#52c41a"},
        ]

    async def _patient_project_distribution_from_db(
        self,
        *,
        user_id: str | None,
        total_patients: int,
    ) -> list[dict[str, Any]]:
        visible_projects = select(ResearchProject.id).where(ResearchProject.status != "deleted")
        if user_id is not None:
            visible_projects = visible_projects.where(ResearchProject.owner_id == user_id)

        query = (
            select(func.count(func.distinct(ProjectPatient.patient_id)))
            .select_from(ProjectPatient)
            .join(Patient, ProjectPatient.patient_id == Patient.id)
            .where(
                ProjectPatient.status != "withdrawn",
                Patient.deleted_at.is_(None),
                ProjectPatient.project_id.in_(visible_projects),
            )
        )
        if user_id is not None:
            query = query.where(Patient.owner_id == user_id)
        result = await session.execute(query)
        in_project = int(result.scalar_one() or 0)
        not_in_project = max(total_patients - in_project, 0)
        return [
            {"key": "in_project", "label": "已入组", "value": in_project, "color": "#1677ff"},
            {"key": "not_in_project", "label": "未入组", "value": not_in_project, "color": "#d9d9d9"},
        ]

    def _patient_project_distribution(self, patients: list[Patient], project_patients: list[ProjectPatient]) -> list[dict[str, Any]]:
        enrolled_patient_ids = {item.patient_id for item in project_patients if item.status != "withdrawn"}
        in_project = sum(1 for patient in patients if patient.id in enrolled_patient_ids)
        not_in_project = max(len(patients) - in_project, 0)
        return [
            {"key": "in_project", "label": "已入组", "value": in_project, "color": "#1677ff"},
            {"key": "not_in_project", "label": "未入组", "value": not_in_project, "color": "#d9d9d9"},
        ]

    def _patient_completeness_distribution(self, patients: list[Patient]) -> list[dict[str, Any]]:
        high = medium = low = 0
        for patient in patients:
            fields = [patient.name, patient.gender, patient.birth_date or patient.age, patient.department, patient.main_diagnosis, patient.doctor_name]
            score = sum(1 for value in fields if value not in (None, "")) / len(fields)
            if score >= 0.75:
                high += 1
            elif score >= 0.4:
                medium += 1
            else:
                low += 1
        return [
            {"key": "high", "label": "较完整", "value": high, "color": "#52c41a"},
            {"key": "medium", "label": "部分完整", "value": medium, "color": "#faad14"},
            {"key": "low", "label": "待补充", "value": low, "color": "#ff4d4f"},
        ]

    def _project_status_distribution(self, projects: list[ResearchProject]) -> list[dict[str, Any]]:
        counts = Counter(project.status or "unknown" for project in projects)
        colors = {"planning": "#1677ff", "active": "#52c41a", "paused": "#faad14", "completed": "#722ed1", "archived": "#8c8c8c", "draft": "#d9d9d9"}
        return [
            {"key": status, "label": _project_status_label(status), "value": value, "color": colors.get(status, "#8c8c8c")}
            for status, value in counts.items()
        ]

    def _project_enrollment_progress(self, projects: list[ResearchProject], counts: Counter) -> list[dict[str, Any]]:
        items = []
        for project in projects[:6]:
            extra = project.extra_json if isinstance(project.extra_json, dict) else {}
            expected = extra.get("expected_patient_count") or extra.get("target_patient_count")
            items.append({
                "id": project.id,
                "name": project.project_name,
                "status": project.status,
                "status_label": _project_status_label(project.status),
                "actual_patient_count": counts.get(project.id, 0),
                "expected_patient_count": expected,
            })
        return items

    async def _project_enrollment_progress_from_db(self, projects: list[ResearchProject]) -> list[dict[str, Any]]:
        project_ids = [project.id for project in projects[:6]]
        counts: Counter = Counter()
        if project_ids:
            result = await session.execute(
                select(ProjectPatient.project_id, func.count().label("total"))
                .where(
                    ProjectPatient.project_id.in_(project_ids),
                    ProjectPatient.status != "withdrawn",
                )
                .group_by(ProjectPatient.project_id)
            )
            counts.update({row.project_id: int(row.total or 0) for row in result.all()})
        return self._project_enrollment_progress(projects, counts)

    def _project_extraction_progress(self, projects: list[ResearchProject], jobs_by_project: dict[str, list[ExtractionJob]]) -> list[dict[str, Any]]:
        items = []
        for project in projects[:6]:
            jobs = jobs_by_project.get(project.id, [])
            if not jobs:
                continue
            status_counts = Counter(job.status for job in jobs)
            items.append({
                "id": project.id,
                "name": project.project_name,
                "total": len(jobs),
                "processing": status_counts.get("pending", 0) + status_counts.get("running", 0),
                "completed": status_counts.get("completed", 0),
                "failed": status_counts.get("failed", 0),
            })
        return items

    async def _project_extraction_progress_from_db(
        self,
        projects: list[ResearchProject],
        *,
        user_id: str | None,
    ) -> list[dict[str, Any]]:
        project_ids = [project.id for project in projects[:6]]
        if not project_ids:
            return []
        query = (
            select(
                ExtractionJob.project_id,
                ExtractionJob.status,
                func.count().label("total"),
            )
            .where(ExtractionJob.project_id.in_(project_ids))
            .group_by(ExtractionJob.project_id, ExtractionJob.status)
        )
        if user_id is not None:
            query = query.where(ExtractionJob.requested_by == user_id)
        result = await session.execute(query)
        counts_by_project: dict[str, Counter] = defaultdict(Counter)
        for row in result.all():
            if row.project_id:
                counts_by_project[row.project_id][row.status] = int(row.total or 0)

        items = []
        for project in projects[:6]:
            status_counts = counts_by_project.get(project.id, Counter())
            total = sum(status_counts.values())
            if not total:
                continue
            items.append({
                "id": project.id,
                "name": project.project_name,
                "total": total,
                "processing": status_counts.get("pending", 0) + status_counts.get("running", 0),
                "completed": status_counts.get("completed", 0),
                "failed": status_counts.get("failed", 0),
            })
        return items

    def _document_queue_items(self, documents: list[Document], counts: Counter) -> list[dict[str, Any]]:
        items = []
        for document in documents[:20]:
            task_status = _document_task_status(document)
            if task_status in {"parse_failed", "parsing"}:
                items.append({
                    "document_id": document.id,
                    "file_name": document.original_filename,
                    "task_status": task_status,
                    "created_at": document.updated_at or document.created_at,
                })
        return items[:8]

    def _job_summary(self, jobs: list[ExtractionJob], *, today: datetime) -> dict[str, Any]:
        return {
            "total": len(jobs),
            "today": sum(1 for job in jobs if job.created_at and job.created_at >= today),
            "pending": sum(1 for job in jobs if job.status == "pending"),
            "running": sum(1 for job in jobs if job.status == "running"),
            "completed": sum(1 for job in jobs if job.status == "completed"),
            "failed": sum(1 for job in jobs if job.status == "failed"),
        }

    async def _job_summary_from_db(self, *, user_id: str | None, today: datetime) -> dict[str, Any]:
        """直接在数据库侧聚合 ExtractionJob 计数，避免内存截断。

        旧实现先把最近 500 条加载到内存再做 sum/len，超过 500 时仪表盘的
        "任务"KPI 会卡在 500、"今日新增"也只算这 500 条里的一部分。这里改成
        一条 GROUP BY 查询拿到全量统计，与"科研项目-数据抽取统计"卡片对得上。
        """
        is_today = case((ExtractionJob.created_at >= today, 1), else_=0)
        query = select(
            ExtractionJob.status.label("status"),
            func.count().label("total"),
            func.coalesce(func.sum(is_today), 0).label("today"),
        ).group_by(ExtractionJob.status)
        if user_id is not None:
            query = query.where(ExtractionJob.requested_by == user_id)

        result = await session.execute(query)
        rows = result.all()

        summary: dict[str, Any] = {
            "total": 0,
            "today": 0,
            "pending": 0,
            "running": 0,
            "completed": 0,
            "failed": 0,
        }
        for row in rows:
            status = (row.status or "").strip()
            total = int(row.total or 0)
            today_count = int(row.today or 0)
            summary["total"] += total
            summary["today"] += today_count
            if status in summary:
                summary[status] = total
        return summary

    def _recent_activities(
        self,
        documents: list[Document],
        patients: list[Patient],
        projects: list[ResearchProject],
        jobs: list[ExtractionJob],
    ) -> list[dict[str, Any]]:
        activities = []
        for document in documents[:8]:
            activities.append({
                "type": "document",
                "title": "上传文档",
                "description": document.original_filename,
                "created_at": document.created_at,
                "entity": {"document_id": document.id, "patient_id": document.patient_id},
            })
        for patient in patients[:5]:
            activities.append({
                "type": "patient",
                "title": "患者更新",
                "description": patient.name,
                "created_at": patient.updated_at or patient.created_at,
                "entity": {"patient_id": patient.id},
            })
        for project in projects[:5]:
            activities.append({
                "type": "project",
                "title": "科研项目更新",
                "description": project.project_name,
                "created_at": project.updated_at or project.created_at,
                "entity": {"project_id": project.id},
            })
        for job in jobs[:5]:
            activities.append({
                "type": "task",
                "title": "抽取任务更新",
                "description": f"{job.job_type} · {job.status}",
                "created_at": job.updated_at or job.created_at,
                "entity": {"project_id": job.project_id, "patient_id": job.patient_id, "document_id": job.document_id},
            })
        return sorted(activities, key=lambda item: item.get("created_at") or datetime.min, reverse=True)[:8]

    def _job_task_item(self, job: ExtractionJob) -> dict[str, Any]:
        category = "parse" if job.job_type in {"patient_ehr", "project_crf"} else "task"
        return {
            "task_id": job.id,
            "task_category": category,
            "status": job.status,
            "progress": job.progress or 0,
            "project_id": job.project_id,
            "patient_id": job.patient_id,
            "document_id": job.document_id,
            "current_step": job.job_type,
            "message": job.error_message,
            "created_at": job.created_at,
            "updated_at": job.updated_at,
        }
