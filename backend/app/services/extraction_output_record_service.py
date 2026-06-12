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


class ExtractionOutputRecordMixin:
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
                "instance_label": record_instance_label(form_title, form_key, repeat_index),
                "source_document_id": source_document_id,
                "created_by_run_id": extraction_run_id,
                "review_status": "unreviewed",
            }
        )
