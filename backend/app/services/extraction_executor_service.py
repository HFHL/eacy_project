from __future__ import annotations

import asyncio
import json
import re
from collections import Counter, defaultdict
from contextlib import suppress
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


class ExtractionExecutorMixin:
    async def _extract(
        self,
        *,
        job: ExtractionJob,
        run: ExtractionRun | None = None,
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
                await extraction_service_runtime.release_db_connection()
                if hasattr(self.claude_code_ehr_extractor, "extract_async"):
                    return await self.claude_code_ehr_extractor.extract_async(
                        text=extraction_service_runtime.extract_document_text(document),
                        fields=fields,
                        schema_json=schema_version.schema_json,
                        document_id=document.id,
                        document=document,
                        job=job,
                        llm_call_buffer=llm_call_buffer,
                        llm_call_context=llm_call_context,
                        cancel_check=lambda: self._raise_if_cancelled(job.id),
                    )
                return self.claude_code_ehr_extractor.extract(
                    text=extraction_service_runtime.extract_document_text(document),
                    fields=fields,
                    schema_json=schema_version.schema_json,
                    document_id=document.id,
                    document=document,
                    job=job,
                    llm_call_buffer=llm_call_buffer,
                    llm_call_context=llm_call_context,
                )
            if self._use_llm_ehr_extractor():
                await extraction_service_runtime.release_db_connection()
                return await self._run_llm_ehr_extract_with_heartbeat(
                    job=job,
                    text=extraction_service_runtime.extract_document_text(document),
                    fields=fields,
                    document_id=document.id,
                    document=document,
                    run=run,
                    llm_call_buffer=llm_call_buffer,
                    llm_call_context=llm_call_context,
                )
            text = extraction_service_runtime.extract_document_text(document)
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

    async def _run_llm_ehr_extract_with_heartbeat(
        self,
        *,
        job: ExtractionJob,
        text: str,
        fields: list[Any],
        document_id: str,
        document: Document,
        run: ExtractionRun | None = None,
        llm_call_buffer: list[dict[str, Any]] | None = None,
        llm_call_context: dict[str, Any] | None = None,
        heartbeat_interval_seconds: float = 60.0,
    ) -> dict[str, Any]:
        heartbeat_task = asyncio.create_task(
            self._llm_ehr_extract_heartbeat(
                job_id=job.id,
                run_id=(llm_call_context or {}).get("run_id"),
                field_count=len(fields),
                interval_seconds=heartbeat_interval_seconds,
            )
        )
        try:
            if run is not None and hasattr(self.llm_ehr_extractor, "extract_batches"):
                return await self._run_llm_ehr_extract_batches(
                    job=job,
                    run=run,
                    text=text,
                    fields=fields,
                    document_id=document_id,
                    document=document,
                    llm_call_buffer=llm_call_buffer,
                    llm_call_context=llm_call_context,
                )
            return await asyncio.to_thread(
                self.llm_ehr_extractor.extract,
                text=text,
                fields=fields,
                document_id=document_id,
                document=document,
                llm_call_buffer=llm_call_buffer,
                llm_call_context=llm_call_context,
            )
        finally:
            heartbeat_task.cancel()
            with suppress(asyncio.CancelledError):
                await heartbeat_task

    async def _run_llm_ehr_extract_batches(
        self,
        *,
        job: ExtractionJob,
        run: ExtractionRun,
        text: str,
        fields: list[Any],
        document_id: str,
        document: Document,
        llm_call_buffer: list[dict[str, Any]] | None,
        llm_call_context: dict[str, Any] | None,
    ) -> dict[str, Any]:
        iterator = self.llm_ehr_extractor.extract_batches(
            text=text,
            fields=fields,
            document_id=document_id,
            document=document,
            llm_call_buffer=llm_call_buffer,
            llm_call_context=llm_call_context,
        )
        batch_results: list[dict[str, Any]] = []
        while True:
            batch_output = await asyncio.to_thread(self._next_llm_batch_result, iterator)
            if batch_output is None:
                break
            batch_results.append(batch_output)
            if batch_output.get("batch_status") == "failed":
                await self._report_failed_llm_batch(job=job, run=run, batch_output=batch_output)
                continue
            if batch_output.get("fields"):
                await self._persist_incremental_job_output(job=job, run=run, batch_output=batch_output)
            else:
                await self._report_empty_llm_batch(job=job, run=run, batch_output=batch_output)

        return self.llm_ehr_extractor._merge_batch_results(
            batch_results=batch_results,
            document_id=document_id,
            incrementally_persisted=True,
        )

    @staticmethod
    def _next_llm_batch_result(iterator: Any) -> dict[str, Any] | None:
        try:
            return next(iterator)
        except StopIteration:
            return None

    async def _report_failed_llm_batch(
        self,
        *,
        job: ExtractionJob,
        run: ExtractionRun,
        batch_output: dict[str, Any],
    ) -> None:
        batch_index = int(batch_output.get("batch_index") or 0)
        batch_count = max(int(batch_output.get("batch_count") or 1), 1)
        await self.task_progress_service.update_job_progress(
            job,
            status="running",
            progress=min(65, 45 + int(((batch_index + 1) / batch_count) * 20)),
            stage="discard_invalid_batch",
            stage_label="丢弃无效批次",
            message=f"第 {batch_index + 1}/{batch_count} 批未通过校验，已丢弃",
            extraction_run_id=run.id,
            current_step=5,
            event_type="batch_discarded",
            payload_json={
                "batch_index": batch_index,
                "batch_count": batch_count,
                "error_message": batch_output.get("error_message"),
            },
            commit=True,
        )

    async def _report_empty_llm_batch(
        self,
        *,
        job: ExtractionJob,
        run: ExtractionRun,
        batch_output: dict[str, Any],
    ) -> None:
        batch_index = int(batch_output.get("batch_index") or 0)
        batch_count = max(int(batch_output.get("batch_count") or 1), 1)
        await self.task_progress_service.update_job_progress(
            job,
            status="running",
            progress=min(69, 50 + int(((batch_index + 1) / batch_count) * 19)),
            stage="batch_valid_empty",
            stage_label="本批无字段",
            message=f"第 {batch_index + 1}/{batch_count} 批未抽到可写字段",
            extraction_run_id=run.id,
            current_step=5,
            event_type="batch_empty",
            payload_json={
                "batch_index": batch_index,
                "batch_count": batch_count,
                "field_candidate_count": 0,
            },
            commit=True,
        )

    async def _llm_ehr_extract_heartbeat(
        self,
        *,
        job_id: str,
        run_id: str | None,
        field_count: int,
        interval_seconds: float,
    ) -> None:
        while True:
            await asyncio.sleep(interval_seconds)
            try:
                await self.task_progress_service.update_job_progress(
                    job_id,
                    status="running",
                    progress=50,
                    stage="call_extractor",
                    stage_label="AI 抽取中",
                    message="AI 抽取仍在执行",
                    current_step=4,
                    extraction_run_id=run_id,
                    event_type="heartbeat",
                    payload_json={"model_name": "LlmEhrExtractor", "field_count": field_count},
                    commit=True,
                )
            except Exception:
                await session.rollback()
