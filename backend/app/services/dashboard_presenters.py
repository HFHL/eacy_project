from __future__ import annotations

from collections import Counter
from datetime import datetime
from typing import Any

from app.models import Document, ExtractionJob, Patient, ProjectPatient, ResearchProject
from app.services.archive_grouping_service import ArchiveGroupingService
from app.services.dashboard_formatters import _document_task_status, _project_status_label


class DashboardPresenterMixin:
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
            items.append(
                {
                    "id": project.id,
                    "name": project.project_name,
                    "status": project.status,
                    "status_label": _project_status_label(project.status),
                    "actual_patient_count": counts.get(project.id, 0),
                    "expected_patient_count": expected,
                }
            )
        return items

    def _project_extraction_progress(self, projects: list[ResearchProject], jobs_by_project: dict[str, list[ExtractionJob]]) -> list[dict[str, Any]]:
        items = []
        for project in projects[:6]:
            jobs = jobs_by_project.get(project.id, [])
            if not jobs:
                continue
            status_counts = Counter(job.status for job in jobs)
            items.append(
                {
                    "id": project.id,
                    "name": project.project_name,
                    "total": len(jobs),
                    "processing": status_counts.get("pending", 0) + status_counts.get("running", 0),
                    "completed": status_counts.get("completed", 0),
                    "failed": status_counts.get("failed", 0),
                }
            )
        return items

    def _document_queue_items(self, documents: list[Document], counts: Counter) -> list[dict[str, Any]]:
        items = []
        for document in documents[:20]:
            task_status = _document_task_status(document)
            if task_status in {"parse_failed", "parsing"}:
                items.append(
                    {
                        "document_id": document.id,
                        "file_name": document.original_filename,
                        "task_status": task_status,
                        "created_at": document.updated_at or document.created_at,
                    }
                )
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

    def _recent_activities(
        self,
        documents: list[Document],
        patients: list[Patient],
        projects: list[ResearchProject],
        jobs: list[ExtractionJob],
    ) -> list[dict[str, Any]]:
        activities = []
        for document in documents[:8]:
            activities.append(
                {
                    "type": "document",
                    "title": "上传文档",
                    "description": document.original_filename,
                    "created_at": document.created_at,
                    "entity": {"document_id": document.id, "patient_id": document.patient_id},
                }
            )
        for patient in patients[:5]:
            activities.append(
                {
                    "type": "patient",
                    "title": "患者更新",
                    "description": patient.name,
                    "created_at": patient.updated_at or patient.created_at,
                    "entity": {"patient_id": patient.id},
                }
            )
        for project in projects[:5]:
            activities.append(
                {
                    "type": "project",
                    "title": "科研项目更新",
                    "description": project.project_name,
                    "created_at": project.updated_at or project.created_at,
                    "entity": {"project_id": project.id},
                }
            )
        for job in jobs[:5]:
            activities.append(
                {
                    "type": "task",
                    "title": "抽取任务更新",
                    "description": f"{job.job_type} · {job.status}",
                    "created_at": job.updated_at or job.created_at,
                    "entity": {"project_id": job.project_id, "patient_id": job.patient_id, "document_id": job.document_id},
                }
            )
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
