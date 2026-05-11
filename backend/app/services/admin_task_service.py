from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select

from app.models import (
    AsyncTaskBatch,
    AsyncTaskEvent,
    AsyncTaskItem,
    Document,
    ExtractionJob,
    ExtractionRun,
    FieldValueEvent,
    FieldValueEvidence,
    Patient,
    ProjectPatient,
    ResearchProject,
    SchemaTemplate,
    SchemaTemplateVersion,
    User,
)
from app.services.extraction_service import ExtractionService
from core.db import session


ADMIN_TASK_STALE_AFTER = timedelta(minutes=15)
ACTIVE_STATUSES = {"pending", "queued", "running", "stale"}
TERMINAL_JOB_STATUSES = {"completed", "cancelled"}
RETRYABLE_STATUSES = {"pending", "queued", "failed", "cancelled", "stale"}


class AdminTaskNotFoundError(ValueError):
    pass


class AdminTaskConflictError(ValueError):
    pass


class AdminTaskService:
    async def get_stats(self) -> dict[str, Any]:
        task_rows = await self.list_extraction_tasks(limit=1000, offset=0)
        items = task_rows["items"]
        status_counts: dict[str, int] = {}
        for item in items:
            status_counts[item["status"]] = status_counts.get(item["status"], 0) + 1

        return {
            "overview": {
                "total_users": await self._count(User),
                "total_patients": await self._count(Patient),
                "total_documents": await self._count(Document, Document.status != "deleted"),
                "total_projects": await self._count(ResearchProject, ResearchProject.status != "deleted"),
                "total_templates": await self._count(SchemaTemplate, SchemaTemplate.status != "archived"),
                "active_tasks": sum(status_counts.get(status, 0) for status in ACTIVE_STATUSES),
            },
            "tasks": status_counts,
        }

    async def list_users(self) -> list[dict[str, Any]]:
        result = await session.execute(select(User).order_by(User.created_at.desc()).limit(500))
        return [
            {
                "id": user.id,
                "name": user.name or user.username,
                "email": user.email,
                "role": user.role,
                "status": "active" if user.is_active else "inactive",
                "permissions": user.permissions,
                "login_at": user.last_login_at,
                "created_at": user.created_at,
            }
            for user in result.scalars().all()
        ]

    async def list_projects(self) -> list[dict[str, Any]]:
        result = await session.execute(select(ResearchProject).where(ResearchProject.status != "deleted").order_by(ResearchProject.created_at.desc()).limit(500))
        projects = list(result.scalars().all())
        patient_counts = await self._project_patient_counts([project.id for project in projects])
        return [
            {
                "id": project.id,
                "project_name": project.project_name,
                "description": project.description,
                "status": project.status,
                "patient_count": patient_counts.get(project.id, 0),
                "pi_name": None,
                "created_at": project.created_at,
            }
            for project in projects
        ]

    async def list_templates(self) -> list[dict[str, Any]]:
        result = await session.execute(select(SchemaTemplate).where(SchemaTemplate.status != "archived").order_by(SchemaTemplate.created_at.desc()).limit(500))
        templates = list(result.scalars().all())
        latest_versions = await self._latest_template_versions([template.id for template in templates])
        return [
            {
                "id": template.id,
                "template_name": template.template_name,
                "template_code": template.template_code,
                "category": template.template_type,
                "is_system": False,
                "is_published": latest_versions.get(template.id, {}).get("status") == "published",
                "field_count": latest_versions.get(template.id, {}).get("field_count"),
                "version": latest_versions.get(template.id, {}).get("version_no"),
                "source": "database",
                "created_at": template.created_at,
            }
            for template in templates
        ]

    async def list_documents(self, *, page: int = 1, page_size: int = 20) -> dict[str, Any]:
        offset = max(page - 1, 0) * page_size
        total = await self._count(Document, Document.status != "deleted")
        result = await session.execute(
            select(Document, Patient.name)
            .outerjoin(Patient, Patient.id == Document.patient_id)
            .where(Document.status != "deleted")
            .order_by(Document.created_at.desc())
            .limit(page_size)
            .offset(offset)
        )
        items = [
            {
                "id": document.id,
                "file_name": document.file_name or document.original_filename,
                "original_filename": document.original_filename,
                "file_type": document.file_type or document.file_ext,
                "document_type": document.document_type or document.doc_type,
                "is_parsed": document.is_parsed,
                "file_size": document.file_size,
                "document_patient_name": patient_name,
                "document_organization_name": None,
                "status": document.status,
                "created_at": document.created_at,
            }
            for document, patient_name in result.all()
        ]
        return {"items": items, "total": total, "page": page, "page_size": page_size}

    async def list_extraction_tasks(
        self,
        *,
        task_type: str | None = None,
        status: str | None = None,
        keyword: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> dict[str, Any]:
        batches = await self._list_batch_task_summaries()
        batch_job_ids = await self._batch_job_ids()
        jobs = await self._list_history_job_summaries(excluded_job_ids=batch_job_ids)
        rows = batches + jobs

        if task_type and task_type != "all":
            rows = [row for row in rows if row["task_type"] == task_type]
        if status and status != "all":
            rows = [row for row in rows if row["status"] == status]
        if keyword:
            normalized = keyword.strip().lower()
            rows = [row for row in rows if self._matches_keyword(row, normalized)]

        rows.sort(key=lambda row: row.get("updated_at") or row.get("created_at") or datetime.min, reverse=True)
        type_counts = self._count_by(rows, "task_type", include_all=True)
        status_counts = self._count_by(rows, "status")
        return {
            "items": rows[offset : offset + limit],
            "total": len(rows),
            "type_counts": type_counts,
            "status_counts": status_counts,
        }

    async def get_extraction_task_detail(self, task_id: str) -> dict[str, Any]:
        batch = await session.get(AsyncTaskBatch, task_id)
        if batch is not None:
            return await self._batch_detail(batch)
        job = await session.get(ExtractionJob, task_id)
        if job is not None:
            return await self._history_job_detail(job)
        raise AdminTaskNotFoundError("Admin extraction task not found")

    async def list_extraction_task_events(self, task_id: str, *, after_id: str | None = None, limit: int = 200) -> list[dict[str, Any]]:
        batch = await session.get(AsyncTaskBatch, task_id)
        if batch is not None:
            query = select(AsyncTaskEvent).where(AsyncTaskEvent.batch_id == task_id).order_by(AsyncTaskEvent.created_at, AsyncTaskEvent.id).limit(limit)
            if after_id:
                marker = await session.get(AsyncTaskEvent, after_id)
                if marker is not None:
                    query = (
                        select(AsyncTaskEvent)
                        .where(AsyncTaskEvent.batch_id == task_id)
                        .where(AsyncTaskEvent.created_at >= marker.created_at)
                        .where(AsyncTaskEvent.id != after_id)
                        .order_by(AsyncTaskEvent.created_at, AsyncTaskEvent.id)
                        .limit(limit)
                    )
            result = await session.execute(query)
            return [self._event_payload(event, task_id=task_id) for event in result.scalars().all()]

        job = await session.get(ExtractionJob, task_id)
        if job is not None:
            return [self._synthetic_job_event(job)]
        raise AdminTaskNotFoundError("Admin extraction task not found")

    async def resubmit_extraction_task(self, task_id: str, *, source: str = "auto", only_failed: bool = True) -> dict[str, Any]:
        jobs = await self._resubmittable_jobs(task_id, source=source, only_failed=only_failed)
        if not jobs:
            return {"task_id": task_id, "resubmitted_job_ids": [], "skipped_job_ids": [], "message": "没有可重新提交的任务"}

        service = ExtractionService()
        resubmitted: list[str] = []
        skipped: list[str] = []
        for job in jobs:
            normalized = self._normalize_job_status(job)
            if normalized not in RETRYABLE_STATUSES:
                skipped.append(job.id)
                continue
            job.status = "pending"
            job.progress = max(int(job.progress or 0), 0)
            job.error_message = None
            job.finished_at = None
            await service.job_repository.save(job)
            await session.commit()
            await service._enqueue_extraction_task(job.id)
            resubmitted.append(job.id)

        return {
            "task_id": task_id,
            "resubmitted_job_ids": resubmitted,
            "skipped_job_ids": skipped,
            "message": f"已重新提交 {len(resubmitted)} 个任务",
        }

    async def _count(self, model: Any, *conditions: Any) -> int:
        query = select(func.count()).select_from(model)
        for condition in conditions:
            query = query.where(condition)
        result = await session.execute(query)
        return int(result.scalar() or 0)

    async def _list_batch_task_summaries(self) -> list[dict[str, Any]]:
        result = await session.execute(select(AsyncTaskBatch).order_by(AsyncTaskBatch.updated_at.desc()).limit(1000))
        batches = list(result.scalars().all())
        rows: list[dict[str, Any]] = []
        for batch in batches:
            items = await self._items_for_batch(batch.id)
            first_job = await self._first_job_for_items(items)
            project_name, patient_name, schema_name = await self._names_for_scope(
                project_id=batch.project_id,
                project_patient_id=batch.project_patient_id,
                patient_id=batch.patient_id,
                schema_version_id=first_job.schema_version_id if first_job is not None else None,
            )
            status = self._normalize_batch_status(batch)
            rows.append(
                {
                    "id": batch.id,
                    "source_table": "async_task_batches",
                    "task_type": self._admin_task_type(batch.task_type, items),
                    "status": status,
                    "progress": batch.progress,
                    "project_id": batch.project_id,
                    "project_name": project_name,
                    "patient_id": batch.patient_id,
                    "patient_name": patient_name,
                    "schema_name": schema_name,
                    "target_section": next((item.target_form_key for item in items if item.target_form_key), None),
                    "document_count": batch.total_items,
                    "completed_count": batch.succeeded_items,
                    "failed_count": batch.failed_items,
                    "running_count": sum(1 for item in items if self._normalize_item_status(item) == "running"),
                    "pending_count": sum(1 for item in items if self._normalize_item_status(item) in {"pending", "queued"}),
                    "started_at": batch.started_at,
                    "finished_at": batch.finished_at,
                    "created_at": batch.created_at,
                    "updated_at": batch.updated_at,
                    "error_message": batch.error_message,
                    "primary_job_id": next((item.extraction_job_id for item in items if item.extraction_job_id), None),
                }
            )
        return rows

    async def _list_history_job_summaries(self, *, excluded_job_ids: set[str]) -> list[dict[str, Any]]:
        result = await session.execute(
            select(ExtractionJob, Patient.name, Document.original_filename, ResearchProject.project_name, SchemaTemplate.template_name)
            .outerjoin(Patient, Patient.id == ExtractionJob.patient_id)
            .outerjoin(Document, Document.id == ExtractionJob.document_id)
            .outerjoin(ResearchProject, ResearchProject.id == ExtractionJob.project_id)
            .outerjoin(SchemaTemplateVersion, SchemaTemplateVersion.id == ExtractionJob.schema_version_id)
            .outerjoin(SchemaTemplate, SchemaTemplate.id == SchemaTemplateVersion.template_id)
            .order_by(ExtractionJob.updated_at.desc())
            .limit(1000)
        )
        rows: list[dict[str, Any]] = []
        for job, patient_name, document_name, project_name, schema_name in result.all():
            if job.id in excluded_job_ids:
                continue
            status = self._normalize_job_status(job)
            rows.append(
                {
                    "id": job.id,
                    "source_table": "extraction_jobs",
                    "task_type": self._admin_task_type(job.job_type, []),
                    "status": status,
                    "progress": int(job.progress or 0),
                    "project_id": job.project_id,
                    "project_name": project_name,
                    "patient_id": job.patient_id,
                    "patient_name": patient_name,
                    "schema_name": schema_name,
                    "target_section": job.target_form_key,
                    "document_count": 1 if job.document_id else 0,
                    "completed_count": 1 if status == "completed" else 0,
                    "failed_count": 1 if status == "failed" else 0,
                    "running_count": 1 if status == "running" else 0,
                    "pending_count": 1 if status in {"pending", "queued"} else 0,
                    "started_at": job.started_at,
                    "finished_at": job.finished_at,
                    "created_at": job.created_at,
                    "updated_at": job.updated_at,
                    "error_message": job.error_message,
                    "primary_job_id": job.id,
                    "document_name": document_name,
                }
            )
        return rows

    async def _batch_detail(self, batch: AsyncTaskBatch) -> dict[str, Any]:
        items = await self._items_for_batch(batch.id)
        jobs = []
        for item in items:
            job = await session.get(ExtractionJob, item.extraction_job_id) if item.extraction_job_id else None
            jobs.append(await self._job_detail_payload(job, item=item))

        summary = await self._batch_summary(batch, items)
        return {"summary": summary, "jobs": jobs, "llm_source": "run", "llm_calls": self._llm_calls_from_jobs(jobs)}

    async def _history_job_detail(self, job: ExtractionJob) -> dict[str, Any]:
        job_payload = await self._job_detail_payload(job, item=None)
        summary = {
            "id": job.id,
            "source_table": "extraction_jobs",
            "task_type": self._admin_task_type(job.job_type, []),
            "status": self._normalize_job_status(job),
            "progress": int(job.progress or 0),
            "project_id": job.project_id,
            "patient_id": job.patient_id,
            "schema_name": job_payload.get("schema_name"),
            "target_section": job.target_form_key,
            "completed_count": 1 if job.status == "completed" else 0,
            "failed_count": 1 if job.status == "failed" else 0,
            "running_count": 1 if job.status == "running" else 0,
            "pending_count": 1 if job.status == "pending" else 0,
            "started_at": job.started_at,
            "finished_at": job.finished_at,
            "error_message": job.error_message,
        }
        return {"summary": summary, "jobs": [job_payload], "llm_source": "run", "llm_calls": self._llm_calls_from_jobs([job_payload])}

    async def _batch_summary(self, batch: AsyncTaskBatch, items: list[AsyncTaskItem]) -> dict[str, Any]:
        first_job = await self._first_job_for_items(items)
        project_name, patient_name, schema_name = await self._names_for_scope(
            project_id=batch.project_id,
            project_patient_id=batch.project_patient_id,
            patient_id=batch.patient_id,
            schema_version_id=first_job.schema_version_id if first_job is not None else None,
        )
        return {
            "id": batch.id,
            "source_table": "async_task_batches",
            "task_type": self._admin_task_type(batch.task_type, items),
            "status": self._normalize_batch_status(batch),
            "progress": batch.progress,
            "project_id": batch.project_id,
            "project_name": project_name,
            "patient_id": batch.patient_id,
            "patient_name": patient_name,
            "schema_name": schema_name,
            "target_section": next((item.target_form_key for item in items if item.target_form_key), None),
            "completed_count": batch.succeeded_items,
            "failed_count": batch.failed_items,
            "running_count": sum(1 for item in items if self._normalize_item_status(item) == "running"),
            "pending_count": sum(1 for item in items if self._normalize_item_status(item) in {"pending", "queued"}),
            "started_at": batch.started_at,
            "finished_at": batch.finished_at,
            "error_message": batch.error_message,
        }

    async def _job_detail_payload(self, job: ExtractionJob | None, *, item: AsyncTaskItem | None) -> dict[str, Any]:
        if job is None:
            return {
                "id": item.id if item else "",
                "document_id": item.document_id if item else None,
                "status": self._normalize_item_status(item) if item else "pending",
                "progress": item.progress if item else 0,
                "stage": item.stage if item else None,
                "stage_label": item.stage_label if item else None,
                "last_error": item.error_message if item else None,
                "extraction_run": None,
            }

        document = await session.get(Document, job.document_id) if job.document_id else None
        patient = await session.get(Patient, job.patient_id) if job.patient_id else None
        schema_name = await self._schema_name(job.schema_version_id)
        runs_result = await session.execute(select(ExtractionRun).where(ExtractionRun.job_id == job.id).order_by(ExtractionRun.run_no.desc()).limit(1))
        run = runs_result.scalars().first()
        extracted_fields = await self._extracted_fields(run.id) if run is not None else []
        return {
            "id": item.id if item is not None else job.id,
            "extraction_job_id": job.id,
            "document_id": job.document_id,
            "document_name": (document.file_name or document.original_filename) if document is not None else None,
            "patient_id": job.patient_id,
            "patient_name": patient.name if patient is not None else None,
            "project_id": job.project_id,
            "project_patient_id": job.project_patient_id,
            "schema_name": schema_name,
            "status": self._normalize_item_status(item) if item is not None else self._normalize_job_status(job),
            "progress": item.progress if item is not None else int(job.progress or 0),
            "stage": item.stage if item is not None else None,
            "stage_label": item.stage_label if item is not None else None,
            "attempt_count": len(await self._runs_for_job(job.id)),
            "max_attempts": 3,
            "last_error": (item.error_message if item is not None else None) or job.error_message,
            "started_at": (item.started_at if item is not None else None) or job.started_at,
            "completed_at": (item.finished_at if item is not None else None) or job.finished_at,
            "extraction_run": self._run_payload(run, job=job, extracted_fields=extracted_fields),
        }

    async def _runs_for_job(self, job_id: str) -> list[ExtractionRun]:
        result = await session.execute(select(ExtractionRun).where(ExtractionRun.job_id == job_id).order_by(ExtractionRun.run_no))
        return list(result.scalars().all())

    def _run_payload(self, run: ExtractionRun | None, *, job: ExtractionJob, extracted_fields: list[dict[str, Any]]) -> dict[str, Any] | None:
        if run is None:
            return None
        return {
            "id": run.id,
            "status": run.status,
            "model_name": run.model_name,
            "prompt_version": run.prompt_version,
            "target_mode": "targeted_section" if job.target_form_key else "full_document",
            "target_path": job.target_form_key,
            "field_candidate_count": len(extracted_fields),
            "field_with_evidence_count": sum(1 for field in extracted_fields if field.get("source_text") or field.get("source_page") is not None),
            "started_at": run.started_at,
            "finished_at": run.finished_at,
            "error_message": run.error_message,
            "extracted_fields": extracted_fields,
            "validation_log": (run.parsed_output_json or {}).get("validation_log") if isinstance(run.parsed_output_json, dict) else None,
            "raw_output_json": run.raw_output_json,
            "parsed_output_json": run.parsed_output_json,
        }

    async def _extracted_fields(self, run_id: str) -> list[dict[str, Any]]:
        result = await session.execute(
            select(FieldValueEvent, FieldValueEvidence)
            .outerjoin(FieldValueEvidence, FieldValueEvidence.value_event_id == FieldValueEvent.id)
            .where(FieldValueEvent.extraction_run_id == run_id)
            .order_by(FieldValueEvent.created_at)
            .limit(200)
        )
        fields = []
        seen: set[str] = set()
        for event, evidence in result.all():
            if event.id in seen:
                continue
            seen.add(event.id)
            fields.append(
                {
                    "id": event.id,
                    "field_path": event.field_path,
                    "field_key": event.field_key,
                    "field_title": event.field_title,
                    "value": self._event_value(event),
                    "source_text": evidence.quote_text if evidence is not None else None,
                    "source_page": evidence.page_no if evidence is not None else None,
                    "source_document_id": event.source_document_id,
                }
            )
        return fields

    async def _resubmittable_jobs(self, task_id: str, *, source: str, only_failed: bool) -> list[ExtractionJob]:
        batch = await session.get(AsyncTaskBatch, task_id)
        if batch is not None and source in {"auto", "batch", "project"}:
            items = await self._items_for_batch(batch.id)
            jobs: list[ExtractionJob] = []
            for item in items:
                if not item.extraction_job_id:
                    continue
                normalized = self._normalize_item_status(item)
                if only_failed and normalized not in {"failed", "pending", "queued", "stale"}:
                    continue
                job = await session.get(ExtractionJob, item.extraction_job_id)
                if job is not None:
                    jobs.append(job)
            return jobs

        job = await session.get(ExtractionJob, task_id)
        if job is not None and source in {"auto", "job"}:
            return [job]
        raise AdminTaskNotFoundError("Admin extraction task not found")

    async def _items_for_batch(self, batch_id: str) -> list[AsyncTaskItem]:
        result = await session.execute(select(AsyncTaskItem).where(AsyncTaskItem.batch_id == batch_id).order_by(AsyncTaskItem.created_at))
        return list(result.scalars().all())

    async def _first_job_for_items(self, items: list[AsyncTaskItem]) -> ExtractionJob | None:
        for item in items:
            if not item.extraction_job_id:
                continue
            job = await session.get(ExtractionJob, item.extraction_job_id)
            if job is not None:
                return job
        return None

    async def _batch_job_ids(self) -> set[str]:
        result = await session.execute(select(AsyncTaskItem.extraction_job_id).where(AsyncTaskItem.extraction_job_id.is_not(None)))
        return {str(value) for value in result.scalars().all() if value}

    async def _names_for_scope(
        self,
        *,
        project_id: str | None,
        project_patient_id: str | None,
        patient_id: str | None,
        schema_version_id: str | None,
    ) -> tuple[str | None, str | None, str | None]:
        project = await session.get(ResearchProject, project_id) if project_id else None
        if patient_id is None and project_patient_id is not None:
            project_patient = await session.get(ProjectPatient, project_patient_id)
            patient_id = project_patient.patient_id if project_patient is not None else None
        patient = await session.get(Patient, patient_id) if patient_id else None
        schema_name = await self._schema_name(schema_version_id)
        return (
            project.project_name if project is not None else None,
            patient.name if patient is not None else None,
            schema_name,
        )

    async def _schema_name(self, schema_version_id: str | None) -> str | None:
        if not schema_version_id:
            return None
        result = await session.execute(
            select(SchemaTemplate.template_name)
            .join(SchemaTemplateVersion, SchemaTemplateVersion.template_id == SchemaTemplate.id)
            .where(SchemaTemplateVersion.id == schema_version_id)
        )
        return result.scalar_one_or_none()

    async def _project_patient_counts(self, project_ids: list[str]) -> dict[str, int]:
        if not project_ids:
            return {}
        result = await session.execute(
            select(ProjectPatient.project_id, func.count(ProjectPatient.id))
            .where(ProjectPatient.project_id.in_(project_ids))
            .where(ProjectPatient.status != "withdrawn")
            .group_by(ProjectPatient.project_id)
        )
        return {project_id: int(count) for project_id, count in result.all()}

    async def _latest_template_versions(self, template_ids: list[str]) -> dict[str, dict[str, Any]]:
        if not template_ids:
            return {}
        result = await session.execute(
            select(SchemaTemplateVersion)
            .where(SchemaTemplateVersion.template_id.in_(template_ids))
            .order_by(SchemaTemplateVersion.template_id, SchemaTemplateVersion.version_no.desc())
        )
        latest: dict[str, dict[str, Any]] = {}
        for version in result.scalars().all():
            if version.template_id in latest:
                continue
            latest[version.template_id] = {
                "version_no": version.version_no,
                "status": version.status,
                "field_count": self._schema_field_count(version.schema_json),
            }
        return latest

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

    def _synthetic_job_event(self, job: ExtractionJob) -> dict[str, Any]:
        return {
            "id": f"job:{job.id}:{job.updated_at.isoformat() if job.updated_at else ''}",
            "task_id": job.id,
            "batch_id": None,
            "item_id": None,
            "type": "state_changed",
            "status": self._normalize_job_status(job),
            "progress": job.progress,
            "node": job.status,
            "message": job.error_message or f"任务状态：{job.status}",
            "payload_json": None,
            "ts": job.updated_at or job.created_at,
            "created_at": job.updated_at or job.created_at,
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

    def _llm_calls_from_jobs(self, jobs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        calls: list[dict[str, Any]] = []
        for job in jobs:
            run = job.get("extraction_run") or {}
            validation_log = run.get("validation_log")
            if not validation_log:
                continue
            calls.append(
                {
                    "call_id": run.get("id"),
                    "task_name": job.get("document_name") or job.get("extraction_job_id"),
                    "status": run.get("status"),
                    "started_at": run.get("started_at"),
                    "finished_at": run.get("finished_at"),
                    "validation_log": validation_log,
                    "parsed": run.get("parsed_output_json"),
                    "extracted_raw": run.get("raw_output_json"),
                }
            )
        return calls

    def _count_by(self, rows: list[dict[str, Any]], key: str, *, include_all: bool = False) -> dict[str, int]:
        counts: dict[str, int] = {"all": len(rows)} if include_all else {}
        for row in rows:
            value = row.get(key) or "unknown"
            counts[value] = counts.get(value, 0) + 1
        return counts

    def _matches_keyword(self, row: dict[str, Any], keyword: str) -> bool:
        values = [
            row.get("id"),
            row.get("primary_job_id"),
            row.get("project_name"),
            row.get("patient_name"),
            row.get("schema_name"),
            row.get("target_section"),
            row.get("document_name"),
        ]
        return any(keyword in str(value).lower() for value in values if value)

    def _schema_field_count(self, schema_json: Any) -> int:
        if not isinstance(schema_json, dict):
            return 0
        count = 0

        def walk(node: Any) -> None:
            nonlocal count
            if isinstance(node, dict):
                if node.get("type") != "object" or "properties" not in node:
                    if "type" in node:
                        count += 1
                for child in (node.get("properties") or {}).values():
                    walk(child)
                if "items" in node:
                    walk(node["items"])
            elif isinstance(node, list):
                for child in node:
                    walk(child)

        walk(schema_json)
        return count
