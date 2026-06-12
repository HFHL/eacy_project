from __future__ import annotations

from datetime import datetime
from typing import Any

from app.models import Document
from app.services.agent.claude_code_runner import (
    ClaudeCodeRunResult,
    ClaudeCodeRunner,
    ClaudeCodeValidationError,
)
from app.services.evidence_location_resolver import build_ocr_reading_units, flatten_reading_unit_corpus
from app.services.llm_ehr_extractor import LlmEhrExtractor
from app.services.schema_field_planner import SchemaField

from .claude_code_ehr_helpers import ClaudeCodeEhrHelperMixin


class ClaudeCodeEhrExtractor(ClaudeCodeEhrHelperMixin):
    def __init__(
        self,
        *,
        runner: ClaudeCodeRunner | None = None,
        normalizer: LlmEhrExtractor | None = None,
    ):
        self.runner = runner or ClaudeCodeRunner()
        self.normalizer = normalizer or LlmEhrExtractor()

    def extract(
        self,
        *,
        text: str,
        fields: list[SchemaField],
        schema_json: dict[str, Any],
        document_id: str | None = None,
        document: Document | None = None,
        job: Any = None,
        llm_call_buffer: list[dict[str, Any]] | None = None,
        llm_call_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        reading_units = build_ocr_reading_units(
            document,
            field_hints=[field.field_title for field in fields if getattr(field, "field_title", None)],
        )
        text_corpus = flatten_reading_unit_corpus(reading_units) or (text or "").strip()
        field_specs = [self.normalizer._field_spec(field) for field in fields]
        document_meta = self.normalizer._document_meta(document)
        job_meta = self._job_meta(
            job=job,
            document_id=document_id,
            field_count=len(field_specs),
            llm_call_context=llm_call_context,
        )

        first = self.runner.run_extraction(
            ocr_text=text_corpus,
            ocr_payload=self._ocr_payload(document),
            reading_units=reading_units,
            schema_json=schema_json,
            field_specs=field_specs,
            document_meta=document_meta,
            job_meta=job_meta,
        )
        self._append_call_log(first, llm_call_buffer=llm_call_buffer, llm_call_context=llm_call_context, retry_no=0)

        errors, warnings, validation_status = self._validate_raw_result(
            first.parsed_result,
            field_specs=field_specs,
            text=text_corpus,
            reading_units=reading_units,
        )
        validation_log = [self._validation_log_entry(1, errors=errors, warnings=warnings, status=validation_status)]
        final_result = first
        attempt_count = 1

        if errors:
            second = self.runner.run_extraction(
                ocr_text=text_corpus,
                ocr_payload=self._ocr_payload(document),
                reading_units=reading_units,
                schema_json=schema_json,
                field_specs=field_specs,
                document_meta=document_meta,
                job_meta={**job_meta, "repair_attempt": 1},
                repair_errors=errors,
            )
            self._append_call_log(second, llm_call_buffer=llm_call_buffer, llm_call_context=llm_call_context, retry_no=1)
            final_result = second
            attempt_count = 2
            errors, warnings, validation_status = self._validate_raw_result(
                final_result.parsed_result,
                field_specs=field_specs,
                text=text_corpus,
                reading_units=reading_units,
            )
            validation_log.append(self._validation_log_entry(2, errors=errors, warnings=warnings, status=validation_status))

        if errors:
            raise ClaudeCodeValidationError("; ".join(errors))

        normalized = self.normalizer._node_normalize(
            {
                "document_id": document_id,
                "field_specs": field_specs,
                "raw_output": final_result.parsed_result,
                "validation_status": validation_status,
            }
        )
        fields_output = self._canonicalize_output_field_paths(
            normalized.get("fields_output") or [],
            field_specs=field_specs,
        )
        return {
            "extractor": "ClaudeCodeEhrExtractor",
            "document_id": document_id,
            "raw_output": {
                **final_result.parsed_result,
                "_claude_code": self._run_metadata(final_result),
            },
            "fields": fields_output,
            "errors": [],
            "validation_status": validation_status,
            "validation_log": validation_log,
            "validation_warnings": warnings,
            "attempt_count": attempt_count,
        }
