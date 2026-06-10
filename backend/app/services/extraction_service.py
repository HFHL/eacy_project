import json
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from types import SimpleNamespace
from typing import Any

from sqlalchemy import text

from app.models import DataContext, Document, ExtractionJob, ExtractionRun, RecordInstance
from app.repositories import DocumentRepository, ExtractionJobRepository, ExtractionRunRepository, RecordInstanceRepository
from app.services.document_text_extractor import extract_document_text
from app.services.ehr_service import EhrService
from app.services.evidence_location_resolver import (
    build_ocr_reading_units,
    evidence_location_is_trusted,
    flatten_reading_unit_corpus,
    resolve_evidence_locations,
)
from app.services.agent import ClaudeCodeEhrExtractor
from app.services.extraction_strategy import (
    extraction_queue_for_job,
    job_uses_claude_code,
    with_default_extraction_strategy,
)
from app.services.extraction_plan_trace import (
    build_folder_plan_json,
    build_single_job_plan_json,
    document_trace_terms,
)
from app.services.extraction_planner import ExtractionPlanner
from app.services.llm_call_logger import ERROR_TIMEOUT, classify_exception, flush_llm_call_logs
from app.services.llm_ehr_extractor import LlmEhrExtractor
from app.services.record_instance_merge import RecordInstanceMergeResolver
from app.services.schema_field_planner import plan_schema_fields
from app.services.simple_ehr_extractor import SimpleEhrExtractor
from app.services.structured_value_service import StructuredValueService
from app.services.task_progress_service import TaskProgressService
from core.config import config
from core.db import Transactional, release_db_connection, session

try:  # pragma: no cover - optional dependency guard
    import httpx
    from sqlalchemy.exc import DBAPIError, DisconnectionError, InterfaceError, OperationalError
except Exception:  # pragma: no cover
    httpx = None
    DBAPIError = DisconnectionError = InterfaceError = OperationalError = None


class ExtractionServiceError(ValueError):
    pass


class ExtractionNotFoundError(ExtractionServiceError):
    pass


class ExtractionConflictError(ExtractionServiceError):
    pass


class ExtractionCancelledError(ExtractionConflictError):
    pass


@dataclass(frozen=True)
class FolderUpdateOptions:
    target_form_keys: list[str] | None = None
    mode: str = "incremental"


TRANSIENT_EXTRACTION_ERRORS = tuple(
    error_type
    for error_type in (
        getattr(httpx, "TimeoutException", None),
        getattr(httpx, "TransportError", None),
        OperationalError,
        DisconnectionError,
        InterfaceError,
        DBAPIError,
    )
    if isinstance(error_type, type)
)

