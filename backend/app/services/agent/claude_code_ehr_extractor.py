from __future__ import annotations

from typing import Any

from app.models import Document
from app.services.agent.claude_code_ehr_async import ClaudeCodeEhrAsyncMixin
from app.services.agent.claude_code_ehr_helpers import ClaudeCodeEhrHelperMixin
from app.services.agent.claude_code_ehr_metadata import ClaudeCodeEhrMetadataMixin
from app.services.agent.claude_code_runner import (
    ClaudeCodeRunner,
    ClaudeCodeValidationError,
)
from app.services.evidence_location_resolver import build_ocr_reading_units, flatten_reading_unit_corpus
from app.services.llm_ehr_extractor import LlmEhrExtractor
from app.services.schema_field_planner import SchemaField


class ClaudeCodeEhrExtractor(ClaudeCodeEhrAsyncMixin, ClaudeCodeEhrHelperMixin, ClaudeCodeEhrMetadataMixin):
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

        discarded_fields: list[dict[str, Any]] = []
        sanitized_raw_output = first.parsed_result
        repair_field_specs = self._repair_field_specs(first.parsed_result, errors, field_specs)
        if errors and repair_field_specs:
            sanitized_raw_output, discarded_fields = self._sanitize_raw_output(first.parsed_result, errors)
            warnings.extend(errors)
            second = self.runner.run_extraction(
                ocr_text=text_corpus,
                ocr_payload=self._ocr_payload(document),
                reading_units=reading_units,
                schema_json=schema_json,
                field_specs=repair_field_specs,
                document_meta=document_meta,
                job_meta={
                    **job_meta,
                    "repair_attempt": 1,
                    "repair_field_paths": [spec.get("field_path") for spec in repair_field_specs],
                },
                repair_errors=errors,
            )
            self._append_call_log(second, llm_call_buffer=llm_call_buffer, llm_call_context=llm_call_context, retry_no=1)
            final_result = second
            attempt_count = 2
            repair_errors, repair_warnings, repair_status = self._validate_raw_result(
                second.parsed_result,
                field_specs=repair_field_specs,
                text=text_corpus,
                reading_units=reading_units,
            )
            warnings.extend(repair_warnings)
            validation_log.append(
                self._validation_log_entry(2, errors=repair_errors, warnings=repair_warnings, status=repair_status)
            )
            repair_raw_output = second.parsed_result
            if repair_errors:
                if not self._has_fatal_validation_errors(repair_errors):
                    repair_raw_output, repair_discarded = self._sanitize_raw_output(second.parsed_result, repair_errors)
                    discarded_fields.extend(repair_discarded)
                    warnings.extend(repair_errors)
                    repair_errors = []
                else:
                    warnings.extend(repair_errors)
                    repair_raw_output = {}
                    repair_errors = []
            sanitized_raw_output = self._merge_raw_outputs(sanitized_raw_output, repair_raw_output)
            errors = []
            validation_status = self._status_for_sanitized_output(sanitized_raw_output, "valid_with_warnings")
        elif errors and not self._has_fatal_validation_errors(errors):
            sanitized_raw_output, discarded_fields = self._sanitize_raw_output(first.parsed_result, errors)
            warnings.extend(errors)
            errors = []
            validation_status = self._status_for_sanitized_output(sanitized_raw_output, validation_status)

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
            sanitized_raw_output = final_result.parsed_result
            if errors and not self._has_fatal_validation_errors(errors):
                sanitized_raw_output, discarded_fields = self._sanitize_raw_output(final_result.parsed_result, errors)
                warnings.extend(errors)
                errors = []
                validation_status = self._status_for_sanitized_output(sanitized_raw_output, validation_status)

        if errors:
            raise ClaudeCodeValidationError("; ".join(errors))

        normalized = self.normalizer._node_normalize(
            {
                "document_id": document_id,
                "field_specs": field_specs,
                "raw_output": sanitized_raw_output,
                "validation_status": "valid" if validation_status == "valid_with_warnings" else validation_status,
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
                **sanitized_raw_output,
                "_claude_code": self._run_metadata(final_result),
            },
            "fields": fields_output,
            "errors": [],
            "validation_status": validation_status,
            "validation_log": validation_log,
            "validation_warnings": warnings,
            "discarded_fields": discarded_fields,
            "attempt_count": attempt_count,
        }
