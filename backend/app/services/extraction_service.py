from datetime import datetime
from typing import Any

from app.models import ExtractionJob, ExtractionRun
from app.repositories import ExtractionJobRepository, ExtractionRunRepository, RecordInstanceRepository
from app.services.structured_value_service import StructuredValueService
from core.db import Transactional


class ExtractionServiceError(ValueError):
    pass


class ExtractionNotFoundError(ExtractionServiceError):
    pass


class ExtractionConflictError(ExtractionServiceError):
    pass


class MockExtractor:
    def extract(self, *, job: ExtractionJob) -> dict[str, Any]:
        fields = []
        for field in (job.input_json or {}).get("mock_fields", []):
            if "field_path" in field:
                fields.append(field)

        if not fields:
            fields.append(
                {
                    "field_key": "extraction_summary",
                    "field_path": "mock.extraction.summary",
                    "field_title": "Mock extraction summary",
                    "value_type": "text",
                    "value_text": "Mock extracted value",
                    "confidence": 0.99,
                    "quote_text": "Mock extracted value",
                }
            )

        return {
            "extractor": "MockExtractor",
            "job_id": job.id,
            "fields": fields,
        }


class ExtractionService:
    def __init__(
        self,
        job_repository: ExtractionJobRepository | None = None,
        run_repository: ExtractionRunRepository | None = None,
        record_repository: RecordInstanceRepository | None = None,
        value_service: StructuredValueService | None = None,
        extractor: MockExtractor | None = None,
    ):
        self.job_repository = job_repository or ExtractionJobRepository()
        self.run_repository = run_repository or ExtractionRunRepository()
        self.record_repository = record_repository or RecordInstanceRepository()
        self.value_service = value_service or StructuredValueService()
        self.extractor = extractor or MockExtractor()

    async def create_job(self, *, job_type: str, **params: Any) -> ExtractionJob:
        return await self.job_repository.create({"job_type": job_type, "status": "pending", **params})

    async def start_run(self, *, job_id: str, run_no: int, **params: Any) -> ExtractionRun:
        return await self.run_repository.create(
            {
                "job_id": job_id,
                "run_no": run_no,
                "status": "running",
                "started_at": datetime.utcnow(),
                "created_at": datetime.utcnow(),
                **params,
            }
        )

    async def get_job(self, job_id: str) -> ExtractionJob | None:
        return await self.job_repository.get_by_id(job_id)

    async def list_runs(self, job_id: str) -> list[ExtractionRun]:
        job = await self.get_job(job_id)
        if job is None:
            raise ExtractionNotFoundError("Extraction job not found")
        return await self.run_repository.list_by_job(job_id)

    @Transactional()
    async def create_and_process_job(self, *, job_type: str, requested_by: str | None = None, **params: Any) -> ExtractionJob:
        now = datetime.utcnow()
        job = await self.create_job(
            job_type=job_type,
            requested_by=requested_by,
            progress=0,
            **params,
        )
        job.started_at = now
        job.status = "running"
        await self.job_repository.save(job)

        run = await self.start_run(
            job_id=job.id,
            run_no=1,
            model_name="MockExtractor",
            prompt_version="mock-v1",
            input_snapshot_json={"job_type": job.job_type, "input_json": job.input_json},
        )
        output = self.extractor.extract(job=job)
        run.raw_output_json = output
        run.parsed_output_json = output
        run.validation_status = "valid"

        await self._write_extracted_values(job=job, run=run, parsed_output=output)

        finished_at = datetime.utcnow()
        run.status = "completed"
        run.finished_at = finished_at
        await self.run_repository.save(run)

        job.status = "completed"
        job.progress = 100
        job.finished_at = finished_at
        await self.job_repository.save(job)
        return job

    @Transactional()
    async def retry_job(self, job_id: str) -> ExtractionJob:
        job = await self.get_job(job_id)
        if job is None:
            raise ExtractionNotFoundError("Extraction job not found")
        if job.status == "cancelled":
            raise ExtractionConflictError("Cancelled extraction job cannot be retried")

        runs = await self.run_repository.list_by_job(job_id)
        next_run_no = len(runs) + 1
        job.status = "running"
        job.progress = 0
        job.error_message = None
        job.started_at = datetime.utcnow()
        job.finished_at = None
        await self.job_repository.save(job)

        run = await self.start_run(
            job_id=job.id,
            run_no=next_run_no,
            model_name="MockExtractor",
            prompt_version="mock-v1",
            input_snapshot_json={"job_type": job.job_type, "input_json": job.input_json, "retry": True},
        )
        output = self.extractor.extract(job=job)
        run.raw_output_json = output
        run.parsed_output_json = output
        run.validation_status = "valid"
        await self._write_extracted_values(job=job, run=run, parsed_output=output)

        finished_at = datetime.utcnow()
        run.status = "completed"
        run.finished_at = finished_at
        await self.run_repository.save(run)

        job.status = "completed"
        job.progress = 100
        job.finished_at = finished_at
        await self.job_repository.save(job)
        return job

    @Transactional()
    async def cancel_job(self, job_id: str) -> ExtractionJob:
        job = await self.get_job(job_id)
        if job is None:
            raise ExtractionNotFoundError("Extraction job not found")
        if job.status == "completed":
            raise ExtractionConflictError("Completed extraction job cannot be cancelled")
        job.status = "cancelled"
        job.finished_at = datetime.utcnow()
        await self.job_repository.save(job)
        return job

    @Transactional()
    async def delete_job(self, job_id: str) -> None:
        job = await self.get_job(job_id)
        if job is None:
            raise ExtractionNotFoundError("Extraction job not found")
        runs = await self.run_repository.list_by_job(job_id)
        if runs or await self.run_repository.has_field_events(job_id):
            raise ExtractionConflictError("Extraction job has runs or field events and cannot be deleted")
        job.status = "cancelled"
        job.finished_at = datetime.utcnow()
        await self.job_repository.save(job)

    async def _write_extracted_values(
        self,
        *,
        job: ExtractionJob,
        run: ExtractionRun,
        parsed_output: dict[str, Any],
    ) -> None:
        if job.context_id is None:
            return

        records = await self.record_repository.list_by_context(job.context_id)
        if not records:
            return
        record = records[0]

        for field in parsed_output.get("fields", []):
            field_path = field["field_path"]
            field_key = field.get("field_key") or field_path.split(".")[-1]
            evidences = []
            if job.document_id is not None:
                evidences.append(
                    {
                        "document_id": job.document_id,
                        "evidence_type": "mock",
                        "quote_text": field.get("quote_text") or field.get("value_text"),
                        "evidence_score": field.get("confidence"),
                    }
                )
            await self.value_service.record_ai_extracted_value(
                context_id=job.context_id,
                record_instance_id=field.get("record_instance_id") or record.id,
                field_key=field_key,
                field_path=field_path,
                field_title=field.get("field_title"),
                value_type=field.get("value_type", "text"),
                value_text=field.get("value_text"),
                value_number=field.get("value_number"),
                value_date=field.get("value_date"),
                value_datetime=field.get("value_datetime"),
                value_json=field.get("value_json"),
                unit=field.get("unit"),
                normalized_text=field.get("normalized_text"),
                confidence=field.get("confidence"),
                extraction_run_id=run.id,
                source_document_id=job.document_id,
                evidences=evidences,
            )