_TRANSIENT_DB_ORIG_EXCEPTIONS = (
    "ConnectionDoesNotExistError",
    "ConnectionResetError",
    "BrokenPipeError",
    "ConnectionRefusedError",
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
        claude_code_ehr_extractor: ClaudeCodeEhrExtractor | None = None,
        extraction_planner: ExtractionPlanner | None = None,
        task_progress_service: TaskProgressService | None = None,
    ):
        self.job_repository = job_repository or ExtractionJobRepository()
        self.run_repository = run_repository or ExtractionRunRepository()
        self.record_repository = record_repository or RecordInstanceRepository()
        self.document_repository = document_repository or DocumentRepository()
        self.ehr_service = ehr_service or EhrService()
        self.value_service = value_service or StructuredValueService()
        self.extractor = extractor or MockExtractor()
        self.ehr_extractor = ehr_extractor or SimpleEhrExtractor()
        self._llm_ehr_extractor_injected = llm_ehr_extractor is not None
        self.llm_ehr_extractor = llm_ehr_extractor or LlmEhrExtractor()
        self.claude_code_ehr_extractor = claude_code_ehr_extractor or ClaudeCodeEhrExtractor()
        self.extraction_planner = extraction_planner or ExtractionPlanner()
        self.task_progress_service = task_progress_service or TaskProgressService()

    def _normalize_folder_update_mode(self, mode: str | None) -> str:
        normalized = str(mode or "incremental").strip().lower()
        return normalized if normalized in {"incremental", "full"} else "incremental"

    async def _ensure_document_access(self, document_id: str, requested_by: str | None) -> Document:
        document = await self.document_repository.get_visible_by_id(
            document_id,
            uploaded_by=requested_by,
        )
        if document is None:
            raise ExtractionNotFoundError("Document not found")
        return document

    async def _ensure_patient_access(self, patient_id: str, requested_by: str | None) -> None:
        patient = await self.ehr_service.patient_repository.get_active_by_id(
            patient_id,
            owner_id=requested_by,
        )
        if patient is None:
            raise ExtractionNotFoundError("Patient not found")

    async def _ensure_project_access(self, project_id: str, requested_by: str | None) -> None:
        from app.services.research_project_service import ResearchProjectService

        project = await ResearchProjectService().get_project(project_id, owner_id=requested_by)
        if project is None:
            raise ExtractionNotFoundError("Research project not found")

    async def _ensure_context_access(self, context_id: str, requested_by: str | None) -> DataContext:
        context = await self.ehr_service.context_repository.get_by_id(context_id)
        if context is None:
            raise ExtractionNotFoundError("Data context not found")
        if requested_by is None:
            return context
        if context.project_id is not None:
            await self._ensure_project_access(context.project_id, requested_by)
        elif context.patient_id is not None:
            await self._ensure_patient_access(context.patient_id, requested_by)
        else:
            raise ExtractionNotFoundError("Data context not found")
        return context

    async def _ensure_scope_access(self, params: dict[str, Any], requested_by: str | None) -> None:
        if requested_by is None:
            return
        document_id = params.get("document_id")
        patient_id = params.get("patient_id")
        project_id = params.get("project_id")
        context_id = params.get("context_id")
        if document_id is not None:
            await self._ensure_document_access(document_id, requested_by)
        if patient_id is not None:
            await self._ensure_patient_access(patient_id, requested_by)
        if project_id is not None:
            await self._ensure_project_access(project_id, requested_by)
        if context_id is not None:
            await self._ensure_context_access(context_id, requested_by)

    async def _job_visible_to(self, job: ExtractionJob, requested_by: str | None) -> bool:
        if requested_by is None:
            return True
        if str(getattr(job, "requested_by", "") or "") == str(requested_by):
            return True
        if job.document_id is not None:
            document = await self.document_repository.get_visible_by_id(
                job.document_id,
                uploaded_by=requested_by,
            )
            if document is not None:
                return True
        if job.patient_id is not None:
            patient = await self.ehr_service.patient_repository.get_active_by_id(
                job.patient_id,
                owner_id=requested_by,
            )
            if patient is not None:
                return True
        if job.project_id is not None:
            from app.services.research_project_service import ResearchProjectService

            project = await ResearchProjectService().get_project(job.project_id, owner_id=requested_by)
            if project is not None:
                return True
        return False

    def _normalize_folder_update_options(
        self,
        *,
        target_form_keys: list[str] | None = None,
        mode: str | None = None,
    ) -> FolderUpdateOptions:
        keys = [str(key).strip() for key in (target_form_keys or []) if str(key).strip()]
        return FolderUpdateOptions(
            target_form_keys=keys or None,
            mode=self._normalize_folder_update_mode(mode),
        )

    def _filter_plan_items_to_targets(
        self,
        plan_items: list[Any],
        target_form_keys: list[str] | None,
    ) -> list[Any]:
        if not target_form_keys:
            return plan_items
        allowed = set(target_form_keys)
        return [item for item in plan_items if item.target_form_key in allowed]

    def _existing_target_forms_by_document(
        self,
        existing_jobs: list[ExtractionJob],
        *,
        job_types: set[str],
        project_id: str | None = None,
        project_patient_id: str | None = None,
    ) -> dict[str, set[str]]:
        forms_by_document: dict[str, set[str]] = {}
        for job in existing_jobs:
            document_id = getattr(job, "document_id", None)
            target_form_key = getattr(job, "target_form_key", None)
            if document_id is None or not target_form_key:
                continue
            if job.job_type not in job_types:
                continue
            if job.status not in {"pending", "running", "completed"}:
                continue
            if project_id is not None and job.project_id != project_id:
                continue
            if project_patient_id is not None and job.project_patient_id != project_patient_id:
                continue
            forms_by_document.setdefault(str(document_id), set()).add(target_form_key)
        return forms_by_document

    def _pending_plan_items_for_document(
        self,
        *,
        document: Document,
        schema_json: dict[str, Any],
        existing_forms_by_document: dict[str, set[str]],
        options: FolderUpdateOptions,
        source_tag: str,
    ) -> list[Any]:
        plan_items = self.extraction_planner.plan(
            document=document,
            schema_json=schema_json,
            input_json={"source": source_tag},
            source_roles={"primary"},
        )
        plan_items = self._filter_plan_items_to_targets(plan_items, options.target_form_keys)
        if options.mode == "full":
            return plan_items
        existing_forms = existing_forms_by_document.get(str(document.id), set())
        return [item for item in plan_items if item.target_form_key not in existing_forms]

    def _folder_batch_title(self, *, base_title: str, options: FolderUpdateOptions) -> str:
        if not options.target_form_keys:
            return base_title
        count = len(options.target_form_keys)
        return f"{base_title}（靶向 {count} 个表单）"

    def _folder_batch_task_type(self, *, folder_task_type: str, options: FolderUpdateOptions) -> str:
        if options.target_form_keys:
            if folder_task_type == "patient_ehr_folder_extract":
                return "patient_ehr_targeted_extract"
            if folder_task_type == "project_crf_folder_extract":
                return "project_crf_targeted_extract"
        return folder_task_type

    async def _attach_async_task_tracking_for_job(
        self,
        *,
        job: ExtractionJob,
        requested_by: str | None,
    ) -> str:
        if job.job_type == "project_crf":
            title = "科研项目 CRF 抽取"
            scope_type = "project_patient"
            batch_kwargs = {
                "project_id": job.project_id,
                "project_patient_id": job.project_patient_id,
                "patient_id": job.patient_id,
            }
        else:
            title = "病历抽取"
            scope_type = "patient"
            batch_kwargs = {"patient_id": job.patient_id, "document_id": job.document_id}
        if job.target_form_key:
            title = f"{title} · {job.target_form_key}"
        batch = await self.task_progress_service.create_batch(
            task_type=self._task_type_for_job(job),
            title=title,
            scope_type=scope_type,
            requested_by=requested_by,
            **{key: value for key, value in batch_kwargs.items() if value is not None},
        )
        await self.task_progress_service.create_item_for_job(
            batch_id=batch.id,
            task_type=self._task_type_for_job(job),
            job=job,
        )
        document = (
            await self.document_repository.get_visible_by_id(
                job.document_id,
                uploaded_by=requested_by,
            )
            if job.document_id
            else None
        )
        await self.task_progress_service.persist_plan_snapshot(
            batch.id,
            build_single_job_plan_json(job=job, document=document),
        )
        return batch.id

    async def _persist_folder_batch_plan(
        self,
        *,
        batch_id: str,
        options: FolderUpdateOptions,
        schema_version_id: str | None,
        schema_json: dict[str, Any],
        source_tag: str,
        documents: list[Document],
        eligible_documents: list[Document],
        pending_documents: list[Document],
        already_extracted_document_ids: set[str],
        jobs: list[ExtractionJob],
        skipped: list[dict[str, str]],
        extra_stats: dict[str, Any] | None = None,
    ) -> None:
        plan_json = build_folder_plan_json(
            options={"mode": options.mode, "target_form_keys": options.target_form_keys or []},
            schema_version_id=schema_version_id,
            source_tag=source_tag,
            documents_total=len(documents),
            eligible_documents=eligible_documents,
            pending_documents=pending_documents,
            already_extracted_document_ids=already_extracted_document_ids,
            jobs=jobs,
            skipped=skipped,
            schema_json=schema_json,
            planner=self.extraction_planner,
            extra_stats=extra_stats,
        )
        await self.task_progress_service.persist_plan_snapshot(batch_id, plan_json)

    async def create_job(self, *, job_type: str, **params: Any) -> ExtractionJob:
        params["input_json"] = with_default_extraction_strategy(
            job_type=job_type,
            input_json=params.get("input_json"),
        )
        return await self.job_repository.create({"job_type": job_type, "status": "pending", **params})

    async def list_active_ehr_status_by_patients(
        self,
        patient_ids: list[str],
        *,
        requested_by: str | None = None,
    ) -> dict[str, dict[str, Any]]:
        """批量返回若干患者当前 patient_ehr 任务的活跃状态。

        返回值: {patient_id: {active: bool, job_count: int, latest_started_at: datetime | None,
                              latest_updated_at: datetime | None, latest_status: str | None}}
        缺失的 patient_id 也会被填充为 active=False 的默认对象。
        """
        result: dict[str, dict[str, Any]] = {
            pid: {
                "active": False,
                "job_count": 0,
                "latest_started_at": None,
                "latest_updated_at": None,
                "latest_status": None,
            }
            for pid in patient_ids
        }
        if not patient_ids:
            return result
        jobs = await self.job_repository.list_active_by_patient_ids(
            patient_ids,
            job_type="patient_ehr",
            requested_by=requested_by,
        )
        for job in jobs:
            pid = str(job.patient_id) if job.patient_id is not None else None
            if not pid or pid not in result:
                continue
            entry = result[pid]
            entry["active"] = True
            entry["job_count"] += 1
            started = getattr(job, "started_at", None) or getattr(job, "created_at", None)
            updated = getattr(job, "updated_at", None) or started
            if started and (entry["latest_started_at"] is None or started > entry["latest_started_at"]):
                entry["latest_started_at"] = started
                entry["latest_status"] = job.status
            if updated and (entry["latest_updated_at"] is None or updated > entry["latest_updated_at"]):
                entry["latest_updated_at"] = updated
        return result

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

    async def get_job(self, job_id: str, *, requested_by: str | None = None) -> ExtractionJob | None:
        job = await self.job_repository.get_by_id(job_id)
        if job is None:
            return None
        if not await self._job_visible_to(job, requested_by):
            return None
        return job

    async def list_runs(self, job_id: str, *, requested_by: str | None = None) -> list[ExtractionRun]:
        job = await self.get_job(job_id, requested_by=requested_by)
        if job is None:
            raise ExtractionNotFoundError("Extraction job not found")
        return await self.run_repository.list_by_job(job_id)

    @Transactional()
    async def create_and_process_job(self, *, job_type: str, requested_by: str | None = None, **params: Any) -> ExtractionJob:
        await self._ensure_scope_access(params, requested_by)
        if job_type == "patient_ehr" and params.get("target_form_key"):
            job_type = "targeted_schema"
        job = await self.create_job(
            job_type=job_type,
            requested_by=requested_by,
            progress=0,
            **params,
        )
        await self._prepare_job(job=job, created_by=requested_by)
        input_json = job.input_json if isinstance(job.input_json, dict) else {}
        tracks_async = input_json.get("enqueue_async") is True or input_json.get("wait_for_document_ready") is True
        if tracks_async:
            batch_id = await self._attach_async_task_tracking_for_job(job=job, requested_by=requested_by)
            if isinstance(job.input_json, dict):
                job.input_json = {**job.input_json, "async_task_batch_id": batch_id}
            else:
                job.input_json = {"async_task_batch_id": batch_id}
        if await self._should_wait_for_document_ready(job):
            await self.job_repository.save(job)
            # 同上：避免路由层访问 updated_at 时触发懒加载导致 MissingGreenlet。
            if hasattr(job, "_sa_instance_state"):
                await session.refresh(job)
            return job
        if isinstance(job.input_json, dict) and job.input_json.get("enqueue_async") is True:
            await self.job_repository.save(job)
            await self._commit_pending_jobs_before_enqueue()
            if hasattr(job, "_sa_instance_state"):
                await session.refresh(job)
            await self._schedule_or_enqueue_extraction_task(job.id)
            # _enqueue_extraction_task 内部又会触发一次 UPDATE+commit（progress=5、mark_job_queued），
            # 之后 job.updated_at（server-side onupdate）被标记为 expired。
            # 必须再 refresh 一次，否则路由层 ExtractionJobResponse.model_validate(job)
            # 在 @Transactional 收尾后访问 updated_at 会触发懒加载，
            # 此时 greenlet 上下文已结束 → MissingGreenlet → 500。
            if hasattr(job, "_sa_instance_state"):
                await session.refresh(job)
            return job
        job = await self._process_job(job=job, input_snapshot_extra={}, raise_on_failure=True)
        # 同样的原因：_process_job 内部多次 commit=True 后 updated_at 被 expire，
        # 在事务收尾前刷新一下，保证返回给路由的 ORM 对象所有属性都已加载。
        if hasattr(job, "_sa_instance_state"):
            await session.refresh(job)
        return job

    async def create_planned_jobs(self, *, requested_by: str | None = None, **params: Any) -> list[ExtractionJob]:
        document_id = params.get("document_id")
        context_id = params.get("context_id")
        schema_version_id = params.get("schema_version_id")
        if document_id is None:
            raise ExtractionConflictError("Planned extraction requires document_id")
        if context_id is None:
            raise ExtractionConflictError("Planned extraction requires context_id")

        document = await self._ensure_document_access(document_id, requested_by)
        context = await self._ensure_context_access(context_id, requested_by)
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

    async def update_patient_ehr_folder(
        self,
        *,
        patient_id: str,
        requested_by: str | None = None,
        target_form_keys: list[str] | None = None,
        mode: str | None = None,
    ) -> dict[str, Any]:
        options = self._normalize_folder_update_options(target_form_keys=target_form_keys, mode=mode)
        await self._ensure_patient_access(patient_id, requested_by)
        batch = await self.task_progress_service.create_batch(
            task_type=self._folder_batch_task_type(
                folder_task_type="patient_ehr_folder_extract",
                options=options,
            ),
            title=self._folder_batch_title(base_title="更新电子病历夹", options=options),
            scope_type="patient",
            patient_id=patient_id,
            requested_by=requested_by,
        )
        ehr = await self.ehr_service.get_patient_ehr(
            patient_id,
            created_by=requested_by,
            owner_id=requested_by,
        )
        context = ehr.get("context")
        schema_json = ehr.get("schema")
        if context is None or not isinstance(schema_json, dict):
            published_schema = await self.ehr_service.schema_service.get_latest_published("ehr")
            if published_schema is None:
                raise ExtractionNotFoundError(
                    "未找到已发布的电子病历 Schema，请先在 Schema 模板管理中导入并发布 EHR 模板"
                )
            raise ExtractionNotFoundError("无法初始化患者电子病历上下文，请刷新页面后重试")

        documents = await self.document_repository.list_by_patient(
            patient_id,
            limit=1000,
            uploaded_by=requested_by,
        )
        eligible_documents = [document for document in documents if self._document_ready_for_extraction(document)]
        existing_jobs = await self.job_repository.list_by_patient_documents(
            patient_id=patient_id,
            document_ids=[document.id for document in eligible_documents],
        )
        existing_forms_by_document = self._existing_target_forms_by_document(
            existing_jobs,
            job_types={"patient_ehr", "targeted_schema"},
        )
        if options.target_form_keys or options.mode == "full":
            pending_documents = eligible_documents
            already_extracted_documents = 0
            already_extracted_ids: set[str] = set()
        else:
            extracted_document_ids = {
                job.document_id
                for job in existing_jobs
                if job.job_type in {"patient_ehr", "targeted_schema"} and job.status in {"pending", "queued", "running", "completed"}
            }
            pending_documents = [document for document in eligible_documents if document.id not in extracted_document_ids]
            already_extracted_documents = len(extracted_document_ids)
            already_extracted_ids = {str(document_id) for document_id in extracted_document_ids if document_id}

        jobs: list[ExtractionJob] = []
        skipped: list[dict[str, str]] = []
        for document in pending_documents:
            plan_items = self._pending_plan_items_for_document(
                document=document,
                schema_json=schema_json,
                existing_forms_by_document=existing_forms_by_document,
                options=options,
                source_tag="patient_ehr_folder_update",
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

        await self._persist_folder_batch_plan(
            batch_id=batch.id,
            options=options,
            schema_version_id=context.schema_version_id,
            schema_json=schema_json,
            source_tag="patient_ehr_folder_update",
            documents=documents,
            eligible_documents=eligible_documents,
            pending_documents=pending_documents,
            already_extracted_document_ids=already_extracted_ids,
            jobs=jobs,
            skipped=skipped,
        )

        if jobs:
            for job in jobs:
                await self.task_progress_service.create_item_for_job(
                    batch_id=batch.id,
                    task_type=self._task_type_for_job(job),
                    job=job,
                )
            await self._commit_pending_jobs_before_enqueue()
            for job in jobs:
                await self._schedule_or_enqueue_extraction_task(job.id)
        else:
            await self.task_progress_service.aggregate_batch(batch.id)
            await session.commit()

        return {
            "batch_id": batch.id,
            "patient_id": patient_id,
            "documents_total": len(documents),
            "eligible_documents": len(eligible_documents),
            "already_extracted_documents": already_extracted_documents,
            "planned_documents": len(pending_documents),
            "created_jobs": len(jobs),
            "jobs": jobs,
            "submitted_jobs": len(jobs),
            "completed_jobs": 0,
            "failed_jobs": 0,
            "skipped": skipped,
            "target_form_keys": options.target_form_keys or [],
            "mode": options.mode,
        }

    async def update_project_crf_folder(
        self,
        *,
        project_id: str,
        project_patient_id: str,
        requested_by: str | None = None,
        target_form_keys: list[str] | None = None,
        mode: str | None = None,
    ) -> dict[str, Any]:
        options = self._normalize_folder_update_options(target_form_keys=target_form_keys, mode=mode)
        from app.services.research_project_service import ResearchProjectConflictError, ResearchProjectNotFoundError, ResearchProjectService

        try:
            crf = await ResearchProjectService().get_project_crf(
                project_id=project_id,
                project_patient_id=project_patient_id,
                created_by=requested_by,
                owner_id=requested_by,
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
        batch = await self.task_progress_service.create_batch(
            task_type=self._folder_batch_task_type(
                folder_task_type="project_crf_folder_extract",
                options=options,
            ),
            title=self._folder_batch_title(base_title="更新项目 CRF", options=options),
            scope_type="project_patient",
            project_id=project_id,
            project_patient_id=project_patient_id,
            patient_id=patient_id,
            requested_by=requested_by,
        )
        documents = await self.document_repository.list_by_patient(
            patient_id,
            limit=1000,
            uploaded_by=requested_by,
        )
        eligible_documents = [document for document in documents if self._document_ready_for_extraction(document)]
        existing_jobs = await self.job_repository.list_by_patient_documents(
            patient_id=patient_id,
            document_ids=[document.id for document in eligible_documents],
        )
        existing_forms_by_document = self._existing_target_forms_by_document(
            existing_jobs,
            job_types={"project_crf"},
            project_id=project_id,
            project_patient_id=project_patient_id,
        )
        if options.target_form_keys or options.mode == "full":
            pending_documents = eligible_documents
            extracted_document_ids: set[str] = set()
            already_extracted_ids: set[str] = set()
        else:
            extracted_document_ids = {
                str(job.document_id)
                for job in existing_jobs
                if job.job_type == "project_crf"
                and job.project_id == project_id
                and job.project_patient_id == project_patient_id
                and job.status in {"pending", "queued", "running", "completed"}
                and job.document_id is not None
            }
            pending_documents = [document for document in eligible_documents if str(document.id) not in extracted_document_ids]
            already_extracted_ids = set(extracted_document_ids)

        jobs: list[ExtractionJob] = []
        skipped: list[dict[str, str]] = []
        for document in pending_documents:
            plan_items = self._pending_plan_items_for_document(
                document=document,
                schema_json=schema_json,
                existing_forms_by_document=existing_forms_by_document,
                options=options,
                source_tag="project_crf_folder_update",
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
                            "source": "project_crf_targeted_extract" if options.target_form_keys else "project_crf_folder_update",
                            "form_keys": [item.target_form_key],
                            "planned_reason": item.reason,
                            "match_role": item.match_role,
                            "enqueue_async": True,
                        },
                    )
                )

        await self._persist_folder_batch_plan(
            batch_id=batch.id,
            options=options,
            schema_version_id=context.schema_version_id,
            schema_json=schema_json,
            source_tag="project_crf_folder_update",
            documents=documents,
            eligible_documents=eligible_documents,
            pending_documents=pending_documents,
            already_extracted_document_ids=already_extracted_ids,
            jobs=jobs,
            skipped=skipped,
            extra_stats={
                "project_id": project_id,
                "project_patient_id": project_patient_id,
            },
        )

        if jobs:
            if batch.patient_id is None:
                batch.patient_id = patient_id
                await self.task_progress_service.batch_repository.save(batch)
            for job in jobs:
                await self.task_progress_service.create_item_for_job(
                    batch_id=batch.id,
                    task_type=self._task_type_for_job(job),
                    job=job,
                )
            await self._commit_pending_jobs_before_enqueue()
            for job in jobs:
                await self._schedule_or_enqueue_extraction_task(job.id)
        else:
            if batch.patient_id is None:
                batch.patient_id = patient_id
                await self.task_progress_service.batch_repository.save(batch)
            await self.task_progress_service.aggregate_batch(batch.id)
            await session.commit()

        return {
            "batch_id": batch.id,
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

    async def update_project_crf_folder_batch(
        self,
        *,
        project_id: str,
        project_patient_ids: list[str] | None = None,
        requested_by: str | None = None,
        target_form_keys: list[str] | None = None,
        mode: str | None = None,
    ) -> dict[str, Any]:
        from app.services.research_project_service import (
            ResearchProjectConflictError,
            ResearchProjectNotFoundError,
            ResearchProjectService,
        )

        research_service = ResearchProjectService()
        project = await research_service.get_project(project_id, owner_id=requested_by)
        if project is None:
            raise ExtractionNotFoundError("Research project not found")

        if project_patient_ids:
            target_ids = [pid for pid in project_patient_ids if pid]
        else:
            try:
                project_patients = await research_service.list_project_patients(
                    project_id, owner_id=requested_by
                )
            except ResearchProjectNotFoundError as error:
                raise ExtractionNotFoundError(str(error)) from error
            except ResearchProjectConflictError as error:
                raise ExtractionConflictError(str(error)) from error
            target_ids = [pp.id for pp in project_patients]

        options = self._normalize_folder_update_options(target_form_keys=target_form_keys, mode=mode)
        batch = await self.task_progress_service.create_batch(
            task_type=self._folder_batch_task_type(
                folder_task_type="project_crf_folder_extract",
                options=options,
            ),
            title=self._folder_batch_title(base_title="批量更新项目 CRF", options=options),
            scope_type="project",
            project_id=project_id,
            requested_by=requested_by,
        )

        all_jobs: list[ExtractionJob] = []
        processed_patients = 0
        skipped_patients: list[dict[str, str]] = []
        skipped_documents: list[dict[str, str]] = []
        agg_documents_total = 0
        agg_eligible_documents = 0
        agg_already_extracted_documents = 0
        agg_planned_documents = 0
        combined_plan_documents: list[dict[str, Any]] = []
        combined_plan_skipped: list[dict[str, str]] = []

        for project_patient_id in target_ids:
            try:
                crf = await research_service.get_project_crf(
                    project_id=project_id,
                    project_patient_id=project_patient_id,
                    created_by=requested_by,
                    owner_id=requested_by,
                )
            except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
                skipped_patients.append(
                    {"project_patient_id": project_patient_id, "reason": str(error)}
                )
                continue

            context = crf.get("context")
            schema_json = crf.get("schema")
            if context is None or not isinstance(schema_json, dict):
                skipped_patients.append(
                    {
                        "project_patient_id": project_patient_id,
                        "reason": "Project CRF schema context not found",
                    }
                )
                continue

            patient_id = context.patient_id
            documents = await self.document_repository.list_by_patient(
                patient_id,
                limit=1000,
                uploaded_by=requested_by,
            )
            eligible_documents = [d for d in documents if self._document_ready_for_extraction(d)]
            existing_jobs = await self.job_repository.list_by_patient_documents(
                patient_id=patient_id,
                document_ids=[d.id for d in eligible_documents],
            )
            existing_forms_by_document = self._existing_target_forms_by_document(
                existing_jobs,
                job_types={"project_crf"},
                project_id=project_id,
                project_patient_id=project_patient_id,
            )
            if options.target_form_keys or options.mode == "full":
                pending_documents = eligible_documents
                extracted_document_ids: set[str] = set()
                patient_already_extracted_ids: set[str] = set()
            else:
                extracted_document_ids = {
                    str(job.document_id)
                    for job in existing_jobs
                    if job.job_type == "project_crf"
                    and job.project_id == project_id
                    and job.project_patient_id == project_patient_id
                    and job.status in {"pending", "queued", "running", "completed"}
                    and job.document_id is not None
                }
                pending_documents = [d for d in eligible_documents if str(d.id) not in extracted_document_ids]
                patient_already_extracted_ids = set(extracted_document_ids)

            agg_documents_total += len(documents)
            agg_eligible_documents += len(eligible_documents)
            agg_already_extracted_documents += len(extracted_document_ids)
            agg_planned_documents += len(pending_documents)

            patient_jobs: list[ExtractionJob] = []
            patient_skipped: list[dict[str, str]] = []
            for document in pending_documents:
                plan_items = self._pending_plan_items_for_document(
                    document=document,
                    schema_json=schema_json,
                    existing_forms_by_document=existing_forms_by_document,
                    options=options,
                    source_tag="project_crf_folder_update",
                )
                if not plan_items:
                    skip_entry = {
                        "project_patient_id": project_patient_id,
                        "document_id": document.id,
                        "reason": "no primary source matched",
                    }
                    skipped_documents.append(skip_entry)
                    patient_skipped.append({"document_id": document.id, "reason": skip_entry["reason"]})
                    continue
                for item in plan_items:
                    patient_jobs.append(
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
                                "source": "project_crf_targeted_extract" if options.target_form_keys else "project_crf_folder_update",
                                "form_keys": [item.target_form_key],
                                "planned_reason": item.reason,
                                "match_role": item.match_role,
                                "enqueue_async": True,
                            },
                        )
                    )
            all_jobs.extend(patient_jobs)
            patient_plan = build_folder_plan_json(
                options={"mode": options.mode, "target_form_keys": options.target_form_keys or []},
                schema_version_id=context.schema_version_id,
                source_tag="project_crf_folder_update",
                documents_total=len(documents),
                eligible_documents=eligible_documents,
                pending_documents=pending_documents,
                already_extracted_document_ids=patient_already_extracted_ids,
                jobs=patient_jobs,
                skipped=patient_skipped,
                schema_json=schema_json,
                planner=self.extraction_planner,
                extra_stats={
                    "project_id": project_id,
                    "project_patient_id": project_patient_id,
                },
            )
            for doc_entry in patient_plan.get("documents") or []:
                doc_entry["project_patient_id"] = project_patient_id
                combined_plan_documents.append(doc_entry)
            combined_plan_skipped.extend(patient_skipped)
            processed_patients += 1

        await self.task_progress_service.persist_plan_snapshot(
            batch.id,
            {
                "options": {"mode": options.mode, "target_form_keys": options.target_form_keys or []},
                "schema_version_id": None,
                "source_tag": "project_crf_folder_update",
                "stats": {
                    "documents_total": agg_documents_total,
                    "eligible_documents": agg_eligible_documents,
                    "planned_jobs": len(all_jobs),
                    "processed_patients": processed_patients,
                    "skipped_patients": len(skipped_patients),
                    "skipped_documents": len(skipped_documents),
                    "already_extracted_documents": agg_already_extracted_documents,
                    "pending_documents": agg_planned_documents,
                },
                "documents": combined_plan_documents,
                "skipped": combined_plan_skipped,
                "skipped_patients": skipped_patients,
                "skipped_documents": skipped_documents,
            },
        )

        if all_jobs:
            for job in all_jobs:
                await self.task_progress_service.create_item_for_job(
                    batch_id=batch.id,
                    task_type=self._task_type_for_job(job),
                    job=job,
                )
            await self._commit_pending_jobs_before_enqueue()
            for job in all_jobs:
                await self._schedule_or_enqueue_extraction_task(job.id)
        else:
            await self.task_progress_service.aggregate_batch(batch.id)
            await session.commit()

        return {
            "batch_id": batch.id,
            "project_id": project_id,
            "total_project_patients": len(target_ids),
            "processed_patients": processed_patients,
            "documents_total": agg_documents_total,
            "eligible_documents": agg_eligible_documents,
            "already_extracted_documents": agg_already_extracted_documents,
            "planned_documents": agg_planned_documents,
            "created_jobs": len(all_jobs),
            "jobs": all_jobs,
            "submitted_jobs": len(all_jobs),
            "completed_jobs": 0,
            "failed_jobs": 0,
            "skipped_patients": skipped_patients,
            "skipped_documents": skipped_documents,
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

    def _scheduler_user_key(self, job: ExtractionJob) -> str:
        return str(getattr(job, "requested_by", None) or "__system__")

    def _scheduler_project_key(self, job: ExtractionJob) -> str | None:
        project_id = getattr(job, "project_id", None)
        return str(project_id) if project_id else None

    def _choose_jobs_for_fair_dispatch(
        self,
        *,
        candidates: list[ExtractionJob],
        active_jobs: list[ExtractionJob],
        global_limit: int,
        user_limit: int,
        project_limit: int,
        max_to_dispatch: int,
    ) -> list[ExtractionJob]:
        if global_limit <= 0 or max_to_dispatch <= 0:
            return []
        active_total = len(active_jobs)
        global_slots = max(0, min(max_to_dispatch, global_limit - active_total))
        if global_slots <= 0:
            return []

        user_counts = Counter(self._scheduler_user_key(job) for job in active_jobs)
        project_counts = Counter(
            project_key
            for job in active_jobs
            if (project_key := self._scheduler_project_key(job)) is not None
        )
        grouped: dict[str, list[ExtractionJob]] = defaultdict(list)
        for job in candidates:
            grouped[self._scheduler_user_key(job)].append(job)

        selected: list[ExtractionJob] = []
        user_order = sorted(
            grouped,
            key=lambda user_key: (
                user_counts[user_key],
                getattr(grouped[user_key][0], "created_at", None) or datetime.min,
                user_key,
            ),
        )
        while global_slots > 0 and user_order:
            made_progress = False
            for user_key in list(user_order):
                if global_slots <= 0:
                    break
                if user_limit > 0 and user_counts[user_key] >= user_limit:
                    continue
                queue = grouped.get(user_key) or []
                chosen_index: int | None = None
                for index, job in enumerate(queue):
                    project_key = self._scheduler_project_key(job)
                    if project_key is not None and project_limit > 0 and project_counts[project_key] >= project_limit:
                        continue
                    chosen_index = index
                    break
                if chosen_index is None:
                    continue
                job = queue.pop(chosen_index)
                selected.append(job)
                user_counts[user_key] += 1
                project_key = self._scheduler_project_key(job)
                if project_key is not None:
                    project_counts[project_key] += 1
                global_slots -= 1
                made_progress = True
                if not queue:
                    user_order.remove(user_key)
            if not made_progress:
                break
        return selected

    async def _schedule_or_enqueue_extraction_task(
        self,
        job_id: str,
        *,
        reset_progress: bool = False,
        waiting_message: str | None = None,
        queued_message: str | None = None,
    ) -> None:
        if not config.EXTRACTION_SCHEDULER_ENABLED:
            await self._enqueue_extraction_task(
                job_id,
                reset_progress=reset_progress,
                queued_message=queued_message,
            )
            return
        job = await self.get_job(job_id)
        if job is None:
            raise ExtractionNotFoundError("Extraction job not found")
        job.status = "pending"
        if reset_progress:
            job.progress = 0
        await self.job_repository.save(job)
        await self.task_progress_service.mark_job_waiting_for_scheduler(
            job,
            message=waiting_message,
            reset_progress=reset_progress,
            commit=True,
        )

    @Transactional()
    async def schedule_pending_extraction_jobs(
        self,
        *,
        global_limit: int | None = None,
        user_limit: int | None = None,
        project_limit: int | None = None,
        batch_size: int | None = None,
    ) -> dict[str, Any]:
        if not config.EXTRACTION_SCHEDULER_ENABLED:
            return {
                "skipped": True,
                "reason": "EXTRACTION_SCHEDULER_ENABLED is false",
                "dispatched_jobs": 0,
                "job_ids": [],
            }
        effective_global_limit = global_limit if global_limit is not None else config.EXTRACTION_GLOBAL_CONCURRENCY
        effective_user_limit = user_limit if user_limit is not None else config.EXTRACTION_USER_CONCURRENCY
        effective_project_limit = project_limit if project_limit is not None else config.EXTRACTION_PROJECT_CONCURRENCY
        effective_batch_size = max(1, batch_size if batch_size is not None else config.EXTRACTION_SCHEDULER_BATCH_SIZE)
        active_jobs = await self.job_repository.list_active_for_scheduler()
        candidate_limit = max(effective_batch_size * 5, effective_batch_size)
        candidates = [
            job
            for job in await self.job_repository.list_pending_for_scheduler(limit=candidate_limit)
            if not (isinstance(job.input_json, dict) and job.input_json.get("wait_for_document_ready") is True)
        ]
        selected = self._choose_jobs_for_fair_dispatch(
            candidates=candidates,
            active_jobs=active_jobs,
            global_limit=effective_global_limit,
            user_limit=effective_user_limit,
            project_limit=effective_project_limit,
            max_to_dispatch=effective_batch_size,
        )
        dispatched: list[str] = []
        for job in selected:
            await self._enqueue_extraction_task(
                job.id,
                queued_message="任务已由公平调度器进入后台队列",
                commit_progress=False,
            )
            dispatched.append(job.id)
        return {
            "skipped": False,
            "global_limit": effective_global_limit,
            "user_limit": effective_user_limit,
            "project_limit": effective_project_limit,
            "active_jobs": len(active_jobs),
            "candidate_jobs": len(candidates),
            "dispatched_jobs": len(dispatched),
            "job_ids": dispatched,
        }

    async def _enqueue_extraction_task(
        self,
        job_id: str,
        *,
        reset_progress: bool = False,
        queued_message: str | None = None,
        commit_progress: bool = True,
    ) -> None:
        from app.workers.celery_app import EXTRACTION_QUEUE, EXTRACTION_TASK_NAME, celery_app

        job = await self.get_job(job_id)
        queue = extraction_queue_for_job(job) if job is not None else EXTRACTION_QUEUE
        try:
            result = celery_app.send_task(
                EXTRACTION_TASK_NAME,
                args=[job_id],
                queue=queue,
                routing_key=queue,
            )
        except Exception as error:
            error_message = f"Extraction task could not be queued: {error}"
            if job is not None:
                job.status = "failed"
                job.error_type = "enqueue_failed"
                job.error_message = error_message
                job.finished_at = datetime.utcnow()
                await self.job_repository.save(job)
                await self.task_progress_service.mark_job_failed(job, error_message=error_message)
            await session.commit()
            raise ExtractionConflictError(error_message) from error
        if job is not None:
            job.status = "queued"
            job.progress = max(int(job.progress or 0), 5)
            if job.error_type == "enqueue_failed":
                job.error_type = None
                job.error_message = None
            await self.job_repository.save(job)
        await self.task_progress_service.mark_job_queued(
            job_id,
            celery_task_id=getattr(result, "id", None),
            message=queued_message,
            reset_progress=reset_progress,
            commit=commit_progress,
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
    async def retry_job(self, job_id: str, *, requested_by: str | None = None) -> ExtractionJob:
        job = await self.get_job(job_id, requested_by=requested_by)
        if job is None:
            raise ExtractionNotFoundError("Extraction job not found")
        self._ensure_can_retry(job)
        job.status = "pending"
        job.progress = 0
        job.error_message = None
        job.error_type = None
        job.timeout_at = None
        job.started_at = None
        job.finished_at = None
        if isinstance(job.input_json, dict):
            input_json = dict(job.input_json)
            input_json.pop("worker_retry_count", None)
            input_json.pop("last_retry_scheduled_at", None)
            job.input_json = input_json
        await self.job_repository.save(job)
        await self._commit_pending_jobs_before_enqueue()
        await self._schedule_or_enqueue_extraction_task(
            job.id,
            reset_progress=True,
            waiting_message="任务已重新提交，正在等待公平调度",
            queued_message="任务已重新提交到后台队列",
        )
        try:
            await session.refresh(job)
        except Exception:
            pass
        return job

    @Transactional()
    async def cancel_job(self, job_id: str, *, requested_by: str | None = None) -> ExtractionJob:
        job = await self.get_job(job_id, requested_by=requested_by)
        if job is None:
            raise ExtractionNotFoundError("Extraction job not found")
        if job.status == "completed":
            raise ExtractionConflictError("Completed extraction job cannot be cancelled")
        job.status = "cancelled"
        job.error_type = "cancelled"
        job.error_message = "任务已取消"
        job.finished_at = datetime.utcnow()
        await self.job_repository.save(job)
        await self.task_progress_service.mark_job_cancelled(job, message=job.error_message)
        return job

    @Transactional()
    async def handle_worker_transient_failure(
        self,
        job_id: str,
        *,
        error: Exception,
        max_retries: int,
    ) -> ExtractionJob | None:
        job = await self.get_job(job_id)
        if job is None or job.status in {"cancelled", "completed"}:
            return job
        input_json = dict(job.input_json or {}) if isinstance(job.input_json, dict) else {}
        retry_count = int(input_json.get("worker_retry_count") or 0)
        if retry_count >= max(0, max_retries):
            await self.mark_worker_retry_exhausted(job_id, error=error)
            return await self.get_job(job_id)
        return await self.mark_worker_retry_scheduled(
            job_id,
            error=error,
            retry_number=retry_count + 1,
        )

    @Transactional()
    async def mark_worker_retry_scheduled(self, job_id: str, *, error: Exception, retry_number: int) -> ExtractionJob | None:
        job = await self.get_job(job_id)
        if job is None or job.status in {"cancelled", "completed"}:
            return job
        input_json = dict(job.input_json or {}) if isinstance(job.input_json, dict) else {}
        input_json["worker_retry_count"] = max(int(input_json.get("worker_retry_count") or 0), retry_number)
        input_json["last_retry_scheduled_at"] = datetime.utcnow().isoformat()
        job.status = "pending"
        job.error_type = "retry_scheduled"
        job.error_message = f"临时错误，已安排第 {retry_number} 次重试：{str(error) or error.__class__.__name__}"
        job.input_json = input_json
        job.started_at = None
        job.finished_at = None
        await self.job_repository.save(job)
        runs = await self.run_repository.list_by_job(job.id)
        if runs:
            run = runs[-1]
            run.status = "failed"
            run.finished_at = datetime.utcnow()
            run.error_type = "retry_scheduled"
            run.error_message = job.error_message
            await self.run_repository.save(run)
        await self.task_progress_service.mark_job_waiting_for_scheduler(
            job,
            message=job.error_message,
            reset_progress=True,
        )
        await session.commit()
        return job

    @Transactional()
    async def mark_worker_retry_exhausted(self, job_id: str, *, error: Exception) -> ExtractionJob | None:
        job = await self.get_job(job_id)
        if job is None or job.status in {"cancelled", "completed"}:
            return job
        runs = await self.run_repository.list_by_job(job.id)
        run = runs[-1] if runs else await self.start_run(
            job_id=job.id,
            run_no=1,
            model_name=self._model_name_for_job(job),
            prompt_version="worker-retry-exhausted",
        )
        await self._mark_failed(job=job, run=run, error=error)
        return job

    STALE_PENDING_DEFAULT_HOURS = 24
    STALE_PENDING_ERROR_MESSAGE = (
        "Stale pending extraction job: no worker progress within the expected window. "
        "Use retry to run again."
    )

    @Transactional()
    async def abandon_stale_pending_jobs(
        self,
        *,
        older_than_hours: int = STALE_PENDING_DEFAULT_HOURS,
        limit: int = 500,
        dry_run: bool = False,
    ) -> dict[str, Any]:
        """Mark long-idle pending jobs as failed so they can be retried via ``retry_job``."""
        if older_than_hours < 0:
            raise ExtractionServiceError("older_than_hours must be non-negative")
        cutoff = datetime.utcnow() - timedelta(hours=older_than_hours)
        stale_statuses = ("queued",) if config.EXTRACTION_SCHEDULER_ENABLED else ("pending", "queued")
        jobs = await self.job_repository.list_stale_pending(
            older_than=cutoff,
            limit=limit,
            statuses=stale_statuses,
        )
        if dry_run:
            return {
                "dry_run": True,
                "older_than_hours": older_than_hours,
                "cutoff": cutoff.isoformat(),
                "count": len(jobs),
                "job_ids": [job.id for job in jobs],
            }

        abandoned: list[str] = []
        finished_at = datetime.utcnow()
        for job in jobs:
            job.status = "failed"
            job.error_type = "stale"
            job.error_message = self.STALE_PENDING_ERROR_MESSAGE
            job.finished_at = finished_at
            await self.job_repository.save(job)
            await self.task_progress_service.mark_job_failed(job, error_message=job.error_message)
            abandoned.append(job.id)

        return {
            "dry_run": False,
            "older_than_hours": older_than_hours,
            "cutoff": cutoff.isoformat(),
            "count": len(abandoned),
            "job_ids": abandoned,
        }

    @Transactional()
    async def delete_job(self, job_id: str, *, requested_by: str | None = None) -> None:
        job = await self.get_job(job_id, requested_by=requested_by)
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

        if job.job_type in {"patient_ehr", "targeted_schema"} and job.patient_id is not None:
            ehr = await self.ehr_service.get_patient_ehr(
                job.patient_id,
                created_by=created_by,
                owner_id=created_by,
            )
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
                    owner_id=created_by,
                )
            except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
                raise ExtractionConflictError(str(error)) from error
            context = crf.get("context")
            if context is not None:
                job.context_id = context.id
                job.schema_version_id = context.schema_version_id
                if job.patient_id is None:
                    job.patient_id = context.patient_id

    async def _build_run_input_snapshot(
        self,
        *,
        job: ExtractionJob,
        run_no: int,
        extra: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        input_json = job.input_json if isinstance(job.input_json, dict) else {}
        extractor = self._model_name_for_job(job)
        target_form_key = getattr(job, "target_form_key", None)
        snapshot: dict[str, Any] = {
            "schema_version_id": getattr(job, "schema_version_id", None),
            "extractor": extractor,
            "target_form_key": target_form_key,
            "plan": {
                "planned_reason": input_json.get("planned_reason"),
                "match_role": input_json.get("match_role"),
                "form_keys": self._as_list(input_json.get("form_keys")),
                "source": input_json.get("source"),
            },
            "field_filter": {
                "target_form_keys": list(
                    {
                        *(self._as_list(input_json.get("form_keys"))),
                        *([target_form_key] if target_form_key else []),
                    }
                ),
                "target_field_paths": self._as_list(input_json.get("field_paths")),
                "target_field_keys": self._as_list(input_json.get("field_keys")),
                "target_group_keys": self._as_list(input_json.get("group_keys")),
            },
            "worker_meta": {"run_no": run_no, **(extra or {})},
        }
        if not self._uses_schema_extractor(job):
            return snapshot

        try:
            document, _context = await self._resolve_schema_extraction_scope(job)
        except (ExtractionNotFoundError, ExtractionConflictError):
            return snapshot

        schema_version = await self.ehr_service.schema_service.get_version(job.schema_version_id)
        if schema_version is None:
            return snapshot

        all_fields = plan_schema_fields(schema_version.schema_json)
        filtered_fields = self._filter_schema_fields(all_fields, job)
        field_specs = [self._schema_field_spec(field) for field in filtered_fields]
        text = extract_document_text(document)
        reading_units = build_ocr_reading_units(document)
        reading_corpus = flatten_reading_unit_corpus(reading_units)
        if reading_corpus:
            text = reading_corpus
        text_source = "ocr_reading_units" if reading_units else ("ocr_text" if getattr(document, "ocr_text", None) else "parsed_content")
        snapshot["document"] = {
            "id": document.id,
            "doc_type": getattr(document, "doc_type", None) or getattr(document, "document_type", None),
            "doc_subtype": getattr(document, "doc_subtype", None) or getattr(document, "document_sub_type", None),
            "doc_title": getattr(document, "doc_title", None),
            "metadata_json": getattr(document, "metadata_json", None)
            if isinstance(getattr(document, "metadata_json", None), dict)
            else None,
            "doc_terms": document_trace_terms(document),
            "text_length": len(text or ""),
            "text_source": text_source,
            "reading_unit_count": len(reading_units),
            "ocr_status": getattr(document, "ocr_status", None),
        }
        snapshot["field_filter"]["matched_count"] = len(filtered_fields)
        snapshot["field_filter"]["total_schema_fields"] = len(all_fields)
        snapshot["field_specs"] = field_specs
        if extractor == "ClaudeCodeEhrExtractor":
            snapshot["claude_code"] = {
                "bin": config.CLAUDE_CODE_BIN,
                "workspace_root": config.CLAUDE_CODE_WORKSPACE_ROOT,
                "timeout_seconds": config.CLAUDE_CODE_TIMEOUT_SECONDS,
                "max_turns": config.CLAUDE_CODE_MAX_TURNS,
                "allowed_tools": config.CLAUDE_CODE_ALLOWED_TOOLS,
                "disallowed_tools": config.CLAUDE_CODE_DISALLOWED_TOOLS,
                "enable_mcp_tools": config.CLAUDE_CODE_ENABLE_MCP_TOOLS,
                "mcp_server_name": config.CLAUDE_CODE_MCP_SERVER_NAME,
            }
        if (
            (text or reading_units)
            and hasattr(self.llm_ehr_extractor, "_build_user_prompt")
            and hasattr(self.llm_ehr_extractor, "_build_system_prompt")
            and hasattr(self.llm_ehr_extractor, "_document_meta")
        ):
            user_preview = self.llm_ehr_extractor._build_user_prompt(
                state={
                    "text": text,
                    "field_specs": field_specs,
                    "fields": filtered_fields,
                    "reading_units": reading_units,
                    "ocr_evidence_units": reading_units,
                    "document_id": document.id,
                    "document_meta": self.llm_ehr_extractor._document_meta(document),
                }
            )
            snapshot["prompt_preview"] = {
                "system_chars": len(self.llm_ehr_extractor._build_system_prompt(field_specs) or ""),
                "user_chars": len(user_preview or ""),
            }
        return snapshot

    def _schema_field_spec(self, field: Any) -> dict[str, Any]:
        return {
            "field_key": getattr(field, "field_key", None),
            "field_path": getattr(field, "field_path", None),
            "field_title": getattr(field, "field_title", None),
            "value_type": getattr(field, "value_type", None),
            "options": getattr(field, "options", None),
            "record_form_key": getattr(field, "record_form_key", None),
            "record_form_title": getattr(field, "record_form_title", None),
            "group_key": getattr(field, "group_key", None),
            "group_title": getattr(field, "group_title", None),
            "display_type": getattr(field, "display_type", None),
            "schema_type": getattr(field, "schema_type", None),
            "schema_format": getattr(field, "schema_format", None),
            "merge_binding": getattr(field, "merge_binding", None),
        }

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
        if model_name == "ClaudeCodeEhrExtractor":
            prompt_version = "claude-code-cli-ehr-v1"

        job.status = "running"
        job.progress = 10
        job.error_message = None
        job.error_type = None
        job.timeout_at = None
        job.started_at = datetime.utcnow()
        job.finished_at = None
        await self.job_repository.save(job)
        await self.task_progress_service.update_job_progress(
            job,
            status="running",
            progress=10,
            stage="worker_started",
            stage_label="Worker 已启动",
            message="后台任务已开始执行",
            current_step=1,
            payload_json={"run_no": next_run_no, "model_name": model_name},
            commit=True,
        )

        run = await self.start_run(
            job_id=job.id,
            run_no=next_run_no,
            model_name=model_name,
            prompt_version=prompt_version,
        )
        # Per-job buffer collected by LLMCallRecorder. Flushed on success and
        # on failure so partial logs (e.g. one timeout) still land in
        # llm_call_logs and surface in the admin UI.
        llm_call_buffer: list[dict[str, Any]] = []
        llm_call_context: dict[str, Any] = {
            "job_id": job.id,
            "run_id": run.id,
            "document_id": job.document_id,
            "project_id": getattr(job, "project_id", None),
            "requested_by": getattr(job, "requested_by", None),
            "prompt_version": prompt_version,
        }
        job.progress = 20
        await self.job_repository.save(job)
        await self.task_progress_service.update_job_progress(
            job,
            progress=20,
            stage="load_context",
            stage_label="读取上下文",
            message="正在读取患者、项目和模板上下文",
            extraction_run_id=run.id,
            current_step=2,
            payload_json={
                "run_id": run.id,
                "context_id": job.context_id,
                "schema_version_id": job.schema_version_id,
            },
            commit=True,
        )
        try:
            job.progress = 30
            await self.job_repository.save(job)
            document_for_progress = (
                await self.document_repository.get_visible_by_id(
                    job.document_id,
                    uploaded_by=getattr(job, "requested_by", None),
                )
                if job.document_id
                else None
            )
            await self.task_progress_service.update_job_progress(
                job,
                progress=30,
                stage="load_document",
                stage_label="读取文档内容",
                message="正在读取文档和抽取输入",
                current_step=3,
                payload_json={
                    "document_id": job.document_id,
                    "ocr_status": getattr(document_for_progress, "ocr_status", None) if document_for_progress else None,
                },
                commit=True,
            )
            await self._raise_if_cancelled(job.id)
            snapshot = await self._build_run_input_snapshot(
                job=job,
                run_no=next_run_no,
                extra=input_snapshot_extra,
            )
            if input_snapshot_extra:
                snapshot.update(input_snapshot_extra)
            run.input_snapshot_json = snapshot
            await self.run_repository.save(run)
            field_count = len((run.input_snapshot_json or {}).get("field_specs") or [])
            job.progress = 45
            await self.job_repository.save(job)
            await self.task_progress_service.update_job_progress(
                job,
                progress=45,
                stage="call_extractor",
                stage_label="AI 抽取中",
                message="正在执行结构化抽取",
                current_step=4,
                payload_json={
                    "run_id": run.id,
                    "model_name": model_name,
                    "extractor": model_name,
                    "field_count": field_count,
                },
                commit=True,
            )
            await self._raise_if_cancelled(job.id)
            output = await self._extract(
                job=job,
                llm_call_buffer=llm_call_buffer,
                llm_call_context=llm_call_context,
            )
            await self._raise_if_cancelled(job.id)
            job.progress = 65
            await self.job_repository.save(job)
            await self.task_progress_service.update_job_progress(
                job,
                progress=65,
                stage="validate_output",
                stage_label="校验抽取结果",
                message="正在校验和规范化抽取结果",
                current_step=5,
                payload_json={
                    "validation_status": output.get("validation_status") if isinstance(output, dict) else None,
                    "attempt_count": output.get("attempt_count") if isinstance(output, dict) else None,
                },
                commit=True,
            )
            await self._raise_if_cancelled(job.id)
            # `llm_call_logs.raw_response` is the source of truth for LLM I/O.
            # `parsed_output_json` is reduced to {fields, attempt_count}; validation_log
            # moves to its own column so the admin UI doesn't need to crack JSON.
            parsed = self._build_parsed_output(output) if isinstance(output, dict) else {}
            run.parsed_output_json = parsed
            if model_name == "ClaudeCodeEhrExtractor":
                run.raw_output_json = output.get("raw_output") if isinstance(output, dict) else None
            run.validation_log = output.get("validation_log") if isinstance(output, dict) else None
            run.validation_status = (
                output.get("validation_status") if isinstance(output, dict) else None
            ) or "valid"
            job.progress = 90
            await self.job_repository.save(job)
            await self.task_progress_service.update_job_progress(
                job,
                progress=90,
                stage="persist_values",
                stage_label="写入候选值",
                message="正在写入抽取结果和证据",
                current_step=6,
                payload_json={
                    "field_candidate_count": len(parsed.get("fields") or []) if isinstance(parsed, dict) else 0,
                },
                commit=True,
            )
            await self._raise_if_cancelled(job.id)
            await self._write_extracted_values(job=job, run=run, parsed_output=output)
            await self.task_progress_service.update_job_progress(
                job,
                payload_json={"persisted": True},
                commit=False,
            )

            finished_at = datetime.utcnow()
            run.status = "completed"
            run.finished_at = finished_at
            empty_result_message = self._empty_result_message(
                parsed=parsed,
                validation_status=run.validation_status,
                target_form_key=getattr(job, "target_form_key", None),
            )
            if empty_result_message:
                # The job did not fail technically, but the LLM returned zero usable
                # fields. Record the reason on both the run and the job so the user
                # sees "completed but no data" instead of a silently empty form.
                run.error_type = "empty_result"
                run.error_message = empty_result_message
            await self.run_repository.save(run)

            job.status = "completed"
            job.progress = 100
            job.finished_at = finished_at
            if empty_result_message:
                job.error_type = "empty_result"
                job.error_message = empty_result_message
            else:
                # Clear any prior empty-result marker on retries that did produce data.
                if job.error_type == "empty_result":
                    job.error_type = None
                    job.error_message = None
            await self.job_repository.save(job)
            await flush_llm_call_logs(llm_call_buffer)
            await self.task_progress_service.mark_job_succeeded(
                job,
                warning_message=empty_result_message,
            )
            return job
        except Exception as error:
            await session.rollback()
            # Re-flush LLM call logs in a fresh transaction; rollback above wiped them.
            await flush_llm_call_logs(llm_call_buffer, commit=True)
            if isinstance(error, ExtractionCancelledError):
                await self._mark_cancelled(job=job, run=run, message=str(error))
                return job
            if not raise_on_failure and self._is_transient_error(error):
                await release_db_connection()
                raise
            await self._mark_failed(job=job, run=run, error=error)
            if raise_on_failure:
                raise
            return job

    async def _raise_if_cancelled(self, job_id: str) -> None:
        latest_job = await self.get_job(job_id)
        if latest_job is not None:
            try:
                await session.refresh(latest_job)
            except Exception:
                pass
        if latest_job is not None and latest_job.status == "cancelled":
            raise ExtractionCancelledError("任务已取消")

    async def _mark_cancelled(self, *, job: ExtractionJob, run: ExtractionRun, message: str) -> None:
        finished_at = datetime.utcnow()
        run.status = "cancelled"
        run.finished_at = finished_at
        run.error_type = "cancelled"
        run.error_message = message
        await self.run_repository.save(run)

        job.status = "cancelled"
        job.error_type = "cancelled"
        job.error_message = message
        job.finished_at = finished_at
        await self.job_repository.save(job)
        await self.task_progress_service.mark_job_cancelled(job, message=message)
        await session.commit()

    async def _mark_failed(self, *, job: ExtractionJob, run: ExtractionRun, error: Exception) -> None:
        finished_at = datetime.utcnow()
        error_message = str(error) or error.__class__.__name__
        # Drill through chained exceptions so an LlmExtractionError wrapping a
        # TimeoutException still classifies as llm_timeout.
        error_type = self._classify_extraction_error(error)
        is_timeout = error_type == ERROR_TIMEOUT
        terminal_status = "timeout" if is_timeout else "failed"

        run.status = terminal_status
        run.finished_at = finished_at
        run.error_message = error_message
        run.error_type = error_type
        run.validation_status = "invalid"
        await self.run_repository.save(run)

        job.status = terminal_status
        job.error_message = error_message
        job.error_type = error_type
        job.finished_at = finished_at
        if is_timeout:
            job.timeout_at = finished_at
        await self.job_repository.save(job)
        await self.task_progress_service.mark_job_failed(job, error_message=error_message)
        await session.commit()

    def _classify_extraction_error(self, error: BaseException) -> str:
        current: BaseException | None = error
        while current is not None:
            explicit_error_type = getattr(current, "error_type", None)
            if isinstance(explicit_error_type, str) and explicit_error_type:
                return explicit_error_type
            tag = classify_exception(current)
            if tag != "unknown":
                return tag
            current = current.__cause__ or current.__context__
        return "unknown"

    def _build_parsed_output(self, output: dict[str, Any]) -> dict[str, Any]:
        # Slimmed payload: raw LLM responses live in llm_call_logs, validation_log
        # lives in extraction_runs.validation_log. Keeping only the fields the
        # downstream value writer needs.
        if not isinstance(output, dict):
            return {"fields": [], "attempt_count": 1}
        return {
            "fields": output.get("fields", []),
            "attempt_count": output.get("attempt_count", 1),
        }

    def _empty_result_message(
        self,
        *,
        parsed: dict[str, Any] | None,
        validation_status: str | None,
        target_form_key: str | None,
    ) -> str | None:
        """Return a human-readable reason if a completed run produced no fields.

        Distinguishes between:
        - LLM explicitly returned an empty result (validation_status == "valid_empty"):
          the model did read the document but found nothing matching the requested form.
        - LLM returned data but normalization stripped everything (no valid value_type,
          no matching field_path, etc.).
        Returns None when fields were successfully extracted.
        """
        fields = (parsed or {}).get("fields") if isinstance(parsed, dict) else None
        if isinstance(fields, list) and fields:
            return None
        form_hint = f"（表单：{target_form_key}）" if target_form_key else ""
        if validation_status == "valid_empty":
            return f"LLM 未在文档中找到该表单的可抽取字段{form_hint}；可能是文档与表单不匹配或字段提示不够具体。"
        return f"已完成但未写入任何字段{form_hint}；LLM 输出中的字段全部被规则规范化阶段丢弃，请检查模板字段定义。"

    def _ensure_can_process(self, job: ExtractionJob) -> None:
        if job.status == "cancelled":
            raise ExtractionConflictError("Cancelled extraction job cannot be processed")
        if job.status == "completed":
            raise ExtractionConflictError("Completed extraction job cannot be processed")
        if job.status in {"failed", "timeout"}:
            raise ExtractionConflictError("Failed extraction job must be retried")
        if job.status == "running":
            raise ExtractionConflictError("Running extraction job cannot be processed twice")

    def _ensure_can_retry(self, job: ExtractionJob) -> None:
        if job.status not in {"failed", "timeout"}:
            raise ExtractionConflictError("Only failed or timed out extraction jobs can be retried")

    def _is_transient_error(self, error: Exception) -> bool:
        if TRANSIENT_EXTRACTION_ERRORS and isinstance(error, TRANSIENT_EXTRACTION_ERRORS):
            return True
        current: BaseException | None = error
        while current is not None:
            if current.__class__.__name__ in _TRANSIENT_DB_ORIG_EXCEPTIONS:
                return True
            current = current.__cause__ or current.__context__
        return False

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
        document = await self.document_repository.get_visible_by_id(
            job.document_id,
            uploaded_by=getattr(job, "requested_by", None),
        )
        if document is None:
            raise ExtractionNotFoundError("Document not found")
        return not self._document_ready_for_extraction(document)

    async def _extract(
        self,
        *,
        job: ExtractionJob,
        llm_call_buffer: list[dict[str, Any]] | None = None,
        llm_call_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if self._uses_schema_extractor(job):
            document, context = await self._resolve_schema_extraction_scope(job)
            schema_version = await self.ehr_service.schema_service.get_version(job.schema_version_id)
            if schema_version is None:
                raise ExtractionNotFoundError("Schema version not found")
            fields = self._filter_schema_fields(plan_schema_fields(schema_version.schema_json), job)
            if not fields:
                raise ExtractionConflictError("No schema fields matched extraction target")
            if self._use_claude_code_extractor(job):
                await release_db_connection()
                return self.claude_code_ehr_extractor.extract(
                    text=extract_document_text(document),
                    fields=fields,
                    schema_json=schema_version.schema_json,
                    document_id=document.id,
                    document=document,
                    job=job,
                    llm_call_buffer=llm_call_buffer,
                    llm_call_context=llm_call_context,
                )
            if self._use_llm_ehr_extractor():
                await release_db_connection()
                return self.llm_ehr_extractor.extract(
                    text=extract_document_text(document),
                    fields=fields,
                    document_id=document.id,
                    document=document,
                    llm_call_buffer=llm_call_buffer,
                    llm_call_context=llm_call_context,
                )
            text = extract_document_text(document)
            output = self.ehr_extractor.extract(text=text, fields=fields, document_id=document.id)
            if llm_call_buffer is not None:
                context = dict(llm_call_context or {})
                llm_call_buffer.append(
                    {
                        "call_id": context.get("call_id"),
                        "job_id": context.get("job_id") or job.id,
                        "run_id": context.get("run_id"),
                        "document_id": document.id,
                        "purpose": "rule_extract",
                        "node_name": "simple_ehr_extractor",
                        "model_name": "SimpleEhrExtractor",
                        "prompt_version": context.get("prompt_version"),
                        "user_prompt": json.dumps(
                            {
                                "field_count": len(fields),
                                "field_paths": [field.field_path for field in fields[:50]],
                                "text_length": len(text or ""),
                            },
                            ensure_ascii=False,
                        ),
                        "parsed_response": output,
                        "status": "success",
                        "started_at": datetime.utcnow(),
                        "finished_at": datetime.utcnow(),
                    }
                )
            return output
        output = self.extractor.extract(job=job)
        if llm_call_buffer is not None:
            context = dict(llm_call_context or {})
            llm_call_buffer.append(
                {
                    "job_id": context.get("job_id") or job.id,
                    "run_id": context.get("run_id"),
                    "document_id": job.document_id,
                    "purpose": "mock_extract",
                    "node_name": "mock_extractor",
                    "model_name": "MockExtractor",
                    "parsed_response": output,
                    "status": "success",
                    "started_at": datetime.utcnow(),
                    "finished_at": datetime.utcnow(),
                }
            )
        return output

    def _model_name_for_job(self, job: ExtractionJob) -> str:
        if self._uses_schema_extractor(job):
            if self._use_claude_code_extractor(job):
                return "ClaudeCodeEhrExtractor"
            return "LlmEhrExtractor" if self._use_llm_ehr_extractor() else "SimpleEhrExtractor"
        return "MockExtractor"

    def _uses_schema_extractor(self, job: ExtractionJob) -> bool:
        return job.job_type in {"patient_ehr", "project_crf", "targeted_schema"} and job.document_id is not None

    async def _resolve_schema_extraction_scope(self, job: ExtractionJob) -> tuple[Document, DataContext | None]:
        document = await self.document_repository.get_visible_by_id(
            job.document_id,
            uploaded_by=getattr(job, "requested_by", None),
        )
        if document is None:
            raise ExtractionNotFoundError("Document not found")

        context: DataContext | None = None
        if job.context_id is not None:
            context = await self._ensure_context_access(
                job.context_id,
                getattr(job, "requested_by", None),
            )
            self._validate_job_context(job=job, context=context, document=document)
            if job.schema_version_id is None:
                job.schema_version_id = context.schema_version_id
        elif job.job_type in {"patient_ehr", "targeted_schema"}:
            if job.patient_id is None:
                raise ExtractionConflictError(f"{job.job_type} extraction requires patient_id or context_id")
        else:
            raise ExtractionConflictError(f"{job.job_type} extraction requires context_id")

        if job.patient_id is not None and document.patient_id not in (None, job.patient_id):
            raise ExtractionConflictError("Document does not belong to patient")
        if getattr(job, "requested_by", None) is not None and job.patient_id is not None:
            await self._ensure_patient_access(job.patient_id, job.requested_by)
        if getattr(job, "requested_by", None) is not None and job.project_id is not None:
            await self._ensure_project_access(job.project_id, job.requested_by)
        if job.schema_version_id is None:
            raise ExtractionNotFoundError("Schema version not found")
        return document, context

    def _validate_job_context(self, *, job: ExtractionJob, context: DataContext, document: Document) -> None:
        if job.job_type == "project_crf" and context.context_type != "project_crf":
            raise ExtractionConflictError("project_crf extraction requires project CRF context")
        if job.job_type == "patient_ehr" and context.context_type != "patient_ehr":
            raise ExtractionConflictError(f"{job.job_type} extraction requires patient EHR context")
        if job.job_type == "targeted_schema" and context.context_type not in {"patient_ehr", "project_crf"}:
            raise ExtractionConflictError("targeted_schema extraction requires patient EHR or project CRF context")
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

    def _task_type_for_job(self, job: ExtractionJob) -> str:
        if job.job_type == "project_crf":
            return "project_crf_targeted_extract" if job.target_form_key else "project_crf_folder_extract"
        if job.job_type == "targeted_schema":
            return "patient_ehr_targeted_extract"
        return "patient_ehr_targeted_extract" if job.target_form_key else "patient_ehr_folder_extract"

    def _use_llm_ehr_extractor(self) -> bool:
        if self._llm_ehr_extractor_injected:
            return True
        return str(config.EACY_EXTRACTION_STRATEGY).lower() in {"llm", "langgraph", "multi_agent"}

    def _use_claude_code_extractor(self, job: ExtractionJob) -> bool:
        return job_uses_claude_code(job_type=job.job_type, input_json=job.input_json)

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
        records_by_form = self._records_by_form_repeat_index(records)
        default_record = records[0]
        merge_resolver = RecordInstanceMergeResolver(
            record_repository=self.record_repository,
            records_by_form=records_by_form,
            default_record=default_record,
            context_id=job.context_id,
            source_document_id=job.document_id,
            extraction_run_id=run.id,
        )
        source_document = None
        if job.document_id is not None:
            source_document = await self.document_repository.get_visible_by_id(
                job.document_id,
                uploaded_by=getattr(job, "requested_by", None),
            )

        output_fields = [field for field in parsed_output.get("fields", []) if isinstance(field, dict)]
        fields_by_group: dict[Any, list[dict[str, Any]]] = defaultdict(list)
        for field in output_fields:
            if not field.get("field_path"):
                continue
            fields_by_group[merge_resolver.group_key_for_field(field)].append(field)

        records_by_output_group: dict[Any, RecordInstance] = {}
        for group_key, grouped_fields in fields_by_group.items():
            records_by_output_group[group_key] = await merge_resolver.resolve_record_for_group(grouped_fields)

        field_entries: list[dict[str, Any]] = []
        for field in output_fields:
            if not field.get("field_path"):
                continue
            group_key = merge_resolver.group_key_for_field(field)
            canonical_field_path = RecordInstanceMergeResolver.canonical_field_path(field.get("field_path"))
            if not canonical_field_path:
                continue
            normalized_field = {
                **field,
                "field_path": canonical_field_path,
                "record_form_key": field.get("record_form_key")
                or RecordInstanceMergeResolver.record_form_key_from_field_path(canonical_field_path),
            }
            field_key = normalized_field.get("field_key") or canonical_field_path.split(".")[-1]
            record = records_by_output_group.get(group_key) or default_record
            evidences = self._build_field_evidences(
                field=normalized_field,
                document_id=job.document_id,
                source_document=source_document,
            )
            field_entries.append(
                {
                    "field": normalized_field,
                    "field_key": field_key,
                    "record": record,
                    "evidences": evidences,
                }
            )

        self._apply_sibling_evidence_fallback(field_entries)

        for entry in field_entries:
            field = entry["field"]
            record = entry["record"]
            await self.value_service.record_ai_extracted_value(
                context_id=job.context_id,
                record_instance_id=record.id,
                field_key=entry["field_key"],
                field_path=field["field_path"],
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
                evidences=entry["evidences"],
                auto_select_if_empty=self._should_auto_select_field(entry["evidences"]),
            )

    def _build_field_evidences(
        self,
        *,
        field: dict[str, Any],
        document_id: str | None,
        source_document: Document | None,
    ) -> list[dict[str, Any]]:
        if document_id is None:
            return []

        evidences: list[dict[str, Any]] = []
        field_evidences = field.get("evidences") if isinstance(field.get("evidences"), list) else []
        if field_evidences:
            resolved_field_evidences = resolve_evidence_locations(
                source_document,
                field_evidences,
                fallback_text=self._field_display_value(field),
            )
            for evidence in resolved_field_evidences:
                if not isinstance(evidence, dict):
                    continue
                bbox_json = evidence.get("bbox_json")
                if evidence.get("record_shared") and isinstance(bbox_json, dict):
                    bbox_json = {**bbox_json, "record_shared": True}
                evidences.append(
                    {
                        "document_id": document_id,
                        "evidence_type": self._resolve_evidence_type(evidence),
                        "quote_text": self._resolved_evidence_quote(evidence=evidence, field=field),
                        "evidence_score": field.get("confidence"),
                        "page_no": evidence.get("page_no"),
                        "bbox_json": bbox_json,
                        "start_offset": evidence.get("start_offset"),
                        "end_offset": evidence.get("end_offset"),
                    }
                )
            return evidences

        resolved_field_evidences = resolve_evidence_locations(
            source_document,
            [{"quote_text": field.get("quote_text") or self._field_display_value(field)}],
            fallback_text=self._field_display_value(field),
        )
        resolved_evidence = resolved_field_evidences[0] if resolved_field_evidences else {}
        return [
            {
                "document_id": document_id,
                "evidence_type": self._resolve_evidence_type(resolved_evidence),
                "quote_text": self._resolved_evidence_quote(evidence=resolved_evidence, field=field),
                "evidence_score": field.get("confidence"),
                "page_no": resolved_evidence.get("page_no"),
                "bbox_json": resolved_evidence.get("bbox_json"),
            }
        ]

    def _resolve_evidence_type(self, evidence: dict[str, Any]) -> str:
        bbox_json = evidence.get("bbox_json")
        location = bbox_json if isinstance(bbox_json, dict) else {}
        if location.get("fallback_strategy") == "sibling_page_hint":
            return "document_page_hint"
        is_record_shared = bool(evidence.get("record_shared") or location.get("record_shared"))
        if evidence_location_is_trusted(location):
            if is_record_shared:
                return "document_record_shared"
            if location.get("match_strategy") == "ocr_value_fuzzy":
                return "document_fuzzy"
            return "document_source_id"
        if isinstance(location, dict) and location.get("match_strategy") == "ocr_value_fuzzy":
            return "document_fuzzy_low_confidence"
        if evidence.get("quote_text"):
            return "document_text"
        return "document_text"

    def _should_auto_select_field(self, evidences: list[dict[str, Any]]) -> bool:
        for evidence in evidences or []:
            if not isinstance(evidence, dict):
                continue
            bbox_json = evidence.get("bbox_json")
            if isinstance(bbox_json, dict) and evidence_location_is_trusted(bbox_json):
                return True
        return False

    def _apply_sibling_evidence_fallback(self, field_entries: list[dict[str, Any]]) -> None:
        located_by_group: dict[tuple[str, str], dict[str, Any]] = {}
        for entry in field_entries:
            group_key = self._field_evidence_group_key(entry)
            if group_key is None:
                continue
            located = self._first_located_evidence(entry.get("evidences") or [])
            if located is not None:
                located_by_group.setdefault(group_key, located)

        for entry in field_entries:
            evidences = entry.get("evidences") or []
            if not evidences or self._first_located_evidence(evidences) is not None:
                continue
            group_key = self._field_evidence_group_key(entry)
            if group_key is None:
                continue
            sibling_evidence = located_by_group.get(group_key)
            if sibling_evidence is None:
                continue
            for evidence in evidences:
                if self._evidence_has_location(evidence):
                    continue
                evidence["page_no"] = sibling_evidence.get("page_no")
                sibling_bbox = sibling_evidence.get("bbox_json")
                sibling_page = sibling_evidence.get("page_no")
                if sibling_page is not None:
                    evidence["page_no"] = sibling_page
                    evidence["bbox_json"] = {
                        "page_no": sibling_page,
                        "renderable": False,
                        "fallback_strategy": "sibling_page_hint",
                        "fallback_from_quote_text": sibling_evidence.get("quote_text"),
                        "coord_warning": "sibling_page_only",
                    }
                elif isinstance(sibling_bbox, dict) and sibling_bbox.get("page_no") is not None:
                    evidence["page_no"] = sibling_bbox.get("page_no")
                    evidence["bbox_json"] = {
                        "page_no": sibling_bbox.get("page_no"),
                        "renderable": False,
                        "fallback_strategy": "sibling_page_hint",
                        "fallback_from_quote_text": sibling_evidence.get("quote_text"),
                        "coord_warning": "sibling_page_only",
                    }

    def _field_evidence_group_key(self, entry: dict[str, Any]) -> tuple[str, str] | None:
        field = entry.get("field")
        record = entry.get("record")
        field_path = field.get("field_path") if isinstance(field, dict) else None
        if not field_path or record is None:
            return None
        parent_path = str(field_path).rsplit(".", 1)[0] if "." in str(field_path) else str(field_path)
        return (str(getattr(record, "id", "")), parent_path)

    def _first_located_evidence(self, evidences: list[dict[str, Any]]) -> dict[str, Any] | None:
        for evidence in evidences:
            if not isinstance(evidence, dict):
                continue
            bbox_json = evidence.get("bbox_json")
            if isinstance(bbox_json, dict) and evidence_location_is_trusted(bbox_json):
                return evidence
            if evidence.get("page_no") is not None:
                return evidence
        return None

    def _evidence_has_location(self, evidence: dict[str, Any]) -> bool:
        bbox_json = evidence.get("bbox_json")
        if isinstance(bbox_json, dict) and evidence_location_is_trusted(bbox_json):
            return True
        if evidence.get("page_no") is not None and isinstance(bbox_json, dict) and bbox_json.get("fallback_strategy"):
            return True
        return False

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

    def _records_by_form_repeat_index(self, records: list[RecordInstance]) -> dict[str, dict[int, RecordInstance]]:
        records_by_form: dict[str, dict[int, RecordInstance]] = {}
        for record in records:
            records_by_form.setdefault(record.form_key, {})[int(record.repeat_index or 0)] = record
        return records_by_form

    async def _resolve_output_record(
        self,
        *,
        field: dict[str, Any],
        records_by_form: dict[str, dict[int, RecordInstance]],
        default_record: RecordInstance,
        context_id: str,
        source_document_id: str | None,
        extraction_run_id: str | None,
    ) -> RecordInstance:
        explicit_record_id = field.get("record_instance_id")
        if explicit_record_id:
            for records_for_form in records_by_form.values():
                for record in records_for_form.values():
                    if str(record.id) == str(explicit_record_id):
                        return record

        record_form_key = field.get("record_form_key") or self._record_form_key_from_field_path(field.get("field_path"))
        repeat_index = self._repeat_index_from_output_field(field=field, record_form_key=record_form_key)
        if record_form_key and record_form_key in records_by_form:
            records_for_form = records_by_form[record_form_key]
            if repeat_index in records_for_form:
                return records_for_form[repeat_index]
            base_record = records_for_form.get(0) or next(iter(records_for_form.values()), None)
            record = await self._create_output_record(
                context_id=context_id,
                form_key=record_form_key,
                repeat_index=repeat_index,
                base_record=base_record,
                form_title=field.get("record_form_title"),
                source_document_id=source_document_id,
                extraction_run_id=extraction_run_id,
            )
            records_for_form[repeat_index] = record
            return record

        parts = str(field.get("field_path") or "").split(".")
        if len(parts) >= 2:
            form_key = f"{parts[0]}.{parts[1]}"
            if form_key in records_by_form:
                records_for_form = records_by_form[form_key]
                if repeat_index in records_for_form:
                    return records_for_form[repeat_index]
                base_record = records_for_form.get(0) or next(iter(records_for_form.values()), None)
                record = await self._create_output_record(
                    context_id=context_id,
                    form_key=form_key,
                    repeat_index=repeat_index,
                    base_record=base_record,
                    form_title=field.get("record_form_title"),
                    source_document_id=source_document_id,
                    extraction_run_id=extraction_run_id,
                )
                records_for_form[repeat_index] = record
                return record
        return default_record

    def _record_form_key_from_field_path(self, field_path: Any) -> str | None:
        parts = [part for part in str(field_path or "").split(".") if part]
        if len(parts) >= 2:
            return f"{parts[0]}.{parts[1]}"
        return parts[0] if parts else None

    def _repeat_index_from_output_field(self, *, field: dict[str, Any], record_form_key: str | None) -> int:
        raw_repeat_index = field.get("repeat_index")
        if raw_repeat_index is not None:
            try:
                return max(0, int(raw_repeat_index))
            except (TypeError, ValueError):
                pass

        parts = [part for part in str(field.get("field_path") or "").split(".") if part]
        form_parts = [part for part in str(record_form_key or "").split(".") if part]
        if form_parts and parts[: len(form_parts)] == form_parts:
            candidates = parts[len(form_parts):]
        else:
            candidates = parts[2:]
        for part in candidates:
            if part.isdigit():
                return int(part)
        return 0

    async def _create_output_record(
        self,
        *,
        context_id: str,
        form_key: str,
        repeat_index: int,
        base_record: RecordInstance | None,
        form_title: str | None = None,
        source_document_id: str | None,
        extraction_run_id: str | None,
    ) -> RecordInstance:
        form_title = getattr(base_record, "form_title", None) or form_title or form_key.split(".")[-1]
        group_key = getattr(base_record, "group_key", None) or (form_key.split(".")[0] if "." in form_key else None)
        group_title = getattr(base_record, "group_title", None) or group_key
        return await self.record_repository.create(
            {
                "context_id": context_id,
                "group_key": group_key,
                "group_title": group_title,
                "form_key": form_key,
                "form_title": form_title,
                "repeat_index": repeat_index,
                "instance_label": form_title if repeat_index == 0 else f"{form_title} #{repeat_index + 1}",
                "source_document_id": source_document_id,
                "created_by_run_id": extraction_run_id,
                "review_status": "unreviewed",
            }
        )

    def _uses_fake_value_service(self) -> bool:
        return self.value_service.__class__.__module__.startswith("tests.")
