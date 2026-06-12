from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import exists, or_, select

from app.models import (
    AsyncTaskBatch,
    AsyncTaskEvent,
    AsyncTaskItem,
    ExtractionJob,
    Patient,
    ProjectPatient,
    ResearchProject,
    SchemaTemplate,
    SchemaTemplateVersion,
)
from app.services.admin_task_types import AdminTaskNotFoundError
from core.db import session


class AdminTaskListMixin:
    async def list_extraction_tasks(
        self,
        *,
        task_type: str | None = None,
        status: str | None = None,
        keyword: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> dict[str, Any]:
        batches = await self._list_batch_candidates(task_type=task_type)
        rows = await self._batch_task_summaries_from_batches(batches)

        if task_type and task_type != "all":
            rows = [row for row in rows if row["task_type"] == task_type]
        if status and status != "all":
            rows = [row for row in rows if row["status"] == status]
        if keyword:
            normalized = keyword.strip().lower()
            rows = [row for row in rows if self._matches_keyword(row, normalized)]

        rows.sort(key=lambda row: row.get("updated_at") or row.get("created_at") or datetime.min, reverse=True)
        return {
            "items": rows[offset : offset + limit],
            "total": len(rows),
            "type_counts": self._count_by(rows, "task_type", include_all=True),
            "status_counts": self._count_by(rows, "status"),
        }

    async def get_extraction_task_detail(self, task_id: str) -> dict[str, Any]:
        batch = await session.get(AsyncTaskBatch, task_id)
        if batch is not None:
            return await self._batch_detail(batch)

        from app.repositories import AsyncTaskItemRepository

        item = await AsyncTaskItemRepository().get_by_extraction_job(task_id)
        if item is not None and item.batch_id:
            linked_batch = await session.get(AsyncTaskBatch, item.batch_id)
            if linked_batch is not None:
                return await self._batch_detail(linked_batch)

        job = await session.get(ExtractionJob, task_id)
        if job is not None:
            linked_item = item or await AsyncTaskItemRepository().get_by_extraction_job(job.id)
            return await self._single_job_detail(job, linked_item)

        raise AdminTaskNotFoundError("Admin extraction task not found")

    async def list_extraction_task_events(
        self,
        task_id: str,
        *,
        after_id: str | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        batch = await session.get(AsyncTaskBatch, task_id)
        if batch is None:
            raise AdminTaskNotFoundError("Admin extraction task not found")

        query = (
            select(AsyncTaskEvent)
            .where(AsyncTaskEvent.batch_id == task_id)
            .order_by(AsyncTaskEvent.created_at, AsyncTaskEvent.id)
            .limit(limit)
        )
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

    async def _list_batch_candidates(
        self,
        *,
        task_type: str | None = None,
        limit: int = 1000,
    ) -> list[AsyncTaskBatch]:
        query = select(AsyncTaskBatch).order_by(AsyncTaskBatch.updated_at.desc())
        if task_type and task_type not in {"all", "targeted"}:
            if task_type == "patient_ehr":
                query = query.where(AsyncTaskBatch.task_type.ilike("%patient_ehr%"))
            elif task_type == "project_crf":
                query = query.where(AsyncTaskBatch.task_type.ilike("%project_crf%"))
        elif task_type == "targeted":
            query = query.where(
                or_(
                    AsyncTaskBatch.task_type.ilike("%targeted%"),
                    exists(
                        select(AsyncTaskItem.id).where(
                            AsyncTaskItem.batch_id == AsyncTaskBatch.id,
                            AsyncTaskItem.target_form_key.isnot(None),
                        )
                    ),
                )
            )
        result = await session.execute(query.limit(limit))
        return list(result.scalars().all())

    async def _batch_task_summaries_from_batches(self, batches: list[AsyncTaskBatch]) -> list[dict[str, Any]]:
        if not batches:
            return []

        batch_ids = [batch.id for batch in batches]
        items_result = await session.execute(
            select(AsyncTaskItem)
            .where(AsyncTaskItem.batch_id.in_(batch_ids))
            .order_by(AsyncTaskItem.created_at)
        )
        items_by_batch: dict[str, list[AsyncTaskItem]] = {}
        job_ids: set[str] = set()
        for item in items_result.scalars().all():
            items_by_batch.setdefault(item.batch_id, []).append(item)
            if item.extraction_job_id:
                job_ids.add(item.extraction_job_id)

        jobs_by_id: dict[str, ExtractionJob] = {}
        if job_ids:
            jobs_result = await session.execute(select(ExtractionJob).where(ExtractionJob.id.in_(job_ids)))
            jobs_by_id = {job.id: job for job in jobs_result.scalars().all()}

        schema_version_ids: set[str] = set()
        for batch in batches:
            first_job = self._first_job_from_items(items_by_batch.get(batch.id, []), jobs_by_id)
            if first_job is not None and first_job.schema_version_id:
                schema_version_ids.add(first_job.schema_version_id)

        names_cache = await self._bulk_names_for_scope(
            project_ids={batch.project_id for batch in batches if batch.project_id},
            patient_ids={batch.patient_id for batch in batches if batch.patient_id},
            project_patient_ids={batch.project_patient_id for batch in batches if batch.project_patient_id},
            schema_version_ids=schema_version_ids,
        )

        rows: list[dict[str, Any]] = []
        for batch in batches:
            items = items_by_batch.get(batch.id, [])
            first_job = self._first_job_from_items(items, jobs_by_id)
            schema_version_id = first_job.schema_version_id if first_job is not None else None
            project_name, patient_name, schema_name = self._names_from_cache(batch, schema_version_id, names_cache)
            rows.append(
                {
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

    async def _list_batch_task_summaries(self) -> list[dict[str, Any]]:
        batches = await self._list_batch_candidates(limit=1000)
        return await self._batch_task_summaries_from_batches(batches)

    async def _bulk_names_for_scope(
        self,
        *,
        project_ids: set[str],
        patient_ids: set[str],
        project_patient_ids: set[str],
        schema_version_ids: set[str],
    ) -> dict[str, Any]:
        projects_by_id: dict[str, ResearchProject] = {}
        if project_ids:
            result = await session.execute(select(ResearchProject).where(ResearchProject.id.in_(project_ids)))
            projects_by_id = {project.id: project for project in result.scalars().all()}

        project_patients_by_id: dict[str, ProjectPatient] = {}
        resolved_patient_ids = set(patient_ids)
        if project_patient_ids:
            result = await session.execute(select(ProjectPatient).where(ProjectPatient.id.in_(project_patient_ids)))
            project_patients_by_id = {item.id: item for item in result.scalars().all()}
            for item in project_patients_by_id.values():
                if item.patient_id:
                    resolved_patient_ids.add(item.patient_id)

        patients_by_id: dict[str, Patient] = {}
        if resolved_patient_ids:
            result = await session.execute(select(Patient).where(Patient.id.in_(resolved_patient_ids)))
            patients_by_id = {patient.id: patient for patient in result.scalars().all()}

        schema_names: dict[str, str | None] = {}
        if schema_version_ids:
            result = await session.execute(
                select(SchemaTemplateVersion.id, SchemaTemplate.template_name)
                .join(SchemaTemplate, SchemaTemplate.id == SchemaTemplateVersion.template_id)
                .where(SchemaTemplateVersion.id.in_(schema_version_ids))
            )
            schema_names = {version_id: template_name for version_id, template_name in result.all()}

        return {
            "projects": projects_by_id,
            "patients": patients_by_id,
            "project_patients": project_patients_by_id,
            "schema_names": schema_names,
        }

    def _names_from_cache(
        self,
        batch: AsyncTaskBatch,
        schema_version_id: str | None,
        cache: dict[str, Any],
    ) -> tuple[str | None, str | None, str | None]:
        project = cache["projects"].get(batch.project_id) if batch.project_id else None
        patient_id = batch.patient_id
        if patient_id is None and batch.project_patient_id:
            project_patient = cache["project_patients"].get(batch.project_patient_id)
            patient_id = project_patient.patient_id if project_patient is not None else None
        patient = cache["patients"].get(patient_id) if patient_id else None
        schema_name = cache["schema_names"].get(schema_version_id) if schema_version_id else None
        return (
            project.project_name if project is not None else None,
            patient.name if patient is not None else None,
            schema_name,
        )

    @staticmethod
    def _first_job_from_items(
        items: list[AsyncTaskItem],
        jobs_by_id: dict[str, ExtractionJob],
    ) -> ExtractionJob | None:
        for item in items:
            if not item.extraction_job_id:
                continue
            job = jobs_by_id.get(item.extraction_job_id)
            if job is not None:
                return job
        return None

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
