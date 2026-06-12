from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime
from typing import Any

from sqlalchemy import and_, case, func, or_, select

from app.models import Document, ExtractionJob, FieldValueEvent, Patient, ProjectPatient, ResearchProject
from app.services.dashboard_formatters import _project_status_label


class DashboardQueryMixin:
    async def _list_documents(self, *, user_id: str | None, limit: int | None = None) -> list[Document]:
        query = select(Document).where(Document.status != "deleted").order_by(Document.created_at.desc())
        if user_id is not None:
            query = query.where(Document.uploaded_by == user_id)
        if limit is not None:
            query = query.limit(limit)
        result = await self._session().execute(query)
        return list(result.scalars().all())

    async def _list_patients(self, *, user_id: str | None, limit: int | None = None) -> list[Patient]:
        query = select(Patient).where(Patient.deleted_at.is_(None)).order_by(Patient.created_at.desc())
        if user_id is not None:
            query = query.where(Patient.owner_id == user_id)
        if limit is not None:
            query = query.limit(limit)
        result = await self._session().execute(query)
        return list(result.scalars().all())

    async def _list_projects(self, *, user_id: str | None, limit: int | None = None) -> list[ResearchProject]:
        query = (
            select(ResearchProject)
            .where(ResearchProject.status != "deleted")
            .order_by(ResearchProject.created_at.desc())
        )
        if user_id is not None:
            query = query.where(ResearchProject.owner_id == user_id)
        if limit is not None:
            query = query.limit(limit)
        result = await self._session().execute(query)
        return list(result.scalars().all())

    async def _list_jobs(self, *, user_id: str | None, limit: int = 500) -> list[ExtractionJob]:
        query = select(ExtractionJob).order_by(ExtractionJob.created_at.desc()).limit(limit)
        if user_id is not None:
            query = query.where(ExtractionJob.requested_by == user_id)
        result = await self._session().execute(query)
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
        result = await self._session().execute(query)
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
        result = await self._session().execute(query)
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
        result = await self._session().execute(query)
        status_counts: dict[str, int] = {}
        total = today_added = 0
        for row in result.all():
            status = str(row.task_status or "uploaded")
            count = int(row.total or 0)
            total += count
            today_added += int(row.today or 0)
            status_counts[status] = count
        return {"total": total, "today_added": today_added, "task_status_counts": status_counts}

    async def _patient_summary_from_db(self, *, user_id: str | None, today: datetime) -> dict[str, Any]:
        filled_name = case((and_(Patient.name.is_not(None), Patient.name != ""), 1), else_=0)
        filled_gender = case((and_(Patient.gender.is_not(None), Patient.gender != ""), 1), else_=0)
        filled_birth_or_age = case((or_(Patient.birth_date.is_not(None), Patient.age.is_not(None)), 1), else_=0)
        filled_department = case((and_(Patient.department.is_not(None), Patient.department != ""), 1), else_=0)
        filled_diagnosis = case((and_(Patient.main_diagnosis.is_not(None), Patient.main_diagnosis != ""), 1), else_=0)
        filled_doctor = case((and_(Patient.doctor_name.is_not(None), Patient.doctor_name != ""), 1), else_=0)
        filled_count = filled_name + filled_gender + filled_birth_or_age + filled_department + filled_diagnosis + filled_doctor
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

        row = (await self._session().execute(query)).one()
        return {
            "total": int(row.total or 0),
            "today_added": int(row.today or 0),
            "completeness_distribution": [
                {"key": "high", "label": "较完整", "value": int(row.high or 0), "color": "#52c41a"},
                {"key": "medium", "label": "部分完整", "value": int(row.medium or 0), "color": "#faad14"},
                {"key": "low", "label": "待补充", "value": int(row.low or 0), "color": "#ff4d4f"},
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

        colors = {"planning": "#1677ff", "active": "#52c41a", "paused": "#faad14", "completed": "#722ed1", "archived": "#8c8c8c", "draft": "#d9d9d9"}
        total = today_added = 0
        status_distribution = []
        for row in (await self._session().execute(query)).all():
            status = row.status or "unknown"
            count = int(row.total or 0)
            total += count
            today_added += int(row.today or 0)
            status_distribution.append(
                {"key": status, "label": _project_status_label(status), "value": count, "color": colors.get(status, "#8c8c8c")}
            )
        return {"total": total, "today_added": today_added, "status_distribution": status_distribution}

    async def _list_project_patients(self, projects: list[ResearchProject]) -> list[ProjectPatient]:
        project_ids = [project.id for project in projects]
        if not project_ids:
            return []
        result = await self._session().execute(select(ProjectPatient).where(ProjectPatient.project_id.in_(project_ids)))
        return list(result.scalars().all())

    async def _count_pending_field_conflicts(self, *, user_id: str | None) -> int:
        query = select(func.count()).select_from(FieldValueEvent).where(FieldValueEvent.review_status == "conflict")
        if user_id is not None:
            query = query.where(FieldValueEvent.created_by == user_id)
        result = await self._session().execute(query)
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
        result = await self._session().execute(query)
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
        return [
            {"key": "conflict", "label": "有冲突", "value": with_conflict, "color": "#faad14"},
            {"key": "normal", "label": "无冲突", "value": max(total - with_conflict, 0), "color": "#52c41a"},
        ]

    async def _patient_project_distribution_from_db(self, *, user_id: str | None, total_patients: int) -> list[dict[str, Any]]:
        visible_projects = select(ResearchProject.id).where(ResearchProject.status != "deleted")
        if user_id is not None:
            visible_projects = visible_projects.where(ResearchProject.owner_id == user_id)

        query = (
            select(func.count(func.distinct(ProjectPatient.patient_id)))
            .select_from(ProjectPatient)
            .join(Patient, ProjectPatient.patient_id == Patient.id)
            .where(ProjectPatient.status != "withdrawn", Patient.deleted_at.is_(None), ProjectPatient.project_id.in_(visible_projects))
        )
        if user_id is not None:
            query = query.where(Patient.owner_id == user_id)
        result = await self._session().execute(query)
        in_project = int(result.scalar_one() or 0)
        return [
            {"key": "in_project", "label": "已入组", "value": in_project, "color": "#1677ff"},
            {"key": "not_in_project", "label": "未入组", "value": max(total_patients - in_project, 0), "color": "#d9d9d9"},
        ]

    async def _project_enrollment_progress_from_db(self, projects: list[ResearchProject]) -> list[dict[str, Any]]:
        project_ids = [project.id for project in projects[:6]]
        counts: Counter = Counter()
        if project_ids:
            result = await self._session().execute(
                select(ProjectPatient.project_id, func.count().label("total"))
                .where(ProjectPatient.project_id.in_(project_ids), ProjectPatient.status != "withdrawn")
                .group_by(ProjectPatient.project_id)
            )
            counts.update({row.project_id: int(row.total or 0) for row in result.all()})
        return self._project_enrollment_progress(projects, counts)

    async def _project_extraction_progress_from_db(self, projects: list[ResearchProject], *, user_id: str | None) -> list[dict[str, Any]]:
        project_ids = [project.id for project in projects[:6]]
        if not project_ids:
            return []
        query = (
            select(ExtractionJob.project_id, ExtractionJob.status, func.count().label("total"))
            .where(ExtractionJob.project_id.in_(project_ids))
            .group_by(ExtractionJob.project_id, ExtractionJob.status)
        )
        if user_id is not None:
            query = query.where(ExtractionJob.requested_by == user_id)
        counts_by_project: dict[str, Counter] = defaultdict(Counter)
        for row in (await self._session().execute(query)).all():
            if row.project_id:
                counts_by_project[row.project_id][row.status] = int(row.total or 0)

        items = []
        for project in projects[:6]:
            status_counts = counts_by_project.get(project.id, Counter())
            total = sum(status_counts.values())
            if total:
                items.append(
                    {
                        "id": project.id,
                        "name": project.project_name,
                        "total": total,
                        "processing": status_counts.get("pending", 0) + status_counts.get("running", 0),
                        "completed": status_counts.get("completed", 0),
                        "failed": status_counts.get("failed", 0),
                    }
                )
        return items

    async def _job_summary_from_db(self, *, user_id: str | None, today: datetime) -> dict[str, Any]:
        is_today = case((ExtractionJob.created_at >= today, 1), else_=0)
        query = select(
            ExtractionJob.status.label("status"),
            func.count().label("total"),
            func.coalesce(func.sum(is_today), 0).label("today"),
        ).group_by(ExtractionJob.status)
        if user_id is not None:
            query = query.where(ExtractionJob.requested_by == user_id)

        summary: dict[str, Any] = {"total": 0, "today": 0, "pending": 0, "running": 0, "completed": 0, "failed": 0}
        for row in (await self._session().execute(query)).all():
            status = (row.status or "").strip()
            total = int(row.total or 0)
            summary["total"] += total
            summary["today"] += int(row.today or 0)
            if status in summary:
                summary[status] = total
        return summary
