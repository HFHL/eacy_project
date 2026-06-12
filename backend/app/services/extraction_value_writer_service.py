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


class ExtractionValueWriterMixin:
    async def _write_extracted_values(
        self,
        *,
        job: ExtractionJob,
        run: ExtractionRun,
        parsed_output: dict[str, Any],
    ) -> int:
        if job.context_id is None:
            return 0

        if not self._uses_fake_value_service():
            await session.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:context_id, 0))"), {"context_id": str(job.context_id)})

        records = await self.record_repository.list_by_context(job.context_id)
        records_by_form = self._records_by_form_repeat_index(records)
        default_record = records[0] if records else None
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
                uploaded_by=self._document_uploaded_by_for_job(job),
            )

        output_fields = [field for field in parsed_output.get("fields", []) if isinstance(field, dict)]
        fields_by_group: dict[Any, list[dict[str, Any]]] = defaultdict(list)
        for field in output_fields:
            if not field.get("field_path"):
                continue
            group_key = merge_resolver.group_key_for_field(field)
            if not group_key.form_key:
                continue
            fields_by_group[group_key].append(field)

        records_by_output_group: dict[Any, RecordInstance | None] = {}
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
            if not normalized_field.get("record_form_key"):
                continue
            field_key = normalized_field.get("field_key") or canonical_field_path.split(".")[-1]
            record = records_by_output_group.get(group_key)
            if record is None:
                continue
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
        return len(field_entries)

    def _uses_fake_value_service(self) -> bool:
        return self.value_service.__class__.__module__.startswith("tests.")
