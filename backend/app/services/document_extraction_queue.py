from __future__ import annotations

from datetime import datetime

from app.models import Document
from app.services.document_service_runtime import document_service_session
from app.services.extraction_strategy import extraction_queue_for_job, with_default_extraction_strategy
from core.config import config


class DocumentExtractionQueueMixin:
    async def _enqueue_extraction_task(self, job_id: str) -> None:
        from app.workers.celery_app import EXTRACTION_QUEUE, EXTRACTION_TASK_NAME, celery_app

        session = document_service_session()
        job = await self.extraction_job_repository.get_by_id(job_id)
        queue = extraction_queue_for_job(job) if job is not None else EXTRACTION_QUEUE
        if config.EXTRACTION_SCHEDULER_ENABLED:
            if job is not None:
                job.status = "pending"
                await self.extraction_job_repository.save(job)
                from app.services.task_progress_service import TaskProgressService

                await TaskProgressService().mark_job_waiting_for_scheduler(
                    job,
                    message="任务正在等待公平调度",
                    commit=True,
                )
            return

        try:
            celery_app.send_task(
                EXTRACTION_TASK_NAME,
                args=[job_id],
                queue=queue,
                routing_key=queue,
            )
        except Exception as exc:
            if job is not None:
                job.status = "failed"
                job.error_type = "enqueue_failed"
                job.error_message = f"Extraction task could not be queued: {exc}"
                job.finished_at = datetime.utcnow()
                await self.extraction_job_repository.save(job)
                from app.services.task_progress_service import TaskProgressService

                await TaskProgressService().mark_job_failed(job, error_message=job.error_message)
                await session.commit()
            raise
        job = await self.extraction_job_repository.get_by_id(job_id)
        if job is not None:
            job.status = "queued"
            job.progress = max(int(job.progress or 0), 5)
            await self.extraction_job_repository.save(job)
            await session.commit()

    async def enqueue_ready_extraction_jobs(self, document_id: str) -> int:
        session = document_service_session()
        jobs = await self.extraction_job_repository.list_pending_waiting_for_document(document_id)
        if not jobs:
            return 0
        for job in jobs:
            input_json = dict(job.input_json or {})
            input_json["wait_for_document_ready"] = False
            input_json["document_ready_at"] = datetime.utcnow().isoformat()
            job.input_json = input_json
            await self.extraction_job_repository.save(job)
        await session.commit()

        for job in jobs:
            await self._enqueue_extraction_task(job.id)
        return len(jobs)

    async def create_and_enqueue_patient_ehr_extraction(
        self,
        *,
        document: Document,
        source: str,
        requested_by: str | None = None,
    ) -> str | None:
        if not document.patient_id:
            return None

        session = document_service_session()
        schema_version = await self.schema_service.get_latest_published("ehr")
        if schema_version is None:
            return None

        context = await self.ehr_service.get_or_create_patient_ehr_context(
            patient_id=document.patient_id,
            schema_version=schema_version,
            created_by=requested_by,
        )
        job = await self.extraction_job_repository.create(
            {
                "job_type": "patient_ehr",
                "status": "pending",
                "priority": 0,
                "patient_id": document.patient_id,
                "document_id": document.id,
                "context_id": context.id,
                "schema_version_id": schema_version.id,
                "input_json": with_default_extraction_strategy(
                    job_type="patient_ehr",
                    input_json={"source": source},
                ),
                "progress": 0,
                "requested_by": requested_by,
            }
        )
        await session.commit()
        await self._enqueue_extraction_task(job.id)
        return job.id
