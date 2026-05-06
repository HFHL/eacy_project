from datetime import datetime
from types import SimpleNamespace
from typing import Any

from sqlalchemy import text

from app.models import DataContext, Document, ExtractionJob, ExtractionRun, RecordInstance
from app.repositories import DocumentRepository, ExtractionJobRepository, ExtractionRunRepository, RecordInstanceRepository
from app.services.document_text_extractor import extract_document_text
from app.services.ehr_service import EhrService
from app.services.evidence_location_resolver import resolve_evidence_locations
from app.services.extraction_planner import ExtractionPlanner
from app.services.llm_ehr_extractor import LlmEhrExtractor
from app.services.schema_field_planner import plan_schema_fields
from app.services.simple_ehr_extractor import SimpleEhrExtractor
from app.services.structured_value_service import StructuredValueService
from core.config import config
from core.db import Transactional, session

try:  # pragma: no cover - optional dependency guard
    import httpx
    from sqlalchemy.exc import DisconnectionError, OperationalError
except Exception:  # pragma: no cover
    httpx = None
    DisconnectionError = OperationalError = None


class ExtractionServiceError(ValueError):
    pass


class ExtractionNotFoundError(ExtractionServiceError):
    pass


class ExtractionConflictError(ExtractionServiceError):
    pass


