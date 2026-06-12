from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from types import SimpleNamespace
from typing import Any

from sqlalchemy import text

from app.models import DataContext, Document, ExtractionJob, ExtractionRun, RecordInstance
from app.services import extraction_service_runtime
from app.services.evidence_location_resolver import (
    build_ocr_reading_units,
    evidence_location_is_trusted,
    flatten_reading_unit_corpus,
    resolve_evidence_locations,
)
from app.services.extraction_errors import (
    ExtractionCancelledError,
    ExtractionConflictError,
    ExtractionNotFoundError,
    ExtractionTargetValidationError,
)
from app.services.extraction_plan_trace import build_folder_plan_json, build_single_job_plan_json, document_trace_terms
from app.services.extraction_strategy import extraction_queue_for_job, job_uses_claude_code, with_default_extraction_strategy
from app.services.extraction_types import (
    TRANSIENT_EXTRACTION_ERRORS,
    FolderUpdateOptions,
    SharedDocumentExtractionState,
    _TRANSIENT_DB_ORIG_EXCEPTIONS,
)
from app.services.llm_call_logger import ERROR_TIMEOUT, classify_exception, flush_llm_call_logs
from app.services.record_instance_label import record_instance_label
from app.services.record_instance_merge import RecordInstanceMergeResolver
from app.services.schema_field_planner import plan_schema_fields
from core.config import config
from core.db import Transactional, session


class ExtractionJobCreationMixin:
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
        if job_type == "targeted_schema" or params.get("target_form_key"):
            input_json = dict(params.get("input_json") or {})
            input_json.setdefault("enqueue_async", True)
            params["input_json"] = input_json
        draft_job = self._draft_job_for_prepare(job_type=job_type, requested_by=requested_by, params=params)
        await self._prepare_job(job=draft_job, created_by=requested_by)
        await self._validate_schema_targets(draft_job)
        for key in (
            "patient_id",
            "document_id",
            "project_id",
            "project_patient_id",
            "context_id",
            "schema_version_id",
            "target_form_key",
            "input_json",
        ):
            params[key] = getattr(draft_job, key, None)
        job = await self.create_job(
            job_type=job_type,
            requested_by=requested_by,
            progress=0,
            **params,
        )
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
        input_json, target_form_key = self._input_for_plan_items(
            plan_items,
            base_input=base_input,
            source=base_input.get("source") or "extraction_planner",
        )
        job_params = {
            **params,
            "target_form_key": target_form_key,
            "input_json": input_json,
        }
        jobs.append(await self.create_and_process_job(requested_by=requested_by, **job_params))
        return jobs

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

    async def _create_pending_planned_job_for_plan_items(
        self,
        plan_items: list[Any],
        *,
        job_type: str,
        requested_by: str | None = None,
        source: str,
        base_input_json: dict[str, Any] | None = None,
        **params: Any,
    ) -> ExtractionJob:
        input_json, target_form_key = self._input_for_plan_items(
            plan_items,
            base_input=base_input_json or {},
            source=source,
        )
        return await self._create_pending_planned_job(
            job_type=job_type,
            requested_by=requested_by,
            target_form_key=target_form_key,
            input_json=input_json,
            **params,
        )

    def _input_for_plan_items(
        self,
        plan_items: list[Any],
        *,
        base_input: dict[str, Any],
        source: str,
    ) -> tuple[dict[str, Any], str | None]:
        form_keys = [item.target_form_key for item in plan_items if getattr(item, "target_form_key", None)]
        planned_forms = [
            {
                "target_form_key": item.target_form_key,
                "form_title": getattr(item, "form_title", None),
                "planned_reason": getattr(item, "reason", None),
                "match_role": getattr(item, "match_role", None),
            }
            for item in plan_items
            if getattr(item, "target_form_key", None)
        ]
        first = plan_items[0] if plan_items else None
        input_json = {
            **base_input,
            "source": source,
            "form_keys": form_keys,
            "planned_forms": planned_forms,
            "planned_reason": getattr(first, "reason", None),
            "match_role": getattr(first, "match_role", None),
        }
        if len(form_keys) > 1:
            input_json["planned_reason"] = f"document matched {len(form_keys)} target forms"
            input_json["match_role"] = "multi_form"
        return input_json, form_keys[0] if len(form_keys) == 1 else None
