from __future__ import annotations

from typing import Any

from sqlalchemy import select

from app.models import (
    AsyncTaskBatch,
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
)
from core.db import session


class AdminTaskDetailMixin:
    async def _single_job_detail(self, job: ExtractionJob, item: AsyncTaskItem | None) -> dict[str, Any]:
        jobs = [await self._job_detail_payload(job, item=item)]
        project_name, patient_name, schema_name = await self._names_for_scope(
            project_id=job.project_id,
            project_patient_id=job.project_patient_id,
            patient_id=job.patient_id,
            schema_version_id=job.schema_version_id,
        )
        normalized_status = self._normalize_item_status(item) if item is not None else self._normalize_job_status(job)
        summary = {
            "id": item.batch_id if item is not None and item.batch_id else job.id,
            "source_table": "extraction_jobs",
            "task_type": self._admin_task_type(self._task_type_for_job(job), [item] if item else []),
            "status": normalized_status,
            "progress": item.progress if item is not None else int(job.progress or 0),
            "project_id": job.project_id,
            "project_name": project_name,
            "patient_id": job.patient_id,
            "patient_name": patient_name,
            "schema_name": schema_name,
            "target_section": job.target_form_key,
            "completed_count": 1 if normalized_status in {"succeeded", "completed"} else 0,
            "failed_count": 1 if normalized_status == "failed" else 0,
            "running_count": 1 if normalized_status == "running" else 0,
            "pending_count": 1 if normalized_status in {"pending", "queued", "created"} else 0,
            "started_at": (item.started_at if item else None) or job.started_at,
            "finished_at": (item.finished_at if item else None) or job.finished_at,
            "error_message": (item.error_message if item else None) or job.error_message,
        }
        llm_calls = await self._llm_calls_for_jobs([job.id], jobs_payload=jobs)
        return {"summary": summary, "jobs": jobs, "llm_source": "llm_call_logs", "llm_calls": llm_calls}

    async def _batch_detail(self, batch: AsyncTaskBatch) -> dict[str, Any]:
        items = await self._items_for_batch(batch.id)
        jobs = []
        job_ids: list[str] = []
        for item in items:
            job = await session.get(ExtractionJob, item.extraction_job_id) if item.extraction_job_id else None
            jobs.append(await self._job_detail_payload(job, item=item))
            if job is not None:
                job_ids.append(job.id)

        summary = await self._batch_summary(batch, items)
        llm_calls = await self._llm_calls_for_jobs(job_ids, jobs_payload=jobs)
        return {"summary": summary, "jobs": jobs, "llm_source": "llm_call_logs", "llm_calls": llm_calls}

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
        runs_result = await session.execute(
            select(ExtractionRun).where(ExtractionRun.job_id == job.id).order_by(ExtractionRun.run_no.desc()).limit(1)
        )
        run = runs_result.scalars().first()
        extracted_fields = await self._extracted_fields(run.id) if run is not None else []
        input_json = job.input_json if isinstance(job.input_json, dict) else None
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
            "target_form_key": job.target_form_key,
            "input_json": input_json,
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

    def _run_payload(
        self,
        run: ExtractionRun | None,
        *,
        job: ExtractionJob,
        extracted_fields: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
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
            "field_with_evidence_count": sum(
                1 for field in extracted_fields if field.get("source_text") or field.get("source_page") is not None
            ),
            "started_at": run.started_at,
            "finished_at": run.finished_at,
            "error_message": run.error_message,
            "extracted_fields": extracted_fields,
            "validation_log": run.validation_log
            or ((run.parsed_output_json or {}).get("validation_log") if isinstance(run.parsed_output_json, dict) else None),
            "error_type": run.error_type,
            "parsed_output_json": run.parsed_output_json,
            "input_snapshot_json": run.input_snapshot_json,
            "raw_output_json": run.raw_output_json,
            "validation_status": run.validation_status,
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