TRANSIENT_EXTRACTION_ERRORS = tuple(
    error_type
    for error_type in (
        getattr(httpx, "TimeoutException", None),
        getattr(httpx, "TransportError", None),
        OperationalError,
        DisconnectionError,
    )
    if isinstance(error_type, type)
)


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
        document_repository: DocumentRepository | None = None,
        ehr_service: EhrService | None = None,
        value_service: StructuredValueService | None = None,
        extractor: MockExtractor | None = None,
        ehr_extractor: SimpleEhrExtractor | None = None,
        llm_ehr_extractor: LlmEhrExtractor | None = None,
        extraction_planner: ExtractionPlanner | None = None,
    ):
        self.job_repository = job_repository or ExtractionJobRepository()
        self.run_repository = run_repository or ExtractionRunRepository()
        self.record_repository = record_repository or RecordInstanceRepository()
        self.document_repository = document_repository or DocumentRepository()
        self.ehr_service = ehr_service or EhrService()
        self.value_service = value_service or StructuredValueService()
        self.extractor = extractor or MockExtractor()
        self.ehr_extractor = ehr_extractor or SimpleEhrExtractor()
        self.llm_ehr_extractor = llm_ehr_extractor or LlmEhrExtractor()
        self.extraction_planner = extraction_planner or ExtractionPlanner()

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
        job = await self.create_job(
            job_type=job_type,
            requested_by=requested_by,
            progress=0,
            **params,
        )
        await self._prepare_job(job=job, created_by=requested_by)
        if await self._should_wait_for_document_ready(job):
            await self.job_repository.save(job)
            return job
        if isinstance(job.input_json, dict) and job.input_json.get("enqueue_async") is True:
            await self.job_repository.save(job)
            await self._commit_pending_jobs_before_enqueue()
            await session.refresh(job)
            self._enqueue_extraction_task(job.id)
            return job
        return await self._process_job(job=job, input_snapshot_extra={}, raise_on_failure=True)

    async def create_planned_jobs(self, *, requested_by: str | None = None, **params: Any) -> list[ExtractionJob]:
        document_id = params.get("document_id")
        context_id = params.get("context_id")
        schema_version_id = params.get("schema_version_id")
        if document_id is None:
            raise ExtractionConflictError("Planned extraction requires document_id")
        if context_id is None:
            raise ExtractionConflictError("Planned extraction requires context_id")

        document = await self.document_repository.get_visible_by_id(document_id)
        if document is None:
            raise ExtractionNotFoundError("Document not found")
        context = await self.ehr_service.context_repository.get_by_id(context_id)
        if context is None:
            raise ExtractionNotFoundError("Data context not found")
        if schema_version_id is None:
            schema_version_id = context.schema_version_id
            params["schema_version_id"] = schema_version_id
        self._validate_job_context(job=self._job_like(params), context=context, document=document)

        schema_version = await self.ehr_service.schema_service.get_version(schema_version_id)
        if schema_version is None:
            raise ExtractionNotFoundError("Schema version not found")
        plan_items = self.extraction_planner.plan(
            document=document,
            schema_json=schema_version.schema_json,
            target_form_key=params.get("target_form_key"),
            input_json=params.get("input_json"),
        )
        if not plan_items:
            raise ExtractionConflictError("No extraction targets matched document")

        jobs: list[ExtractionJob] = []
        base_input = params.get("input_json") or {}
        for item in plan_items:
            input_json = {
                **base_input,
                "source": base_input.get("source") or "extraction_planner",
                "planned_reason": item.reason,
                "match_role": item.match_role,
                "form_keys": [item.target_form_key],
            }
            job_params = {
                **params,
                "target_form_key": item.target_form_key,
                "input_json": input_json,
            }
            jobs.append(await self.create_and_process_job(requested_by=requested_by, **job_params))
        return jobs

    async def update_patient_ehr_folder(self, *, patient_id: str, requested_by: str | None = None) -> dict[str, Any]:
        ehr = await self.ehr_service.get_patient_ehr(patient_id, created_by=requested_by)
        context = ehr.get("context")
        schema_json = ehr.get("schema")
        if context is None or not isinstance(schema_json, dict):
            raise ExtractionNotFoundError("EHR schema context not found")

        documents = await self.document_repository.list_by_patient(patient_id, limit=1000)
        eligible_documents = [document for document in documents if self._document_ready_for_extraction(document)]
        existing_jobs = await self.job_repository.list_by_patient_documents(
            patient_id=patient_id,
            document_ids=[document.id for document in eligible_documents],
        )
        extracted_document_ids = {
            job.document_id
            for job in existing_jobs
            if job.job_type in {"patient_ehr", "targeted_schema"} and job.status in {"pending", "running", "completed"}
        }
        pending_documents = [document for document in eligible_documents if document.id not in extracted_document_ids]

        jobs: list[ExtractionJob] = []
        skipped: list[dict[str, str]] = []
        for document in pending_documents:
            plan_items = self.extraction_planner.plan(
                document=document,
                schema_json=schema_json,
                input_json={"source": "patient_ehr_folder_update"},
                source_roles={"primary"},
            )
            if not plan_items:
                skipped.append({"document_id": document.id, "reason": "no primary source matched"})
                continue
            for item in plan_items:
                jobs.append(
                    await self._create_pending_planned_job(
                        job_type="targeted_schema",
                        requested_by=requested_by,
                        priority=0,
                        patient_id=patient_id,
                        document_id=document.id,
                        context_id=context.id,
                        schema_version_id=context.schema_version_id,
                        target_form_key=item.target_form_key,
                        input_json={
                            "source": "patient_ehr_folder_update",
                            "form_keys": [item.target_form_key],
                            "planned_reason": item.reason,
                            "match_role": item.match_role,
                        },
                    )
                )

        if jobs:
            await self._commit_pending_jobs_before_enqueue()
            for job in jobs:
                self._enqueue_extraction_task(job.id)

        return {
            "patient_id": patient_id,
            "documents_total": len(documents),
            "eligible_documents": len(eligible_documents),
            "already_extracted_documents": len(extracted_document_ids),
            "planned_documents": len(pending_documents),
            "created_jobs": len(jobs),
            "jobs": jobs,
            "submitted_jobs": len(jobs),
            "completed_jobs": 0,
            "failed_jobs": 0,
            "skipped": skipped,
        }

    async def update_project_crf_folder(
        self,
        *,
        project_id: str,
        project_patient_id: str,
        requested_by: str | None = None,
    ) -> dict[str, Any]:
        from app.services.research_project_service import ResearchProjectConflictError, ResearchProjectNotFoundError, ResearchProjectService

        try:
            crf = await ResearchProjectService().get_project_crf(
                project_id=project_id,
                project_patient_id=project_patient_id,
                created_by=requested_by,
            )
        except ResearchProjectNotFoundError as error:
            raise ExtractionNotFoundError(str(error)) from error
        except ResearchProjectConflictError as error:
            raise ExtractionConflictError(str(error)) from error

        context = crf.get("context")
        schema_json = crf.get("schema")
        if context is None or not isinstance(schema_json, dict):
            raise ExtractionNotFoundError("Project CRF schema context not found")

        patient_id = context.patient_id
        documents = await self.document_repository.list_by_patient(patient_id, limit=1000)
        eligible_documents = [document for document in documents if self._document_ready_for_extraction(document)]
        existing_jobs = await self.job_repository.list_by_patient_documents(
            patient_id=patient_id,
            document_ids=[document.id for document in eligible_documents],
        )
        extracted_document_ids = {
            job.document_id
            for job in existing_jobs
            if job.job_type == "project_crf"
            and job.project_id == project_id
            and job.project_patient_id == project_patient_id
            and job.status in {"pending", "running", "completed"}
        }
        pending_documents = [document for document in eligible_documents if document.id not in extracted_document_ids]

        jobs: list[ExtractionJob] = []
        skipped: list[dict[str, str]] = []
        for document in pending_documents:
            plan_items = self.extraction_planner.plan(
                document=document,
                schema_json=schema_json,
                input_json={"source": "project_crf_folder_update"},
                source_roles={"primary"},
            )
            if not plan_items:
                skipped.append({"document_id": document.id, "reason": "no primary source matched"})
                continue
            for item in plan_items:
                jobs.append(
                    await self._create_pending_planned_job(
                        job_type="project_crf",
                        requested_by=requested_by,
                        priority=0,
                        patient_id=patient_id,
                        document_id=document.id,
                        project_id=project_id,
                        project_patient_id=project_patient_id,
                        context_id=context.id,
                        schema_version_id=context.schema_version_id,
                        target_form_key=item.target_form_key,
                        input_json={
                            "source": "project_crf_folder_update",
                            "form_keys": [item.target_form_key],
                            "planned_reason": item.reason,
                            "match_role": item.match_role,
                            "enqueue_async": True,
                        },
                    )
                )

        if jobs:
            await self._commit_pending_jobs_before_enqueue()
            for job in jobs:
                self._enqueue_extraction_task(job.id)

        return {
            "project_id": project_id,
            "project_patient_id": project_patient_id,
            "patient_id": patient_id,
            "documents_total": len(documents),
            "eligible_documents": len(eligible_documents),
            "already_extracted_documents": len(extracted_document_ids),
            "planned_documents": len(pending_documents),
            "created_jobs": len(jobs),
            "jobs": jobs,
            "submitted_jobs": len(jobs),
            "completed_jobs": 0,
            "failed_jobs": 0,
            "skipped": skipped,
        }

    async def _create_pending_planned_job(self, *, job_type: str, requested_by: str | None = None, **params: Any) -> ExtractionJob:
        job = await self.create_job(
            job_type=job_type,
            requested_by=requested_by,
            progress=0,
            **params,
        )
        await self._prepare_job(job=job, created_by=requested_by)
        await self.job_repository.save(job)
        return job

    def _enqueue_extraction_task(self, job_id: str) -> None:
        from app.workers.celery_app import EXTRACTION_QUEUE, EXTRACTION_TASK_NAME, celery_app

        celery_app.send_task(
            EXTRACTION_TASK_NAME,
            args=[job_id],
            queue=EXTRACTION_QUEUE,
            routing_key=EXTRACTION_QUEUE,
        )

    async def _commit_pending_jobs_before_enqueue(self) -> None:
        try:
            await session.commit()
        except LookupError:
            return

    @Transactional()
    async def process_existing_job(self, job_id: str) -> ExtractionJob:
        job = await self.get_job(job_id)
        if job is None:
            raise ExtractionNotFoundError("Extraction job not found")
        self._ensure_can_process(job)
        return await self._process_job(job=job, input_snapshot_extra={"worker": True}, raise_on_failure=False)

    @Transactional()
    async def retry_job(self, job_id: str) -> ExtractionJob:
        job = await self.get_job(job_id)
        if job is None:
            raise ExtractionNotFoundError("Extraction job not found")
        self._ensure_can_retry(job)
        return await self._process_job(job=job, input_snapshot_extra={"retry": True}, raise_on_failure=False)

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

    async def _prepare_job(self, *, job: ExtractionJob, created_by: str | None) -> None:
        if job.context_id is not None and job.schema_version_id is not None:
            return

        if job.job_type == "patient_ehr" and job.patient_id is not None:
            ehr = await self.ehr_service.get_patient_ehr(job.patient_id, created_by=created_by)
            context = ehr.get("context")
            if context is not None:
                job.context_id = context.id
                job.schema_version_id = context.schema_version_id
            return

        if job.job_type == "project_crf" and job.project_id is not None and job.project_patient_id is not None:
            from app.services.research_project_service import ResearchProjectConflictError, ResearchProjectNotFoundError, ResearchProjectService

            try:
                crf = await ResearchProjectService().get_project_crf(
                    project_id=job.project_id,
                    project_patient_id=job.project_patient_id,
                    created_by=created_by,
                )
            except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
                raise ExtractionConflictError(str(error)) from error
            context = crf.get("context")
            if context is not None:
                job.context_id = context.id
                job.schema_version_id = context.schema_version_id
                if job.patient_id is None:
                    job.patient_id = context.patient_id

    async def _process_job(
        self,
        *,
        job: ExtractionJob,
        input_snapshot_extra: dict[str, Any],
        raise_on_failure: bool,
    ) -> ExtractionJob:
        runs = await self.run_repository.list_by_job(job.id)
        next_run_no = len(runs) + 1
        model_name = self._model_name_for_job(job)
        prompt_version = "json-schema-rule-v1" if model_name == "SimpleEhrExtractor" else "mock-v1"
        if model_name == "LlmEhrExtractor":
            prompt_version = "langgraph-ehr-json-v1"

        job.status = "running"
        job.progress = 0
        job.error_message = None
        job.started_at = datetime.utcnow()
        job.finished_at = None
        await self.job_repository.save(job)

        run = await self.start_run(
            job_id=job.id,
            run_no=next_run_no,
            model_name=model_name,
            prompt_version=prompt_version,
            input_snapshot_json={"job_type": job.job_type, "input_json": job.input_json, **input_snapshot_extra},
        )
        try:
            output = await self._extract(job=job)
            run.raw_output_json = output.get("raw_output") if isinstance(output, dict) and "raw_output" in output else output
            run.parsed_output_json = self._build_parsed_output(output)
            run.validation_status = run.parsed_output_json.get("validation_status") or "valid"
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
        except Exception as error:
            await session.rollback()
            await self._mark_failed(job=job, run=run, error=error)
            if not raise_on_failure and self._is_transient_error(error):
                raise
            if raise_on_failure:
                raise
            return job

    async def _mark_failed(self, *, job: ExtractionJob, run: ExtractionRun, error: Exception) -> None:
        finished_at = datetime.utcnow()
        error_message = str(error) or error.__class__.__name__
        run.status = "failed"
        run.finished_at = finished_at
        run.error_message = error_message
        run.validation_status = "invalid"
        await self.run_repository.save(run)

        job.status = "failed"
        job.error_message = error_message
        job.finished_at = finished_at
        await self.job_repository.save(job)
        await session.commit()

    def _build_parsed_output(self, output: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(output, dict):
            return {"fields": [], "validation_status": "valid", "validation_log": [], "attempt_count": 1, "raw_output": output}
        return {
            "fields": output.get("fields", []),
            "validation_status": output.get("validation_status", "valid"),
            "validation_log": output.get("validation_log", []),
            "validation_warnings": output.get("validation_warnings", []),
            "attempt_count": output.get("attempt_count", 1),
            "raw_output": output.get("raw_output", output),
        }

    def _ensure_can_process(self, job: ExtractionJob) -> None:
        if job.status == "cancelled":
            raise ExtractionConflictError("Cancelled extraction job cannot be processed")
        if job.status == "completed":
            raise ExtractionConflictError("Completed extraction job cannot be processed")
        if job.status == "failed":
            raise ExtractionConflictError("Failed extraction job must be retried")

    def _ensure_can_retry(self, job: ExtractionJob) -> None:
        if job.status == "cancelled":
            raise ExtractionConflictError("Cancelled extraction job cannot be retried")
        if job.status == "running":
            raise ExtractionConflictError("Running extraction job cannot be retried")

    def _is_transient_error(self, error: Exception) -> bool:
        return bool(TRANSIENT_EXTRACTION_ERRORS and isinstance(error, TRANSIENT_EXTRACTION_ERRORS))

    def _document_ready_for_extraction(self, document: Document) -> bool:
        if document.status == "deleted" or document.patient_id is None:
            return False
        has_text = bool(getattr(document, "ocr_text", None) or getattr(document, "parsed_content", None) or getattr(document, "ocr_payload_json", None) or getattr(document, "parsed_data", None))
        if not has_text:
            return False
        ocr_status = getattr(document, "ocr_status", None)
        return ocr_status in {None, "completed", "success"}

    async def _should_wait_for_document_ready(self, job: ExtractionJob) -> bool:
        if not isinstance(job.input_json, dict) or job.input_json.get("wait_for_document_ready") is not True:
            return False
        if job.document_id is None:
            return False
        document = await self.document_repository.get_visible_by_id(job.document_id)
        if document is None:
            raise ExtractionNotFoundError("Document not found")
        return not self._document_ready_for_extraction(document)

    async def _extract(self, *, job: ExtractionJob) -> dict[str, Any]:
        if self._uses_schema_extractor(job):
            document, context = await self._resolve_schema_extraction_scope(job)
            schema_version = await self.ehr_service.schema_service.get_version(job.schema_version_id)
            if schema_version is None:
                raise ExtractionNotFoundError("Schema version not found")
            fields = self._filter_schema_fields(plan_schema_fields(schema_version.schema_json), job)
            if not fields:
                raise ExtractionConflictError("No schema fields matched extraction target")
            if self._use_llm_ehr_extractor():
                return self.llm_ehr_extractor.extract(
                    text=extract_document_text(document),
                    fields=fields,
                    document_id=document.id,
                    document=document,
                )
            return self.ehr_extractor.extract(text=extract_document_text(document), fields=fields, document_id=document.id)
        return self.extractor.extract(job=job)

    def _model_name_for_job(self, job: ExtractionJob) -> str:
        if self._uses_schema_extractor(job):
            return "LlmEhrExtractor" if self._use_llm_ehr_extractor() else "SimpleEhrExtractor"
        return "MockExtractor"

    def _uses_schema_extractor(self, job: ExtractionJob) -> bool:
        return job.job_type in {"patient_ehr", "project_crf", "targeted_schema"} and job.document_id is not None

    async def _resolve_schema_extraction_scope(self, job: ExtractionJob) -> tuple[Document, DataContext | None]:
        document = await self.document_repository.get_visible_by_id(job.document_id)
        if document is None:
            raise ExtractionNotFoundError("Document not found")

        context: DataContext | None = None
        if job.context_id is not None:
            context = await self.ehr_service.context_repository.get_by_id(job.context_id)
            if context is None:
                raise ExtractionNotFoundError("Data context not found")
            self._validate_job_context(job=job, context=context, document=document)
            if job.schema_version_id is None:
                job.schema_version_id = context.schema_version_id
        elif job.job_type == "patient_ehr":
            if job.patient_id is None:
                raise ExtractionConflictError("patient_ehr extraction requires patient_id or context_id")
        else:
            raise ExtractionConflictError(f"{job.job_type} extraction requires context_id")

        if job.patient_id is not None and document.patient_id not in (None, job.patient_id):
            raise ExtractionConflictError("Document does not belong to patient")
        if job.schema_version_id is None:
            raise ExtractionNotFoundError("Schema version not found")
        return document, context

    def _validate_job_context(self, *, job: ExtractionJob, context: DataContext, document: Document) -> None:
        if job.job_type == "project_crf" and context.context_type != "project_crf":
            raise ExtractionConflictError("project_crf extraction requires project CRF context")
        if job.job_type == "patient_ehr" and context.context_type != "patient_ehr":
            raise ExtractionConflictError("patient_ehr extraction requires patient EHR context")
        if getattr(job, "project_id", None) is not None and context.project_id != job.project_id:
            raise ExtractionConflictError("Data context does not belong to project")
        if getattr(job, "project_patient_id", None) is not None and context.project_patient_id != job.project_patient_id:
            raise ExtractionConflictError("Data context does not belong to project patient")
        if getattr(job, "patient_id", None) is not None and context.patient_id != job.patient_id:
            raise ExtractionConflictError("Data context does not belong to patient")
        if document.patient_id is not None and context.patient_id != document.patient_id:
            raise ExtractionConflictError("Document does not belong to data context patient")

    def _job_like(self, params: dict[str, Any]) -> Any:
        return SimpleNamespace(
            job_type=params.get("job_type"),
            patient_id=params.get("patient_id"),
            project_id=params.get("project_id"),
            project_patient_id=params.get("project_patient_id"),
        )

    def _filter_schema_fields(self, fields: list[Any], job: ExtractionJob) -> list[Any]:
        input_json = job.input_json or {}
        target_form_keys = set(self._as_list(input_json.get("form_keys")))
        if job.target_form_key:
            target_form_keys.add(job.target_form_key)
        target_field_paths = set(self._as_list(input_json.get("field_paths")))
        target_field_keys = set(self._as_list(input_json.get("field_keys")))
        target_group_keys = set(self._as_list(input_json.get("group_keys")))

        if not any((target_form_keys, target_field_paths, target_field_keys, target_group_keys)):
            return fields

        return [
            field
            for field in fields
            if (not target_form_keys or field.record_form_key in target_form_keys)
            and (not target_field_paths or field.field_path in target_field_paths)
            and (not target_field_keys or field.field_key in target_field_keys)
            and (not target_group_keys or field.group_key in target_group_keys)
        ]

    def _as_list(self, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            return [str(item) for item in value if item is not None]
        return [str(value)]

    def _use_llm_ehr_extractor(self) -> bool:
        return str(config.EACY_EXTRACTION_STRATEGY).lower() in {"llm", "langgraph", "multi_agent"}

    async def _write_extracted_values(
        self,
        *,
        job: ExtractionJob,
        run: ExtractionRun,
        parsed_output: dict[str, Any],
    ) -> None:
        if job.context_id is None:
            return

        if not self._uses_fake_value_service():
            await session.execute(text("SELECT pg_advisory_xact_lock(hashtext(:context_id))"), {"context_id": str(job.context_id)})

        records = await self.record_repository.list_by_context(job.context_id)
        if not records:
            return
        records_by_form = {record.form_key: record for record in records}
        default_record = records[0]
        source_document = None
        if job.document_id is not None:
            source_document = await self.document_repository.get_visible_by_id(job.document_id)

        for field in parsed_output.get("fields", []):
            field_path = field["field_path"]
            field_key = field.get("field_key") or field_path.split(".")[-1]
            record = self._resolve_output_record(
                field=field,
                records_by_form=records_by_form,
                default_record=default_record,
            )
            evidences = []
            if job.document_id is not None:
                field_evidences = field.get("evidences") if isinstance(field.get("evidences"), list) else []
                if field_evidences:
                    resolved_field_evidences = resolve_evidence_locations(source_document, field_evidences, fallback_text=self._field_display_value(field))
                    for evidence in resolved_field_evidences:
                        if not isinstance(evidence, dict):
                            continue
                        evidences.append(
                            {
                                "document_id": job.document_id,
                                "evidence_type": field.get("evidence_type") or "document_text",
                                "quote_text": self._resolved_evidence_quote(evidence=evidence, field=field),
                                "evidence_score": field.get("confidence"),
                                "page_no": evidence.get("page_no"),
                                "bbox_json": evidence.get("bbox_json"),
                                "start_offset": evidence.get("start_offset"),
                                "end_offset": evidence.get("end_offset"),
                            }
                        )
                else:
                    resolved_field_evidences = resolve_evidence_locations(
                        source_document,
                        [{"quote_text": field.get("quote_text") or self._field_display_value(field)}],
                        fallback_text=self._field_display_value(field),
                    )
                    resolved_evidence = resolved_field_evidences[0] if resolved_field_evidences else {}
                    evidences.append(
                        {
                            "document_id": job.document_id,
                            "evidence_type": field.get("evidence_type") or "document_text",
                            "quote_text": self._resolved_evidence_quote(evidence=resolved_evidence, field=field),
                            "evidence_score": field.get("confidence"),
                            "page_no": resolved_evidence.get("page_no"),
                            "bbox_json": resolved_evidence.get("bbox_json"),
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

    def _resolved_evidence_quote(self, *, evidence: dict[str, Any], field: dict[str, Any]) -> str | None:
        matched_text = evidence.get("source_text") or evidence.get("text")
        if matched_text:
            return self._coerce_evidence_text(matched_text)
        bbox_json = evidence.get("bbox_json")
        if isinstance(bbox_json, dict):
            bbox_text = bbox_json.get("source_text") or bbox_json.get("text")
            if bbox_text:
                return self._coerce_evidence_text(bbox_text)
        if bbox_json:
            return self._coerce_evidence_text(
                evidence.get("quote_text") or field.get("quote_text") or self._field_display_value(field)
            )
        return self._coerce_evidence_text(self._field_display_value(field))

    def _field_display_value(self, field: dict[str, Any]) -> Any:
        for key in ("value_text", "value_number", "value_date", "value_datetime", "value_json", "normalized_text"):
            value = field.get(key)
            if value not in (None, "", [], {}):
                return value
        return field.get("quote_text")

    def _coerce_evidence_text(self, value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text if text else None

    def _resolve_output_record(
        self,
        *,
        field: dict[str, Any],
        records_by_form: dict[str, RecordInstance],
        default_record: RecordInstance,
    ) -> RecordInstance:
        record_form_key = field.get("record_form_key")
        if record_form_key and record_form_key in records_by_form:
            return records_by_form[record_form_key]
        parts = str(field.get("field_path") or "").split(".")
        if len(parts) >= 2:
            form_key = f"{parts[0]}.{parts[1]}"
            if form_key in records_by_form:
                return records_by_form[form_key]
        return default_record

    def _uses_fake_value_service(self) -> bool:
        return self.value_service.__class__.__module__.startswith("tests.")
