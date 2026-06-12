"""Admin-facing aggregation for extraction task observability."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select

from app.models import (
    AsyncTaskBatch,
    AsyncTaskItem,
    Document,
    ExtractionJob,
    ExtractionRun,
    LLMCallLog,
)
from app.repositories import AsyncTaskItemRepository
from app.services.admin_extraction_trace_payloads import (
    document_payload,
    llm_call_payload,
    match_payload,
    single_job_summary,
    trace_plan,
)
from app.services.admin_task_service import AdminTaskNotFoundError, AdminTaskService
from core.db import session


class AdminExtractionTraceService:
    def __init__(self, admin_task_service: AdminTaskService | None = None):
        self.admin_task_service = admin_task_service or AdminTaskService()
        self.item_repository = AsyncTaskItemRepository()

    async def get_extraction_task_trace(
        self,
        task_id: str,
        *,
        document_id: str | None = None,
        job_id: str | None = None,
        include_prompts: bool = False,
    ) -> dict[str, Any]:
        batch, items, jobs = await self._resolve_batch_context(task_id)
        if batch is None and not jobs:
            raise AdminTaskNotFoundError("Admin extraction task not found")

        summary = await self._trace_summary(batch, items) if batch is not None else single_job_summary(jobs[0] if jobs else None, items)
        plan = trace_plan(batch, jobs)
        documents = await self._trace_documents_grouped(
            batch=batch,
            items=items,
            jobs=jobs,
            document_id=document_id,
            job_id=job_id,
            include_prompts=include_prompts,
        )
        return {
            "summary": summary,
            "plan": plan,
            "documents": documents,
            "llm_source": "llm_call_logs",
        }

    async def get_llm_call_detail(self, call_id: str) -> dict[str, Any]:
        result = await session.execute(select(LLMCallLog).where(LLMCallLog.call_id == call_id))
        log = result.scalars().first()
        if log is None:
            raise AdminTaskNotFoundError("LLM call log not found")
        return llm_call_payload(log, include_prompts=True)

    async def list_extraction_task_events(
        self,
        task_id: str,
        *,
        after_id: str | None = None,
        item_id: str | None = None,
        job_id: str | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        batch = await session.get(AsyncTaskBatch, task_id)
        if batch is None:
            batch_id = await self._batch_id_for_job(task_id)
            if batch_id is None:
                raise AdminTaskNotFoundError("Admin extraction task not found")
            task_id = batch_id

        if job_id and not item_id:
            item = await self.item_repository.get_by_extraction_job(job_id)
            item_id = item.id if item is not None else None

        from app.repositories import AsyncTaskEventRepository

        events = await AsyncTaskEventRepository().list_by_batch(
            task_id,
            after_id=after_id,
            item_id=item_id,
            limit=limit,
        )
        return [self.admin_task_service._event_payload(event, task_id=task_id) for event in events]

    async def _resolve_batch_context(
        self,
        task_id: str,
    ) -> tuple[AsyncTaskBatch | None, list[AsyncTaskItem], list[dict[str, Any]]]:
        batch = await session.get(AsyncTaskBatch, task_id)
        if batch is not None:
            items = await self.admin_task_service._items_for_batch(batch.id)
            jobs = []
            for item in items:
                job = await session.get(ExtractionJob, item.extraction_job_id) if item.extraction_job_id else None
                jobs.append(await self.admin_task_service._job_detail_payload(job, item=item))
            return batch, items, jobs

        job = await session.get(ExtractionJob, task_id)
        if job is None:
            return None, [], []

        item = await self.item_repository.get_by_extraction_job(job.id)
        if item is not None and item.batch_id:
            linked_batch = await session.get(AsyncTaskBatch, item.batch_id)
            if linked_batch is not None:
                return await self._resolve_batch_context(linked_batch.id)

        job_payload = await self.admin_task_service._job_detail_payload(job, item=item)
        return None, ([item] if item else []), [job_payload]

    async def _batch_id_for_job(self, job_id: str) -> str | None:
        item = await self.item_repository.get_by_extraction_job(job_id)
        return item.batch_id if item is not None else None

    async def _trace_summary(
        self,
        batch: AsyncTaskBatch,
        items: list[AsyncTaskItem],
    ) -> dict[str, Any]:
        first_job = await self.admin_task_service._first_job_for_items(items)
        project_name, patient_name, schema_name = await self.admin_task_service._names_for_scope(
            project_id=batch.project_id,
            project_patient_id=batch.project_patient_id,
            patient_id=batch.patient_id,
            schema_version_id=first_job.schema_version_id if first_job is not None else None,
        )
        return {
            "id": batch.id,
            "source_table": "async_task_batches",
            "task_type": self.admin_task_service._admin_task_type(batch.task_type, items),
            "status": self.admin_task_service._normalize_batch_status(batch),
            "progress": batch.progress,
            "project_id": batch.project_id,
            "project_name": project_name,
            "patient_id": batch.patient_id,
            "patient_name": patient_name,
            "schema_name": schema_name,
            "target_section": next((item.target_form_key for item in items if item.target_form_key), None),
            "completed_count": batch.succeeded_items,
            "failed_count": batch.failed_items,
            "running_count": sum(1 for item in items if self.admin_task_service._normalize_item_status(item) == "running"),
            "pending_count": sum(1 for item in items if self.admin_task_service._normalize_item_status(item) in {"pending", "queued", "created"}),
            "started_at": batch.started_at,
            "finished_at": batch.finished_at,
            "error_message": batch.error_message,
        }

    async def _trace_documents_grouped(
        self,
        *,
        batch: AsyncTaskBatch | None,
        items: list[AsyncTaskItem],
        jobs: list[dict[str, Any]],
        document_id: str | None,
        job_id: str | None,
        include_prompts: bool,
    ) -> list[dict[str, Any]]:
        item_by_job = {str(item.extraction_job_id): item for item in items if item.extraction_job_id}
        job_ids = [job.get("extraction_job_id") or job.get("id") for job in jobs]
        llm_by_job = await self._llm_calls_grouped_by_job(job_ids, jobs_payload=jobs, include_prompts=include_prompts)

        grouped: dict[str, dict[str, Any]] = {}
        for job_payload in jobs:
            extraction_job_id = job_payload.get("extraction_job_id") or job_payload.get("id")
            doc_id = str(job_payload.get("document_id") or "unknown")
            if document_id and doc_id != str(document_id):
                continue
            if job_id and str(extraction_job_id) != str(job_id):
                continue

            if doc_id not in grouped:
                document = await session.get(Document, doc_id) if doc_id != "unknown" else None
                grouped[doc_id] = {
                    **document_payload(document, doc_id),
                    "jobs": [],
                }

            item = item_by_job.get(str(extraction_job_id))
            runs = await self._runs_payload(extraction_job_id) if extraction_job_id else []
            events = []
            if batch is not None and item is not None:
                events = await self.list_extraction_task_events(
                    batch.id,
                    item_id=item.id,
                    limit=500,
                )

            enriched_job = {
                **job_payload,
                "item_id": item.id if item is not None else None,
                "input_json": await self._job_input_json(extraction_job_id),
                "match": match_payload(job_payload),
                "runs": runs,
                "llm_calls": llm_by_job.get(str(extraction_job_id), []),
                "events": events,
            }
            grouped[doc_id]["jobs"].append(enriched_job)

        if batch and isinstance(batch.plan_json, dict):
            for doc_entry in batch.plan_json.get("documents") or []:
                doc_id = str(doc_entry.get("document_id") or "")
                if not doc_id:
                    continue
                if document_id and doc_id != str(document_id):
                    continue
                if doc_id not in grouped:
                    grouped[doc_id] = {**doc_entry, "jobs": []}
                else:
                    grouped[doc_id] = {**doc_entry, **{k: v for k, v in grouped[doc_id].items() if k != "jobs"}, "jobs": grouped[doc_id]["jobs"]}

        return sorted(grouped.values(), key=lambda row: row.get("file_name") or row.get("document_id") or "")

    async def _job_input_json(self, job_id: str | None) -> dict[str, Any] | None:
        if not job_id:
            return None
        job = await session.get(ExtractionJob, job_id)
        return job.input_json if job is not None and isinstance(job.input_json, dict) else None

    async def _runs_payload(self, job_id: str) -> list[dict[str, Any]]:
        result = await session.execute(
            select(ExtractionRun).where(ExtractionRun.job_id == job_id).order_by(ExtractionRun.run_no)
        )
        runs = list(result.scalars().all())
        job = await session.get(ExtractionJob, job_id)
        payloads = []
        for run in runs:
            extracted_fields = await self.admin_task_service._extracted_fields(run.id)
            payloads.append(
                {
                    **self.admin_task_service._run_payload(run, job=job, extracted_fields=extracted_fields),
                    "run_no": run.run_no,
                    "input_snapshot_json": run.input_snapshot_json,
                    "raw_output_json": run.raw_output_json,
                }
            )
        return payloads

    async def _llm_calls_grouped_by_job(
        self,
        job_ids: list[str | None],
        *,
        jobs_payload: list[dict[str, Any]],
        include_prompts: bool,
    ) -> dict[str, list[dict[str, Any]]]:
        valid_ids = [str(job_id) for job_id in job_ids if job_id]
        if not valid_ids:
            return {}
        result = await session.execute(
            select(LLMCallLog).where(LLMCallLog.job_id.in_(valid_ids)).order_by(LLMCallLog.started_at, LLMCallLog.id)
        )
        logs = list(result.scalars().all())
        grouped: dict[str, list[dict[str, Any]]] = {job_id: [] for job_id in valid_ids}
        for log in logs:
            key = str(log.job_id) if log.job_id else ""
            if key not in grouped:
                grouped[key] = []
            grouped[key].append(llm_call_payload(log, include_prompts=include_prompts, jobs_payload=jobs_payload))
        return grouped
