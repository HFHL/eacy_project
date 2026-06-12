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


class ExtractionSuccessPersistenceMixin:
    async def _persist_successful_job_output(
        self,
        *,
        job: ExtractionJob,
        run: ExtractionRun,
        output: dict[str, Any],
        model_name: str,
        current_step: int = 6,
    ) -> str | None:
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
            current_step=current_step,
            payload_json={
                "field_candidate_count": len(parsed.get("fields") or []) if isinstance(parsed, dict) else 0,
            },
            commit=True,
        )
        if not output.get("incrementally_persisted"):
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
            parsed["empty_result_reason"] = empty_result_message
            run.parsed_output_json = parsed
            raw_output_json = getattr(run, "raw_output_json", None)
            if isinstance(raw_output_json, dict):
                run.raw_output_json = {**raw_output_json, "empty_result_reason": empty_result_message}
            run.error_type = "empty_result"
            run.error_message = empty_result_message
        await self.run_repository.save(run)

        job.status = "completed"
        job.progress = 100
        job.finished_at = finished_at
        if empty_result_message:
            job.error_type = "empty_result"
            job.error_message = empty_result_message
        elif job.error_type == "empty_result":
            job.error_type = None
            job.error_message = None
        await self.job_repository.save(job)
        await self.task_progress_service.mark_job_succeeded(
            job,
            warning_message=empty_result_message,
        )
        return empty_result_message

    async def _persist_incremental_job_output(
        self,
        *,
        job: ExtractionJob,
        run: ExtractionRun,
        batch_output: dict[str, Any],
    ) -> int:
        parsed = self._merge_incremental_parsed_output(run.parsed_output_json, batch_output)
        run.parsed_output_json = parsed
        run.validation_log = parsed.get("validation_log")
        run.validation_status = batch_output.get("validation_status") or run.validation_status or "valid"
        await self.run_repository.save(run)

        batch_index = int(batch_output.get("batch_index") or 0)
        batch_count = max(int(batch_output.get("batch_count") or 1), 1)
        progress = min(89, 70 + int(((batch_index + 1) / batch_count) * 18))
        job.progress = max(int(job.progress or 0), progress)
        await self.job_repository.save(job)

        written_count = await self._write_extracted_values(job=job, run=run, parsed_output=batch_output)
        total_written = int(parsed.get("persisted_field_count") or 0) + written_count
        parsed["persisted_field_count"] = total_written
        run.parsed_output_json = parsed
        await self.run_repository.save(run)
        await self.task_progress_service.update_job_progress(
            job,
            status="running",
            progress=progress,
            stage="persist_batch_values",
            stage_label="写入本批字段",
            message=f"已写入第 {batch_index + 1}/{batch_count} 批字段",
            current_step=6,
            extraction_run_id=run.id,
            event_type="fields_persisted",
            payload_json={
                "batch_index": batch_index,
                "batch_count": batch_count,
                "batch_field_count": int(batch_output.get("batch_field_count") or 0),
                "field_candidate_count": len(batch_output.get("fields") or []),
                "persisted_field_count": written_count,
                "total_persisted_field_count": total_written,
                "refresh_scope": "ehr_folder",
            },
            commit=True,
        )
        return written_count

    def _merge_incremental_parsed_output(
        self,
        current: dict[str, Any] | None,
        batch_output: dict[str, Any],
    ) -> dict[str, Any]:
        parsed = dict(current) if isinstance(current, dict) else {}
        parsed.setdefault("fields", [])
        parsed["fields"] = [*(parsed.get("fields") or []), *(batch_output.get("fields") or [])]
        parsed["attempt_count"] = max(int(parsed.get("attempt_count") or 0), int(batch_output.get("attempt_count") or 0))
        parsed["validation_warnings"] = [
            *(parsed.get("validation_warnings") or []),
            *(batch_output.get("validation_warnings") or []),
        ]
        parsed["validation_log"] = [
            *(parsed.get("validation_log") or []),
            *(batch_output.get("validation_log") or []),
        ]
        return parsed

    def _build_parsed_output(self, output: dict[str, Any]) -> dict[str, Any]:
        # Slimmed payload: raw LLM responses live in llm_call_logs, validation_log
        # lives in extraction_runs.validation_log. Keeping only the fields the
        # downstream value writer needs.
        if not isinstance(output, dict):
            return {"fields": [], "attempt_count": 1}
        return {
            "fields": output.get("fields", []),
            "attempt_count": output.get("attempt_count", 1),
            "validation_warnings": output.get("validation_warnings", []),
            "discarded_fields": output.get("discarded_fields", []),
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
