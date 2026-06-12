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


class ExtractionProcessStateMixin:
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
        return ocr_status in {"completed", "success"}

    async def _should_wait_for_document_ready(self, job: ExtractionJob) -> bool:
        if not isinstance(job.input_json, dict) or job.input_json.get("wait_for_document_ready") is not True:
            return False
        if job.document_id is None:
            return False
        document = await self.document_repository.get_visible_by_id(
            job.document_id,
            uploaded_by=self._document_uploaded_by_for_job(job),
        )
        if document is None:
            raise ExtractionNotFoundError("Document not found")
        return not self._document_ready_for_extraction(document)
