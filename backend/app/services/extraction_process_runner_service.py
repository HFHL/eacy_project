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


class ExtractionProcessRunnerMixin:
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
        shared_states: list[SharedDocumentExtractionState] = []
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
                    uploaded_by=self._document_uploaded_by_for_job(job),
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
            shared_jobs = await self._claim_shared_document_call_jobs(
                primary_job=job,
                worker_mode=input_snapshot_extra.get("worker") is True,
            )
            shared_states = await self._start_shared_document_runs(
                primary_job=job,
                shared_jobs=shared_jobs,
                model_name=model_name,
                prompt_version=prompt_version,
                input_snapshot_extra=input_snapshot_extra,
            )
            if shared_states:
                snapshot["shared_document_call"] = {
                    "primary_job_id": job.id,
                    "job_ids": [job.id, *(state.job.id for state in shared_states)],
                }
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
            shared_outputs: list[tuple[SharedDocumentExtractionState, dict[str, Any]]] = []
            if shared_states:
                combined_output = await self._extract_shared_document_call(
                    primary_job=job,
                    shared_states=shared_states,
                    llm_call_buffer=llm_call_buffer,
                    llm_call_context=llm_call_context,
                )
                output = self._filter_output_for_field_specs(
                    combined_output,
                    field_specs=list(snapshot.get("field_specs") or []),
                    shared_primary_job_id=job.id,
                )
                shared_outputs = [
                    (
                        state,
                        self._filter_output_for_field_specs(
                            combined_output,
                            field_specs=state.field_specs,
                            shared_primary_job_id=job.id,
                        ),
                    )
                    for state in shared_states
                ]
            else:
                output = await self._extract(
                    job=job,
                    run=run,
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
            empty_result_message = await self._persist_successful_job_output(
                job=job,
                run=run,
                output=output,
                model_name=model_name,
            )
            for state, state_output in shared_outputs:
                await self.task_progress_service.update_job_progress(
                    state.job,
                    progress=65,
                    stage="validate_output",
                    stage_label="校验抽取结果",
                    message="正在拆分共享抽取结果",
                    current_step=5,
                    payload_json={
                        "validation_status": state_output.get("validation_status") if isinstance(state_output, dict) else None,
                        "attempt_count": state_output.get("attempt_count") if isinstance(state_output, dict) else None,
                        "shared_primary_job_id": job.id,
                    },
                    commit=True,
                )
                await self._persist_successful_job_output(
                    job=state.job,
                    run=state.run,
                    output=state_output,
                    model_name=model_name,
                )
            await flush_llm_call_logs(llm_call_buffer)
            return job
        except Exception as error:
            await session.rollback()
            # Re-flush LLM call logs in a fresh transaction; rollback above wiped them.
            await flush_llm_call_logs(llm_call_buffer, commit=True)
            if isinstance(error, ExtractionCancelledError):
                await self._mark_cancelled(job=job, run=run, message=str(error))
                for state in shared_states:
                    await self._mark_cancelled(job=state.job, run=state.run, message=str(error))
                return job
            if not raise_on_failure and self._is_transient_error(error):
                for state in shared_states:
                    state.job.status = "pending"
                    state.job.progress = 0
                    state.job.error_type = "retry_scheduled"
                    state.job.error_message = f"共享 Claude 调用临时错误，等待调度重试：{str(error) or error.__class__.__name__}"
                    state.job.started_at = None
                    state.job.finished_at = None
                    await self.job_repository.save(state.job)
                    state.run.status = "failed"
                    state.run.finished_at = datetime.utcnow()
                    state.run.error_type = "retry_scheduled"
                    state.run.error_message = state.job.error_message
                    await self.run_repository.save(state.run)
                    await self.task_progress_service.mark_job_waiting_for_scheduler(
                        state.job,
                        message=state.job.error_message,
                        reset_progress=True,
                    )
                if shared_states:
                    await session.commit()
                await extraction_service_runtime.release_db_connection()
                raise
            await self._mark_failed(job=job, run=run, error=error)
            for state in shared_states:
                await self._mark_failed(job=state.job, run=state.run, error=error)
            if raise_on_failure:
                raise
            return job
