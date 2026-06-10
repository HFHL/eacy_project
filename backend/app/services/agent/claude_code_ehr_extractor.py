from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Awaitable, Callable

from app.models import Document
from app.services.agent.claude_code_runner import (
    ClaudeCodeRunResult,
    ClaudeCodeRunner,
    ClaudeCodeValidationError,
)
from app.services.evidence_location_resolver import build_ocr_reading_units, flatten_reading_unit_corpus
from app.services.llm_ehr_extractor import LlmEhrExtractor, VALUE_SLOTS
from app.services.schema_field_planner import SchemaField


class ClaudeCodeEhrExtractor:
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

    async def extract_async(
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
        cancel_check: Callable[[], Awaitable[None]] | None = None,
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

        first = await self.runner.run_extraction_async(
            ocr_text=text_corpus,
            ocr_payload=self._ocr_payload(document),
            reading_units=reading_units,
            schema_json=schema_json,
            field_specs=field_specs,
            document_meta=document_meta,
            job_meta=job_meta,
            cancel_check=cancel_check,
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
            second = await self.runner.run_extraction_async(
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
                cancel_check=cancel_check,
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
            second = await self.runner.run_extraction_async(
                ocr_text=text_corpus,
                ocr_payload=self._ocr_payload(document),
                reading_units=reading_units,
                schema_json=schema_json,
                field_specs=field_specs,
                document_meta=document_meta,
                job_meta={**job_meta, "repair_attempt": 1},
                repair_errors=errors,
                cancel_check=cancel_check,
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

    def _canonicalize_output_field_paths(
        self,
        fields_output: list[dict[str, Any]],
        *,
        field_specs: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        allowed_paths = {str(spec.get("field_path")) for spec in field_specs if spec.get("field_path")}
        specs_by_path = {str(spec.get("field_path")): spec for spec in field_specs if spec.get("field_path")}
        output: list[dict[str, Any]] = []
        for item in fields_output:
            if not isinstance(item, dict):
                continue
            field_path = str(item.get("field_path") or "").strip().strip("/").replace("/", ".")
            canonical_path, indexes = self._canonical_path_for_allowed_field(field_path, allowed_paths)
            if canonical_path == field_path:
                output.append(item)
                continue
            spec = specs_by_path.get(canonical_path)
            if spec is None:
                output.append(item)
                continue
            normalized = dict(item)
            normalized["field_path"] = canonical_path
            normalized["field_key"] = spec.get("field_key") or canonical_path.split(".")[-1]
            normalized["field_title"] = spec.get("field_title")
            normalized["record_form_key"] = spec.get("record_form_key")
            normalized["record_form_title"] = spec.get("record_form_title")
            normalized["merge_binding"] = spec.get("merge_binding")
            if indexes:
                normalized.setdefault("repeat_index", indexes[0])
                normalized.setdefault("path_indexes", indexes)
            output.append(normalized)
        return output

    def _canonical_path_for_allowed_field(self, field_path: str, allowed_paths: set[str]) -> tuple[str, list[int]]:
        if not field_path or field_path in allowed_paths:
            return field_path, []
        parts = [part for part in field_path.split(".") if part]
        indexes = [int(part) for part in parts if part.isdigit()]
        if not indexes:
            return field_path, []
        canonical_path = ".".join(part for part in parts if not part.isdigit())
        if canonical_path in allowed_paths:
            return canonical_path, indexes
        return field_path, []

    def _validate_raw_result(
        self,
        raw_output: Any,
        *,
        field_specs: list[dict[str, Any]],
        text: str,
        reading_units: list[dict[str, Any]],
    ) -> tuple[list[str], list[str], str]:
        errors, warnings, status_hint = self.normalizer._validate_raw_output(
            raw_output,
            field_specs,
            text=text,
            reading_units=reading_units,
            parse_error=None,
            require_source_id=bool(reading_units),
        )
        warnings.extend(self._validate_confidence(raw_output))
        status = "invalid" if errors else (status_hint or "valid")
        return errors, warnings, status

    def _validate_confidence(self, raw_output: Any) -> list[str]:
        errors: list[str] = []
        if not isinstance(raw_output, dict):
            return errors
        fields = raw_output.get("fields")
        if not isinstance(fields, list):
            return errors
        for index, item in enumerate(fields):
            if not isinstance(item, dict):
                continue
            has_value = any(not self.normalizer._is_empty(item.get(slot)) for slot in VALUE_SLOTS.values())
            if has_value and item.get("confidence") is None:
                errors.append(f"fields[{index}].confidence is missing; field kept as low-confidence candidate")
        return errors

    def _has_fatal_validation_errors(self, errors: list[str]) -> bool:
        if not errors:
            return False
        return any(not self._is_discardable_validation_error(error) for error in errors)

    def _is_discardable_validation_error(self, error: str) -> bool:
        return bool(re.match(r"^(fields|records)\[\d+\]", str(error or "")))

    def _sanitize_raw_output(self, raw_output: Any, errors: list[str]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        if not isinstance(raw_output, dict):
            return {}, []
        field_indexes = self._indexes_for_errors(errors, "fields")
        record_indexes = self._indexes_for_errors(errors, "records")
        sanitized = dict(raw_output)
        discarded: list[dict[str, Any]] = []
        raw_fields = raw_output.get("fields")
        if isinstance(raw_fields, list) and field_indexes:
            kept_fields = []
            for index, item in enumerate(raw_fields):
                if index in field_indexes:
                    discarded.append({"kind": "field", "index": index, "item": item, "reasons": self._reasons_for_index(errors, "fields", index)})
                else:
                    kept_fields.append(item)
            sanitized["fields"] = kept_fields
        raw_records = raw_output.get("records")
        if isinstance(raw_records, list) and record_indexes:
            kept_records = []
            for index, item in enumerate(raw_records):
                if index in record_indexes:
                    discarded.append({"kind": "record", "index": index, "item": item, "reasons": self._reasons_for_index(errors, "records", index)})
                else:
                    kept_records.append(item)
            sanitized["records"] = kept_records
        return sanitized, discarded

    def _repair_field_specs(
        self,
        raw_output: Any,
        errors: list[str],
        field_specs: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if not isinstance(raw_output, dict) or not errors:
            return []
        if self._has_fatal_validation_errors(errors):
            return []
        field_indexes = self._indexes_for_errors(errors, "fields")
        record_indexes = self._indexes_for_errors(errors, "records")
        if not field_indexes and not record_indexes:
            return []

        specs_by_path = {str(spec.get("field_path")): spec for spec in field_specs if spec.get("field_path")}
        specs_by_form: dict[str, list[dict[str, Any]]] = {}
        for spec in field_specs:
            form_key = spec.get("record_form_key")
            if form_key:
                specs_by_form.setdefault(str(form_key), []).append(spec)

        selected: list[dict[str, Any]] = []
        seen_paths: set[str] = set()

        raw_fields = raw_output.get("fields")
        if isinstance(raw_fields, list):
            for index in sorted(field_indexes):
                if index >= len(raw_fields) or not isinstance(raw_fields[index], dict):
                    continue
                raw_path = str(raw_fields[index].get("field_path") or "").strip().strip("/").replace("/", ".")
                spec = specs_by_path.get(raw_path) or self.normalizer._spec_for_indexed_path(raw_path, specs_by_path)
                self._append_repair_spec(selected, seen_paths, spec)

        raw_records = raw_output.get("records")
        if isinstance(raw_records, list):
            for index in sorted(record_indexes):
                if index >= len(raw_records) or not isinstance(raw_records[index], dict):
                    continue
                form_path = str(raw_records[index].get("form_path") or "").strip().strip("/").replace("/", ".")
                for spec in specs_by_form.get(form_path, []):
                    self._append_repair_spec(selected, seen_paths, spec)

        return selected

    def _append_repair_spec(
        self,
        selected: list[dict[str, Any]],
        seen_paths: set[str],
        spec: dict[str, Any] | None,
    ) -> None:
        if not spec:
            return
        path = str(spec.get("field_path") or "")
        if not path or path in seen_paths:
            return
        selected.append(spec)
        seen_paths.add(path)

    def _merge_raw_outputs(self, base_output: Any, repair_output: Any) -> dict[str, Any]:
        base = dict(base_output) if isinstance(base_output, dict) else {}
        repair = repair_output if isinstance(repair_output, dict) else {}
        merged = dict(base)
        for key in ("fields", "records", "missing_fields", "uncertain_fields", "conflict_fields"):
            base_values = base.get(key)
            repair_values = repair.get(key)
            if isinstance(base_values, list) or isinstance(repair_values, list):
                merged[key] = [
                    *(base_values if isinstance(base_values, list) else []),
                    *(repair_values if isinstance(repair_values, list) else []),
                ]
        return merged

    def _indexes_for_errors(self, errors: list[str], kind: str) -> set[int]:
        indexes: set[int] = set()
        pattern = re.compile(rf"^{re.escape(kind)}\[(\d+)\]")
        for error in errors:
            match = pattern.match(str(error or ""))
            if match:
                indexes.add(int(match.group(1)))
        return indexes

    def _reasons_for_index(self, errors: list[str], kind: str, index: int) -> list[str]:
        prefix = f"{kind}[{index}]"
        return [error for error in errors if str(error or "").startswith(prefix)]

    def _status_for_sanitized_output(self, raw_output: dict[str, Any], fallback: str | None) -> str:
        fields = raw_output.get("fields")
        records = raw_output.get("records")
        if (isinstance(fields, list) and fields) or (isinstance(records, list) and records):
            return "valid_with_warnings"
        return "valid_empty" if fallback in {"valid_empty", "invalid"} else (fallback or "valid_empty")

    def _append_call_log(
        self,
        result: ClaudeCodeRunResult,
        *,
        llm_call_buffer: list[dict[str, Any]] | None,
        llm_call_context: dict[str, Any] | None,
        retry_no: int,
    ) -> None:
        if llm_call_buffer is None:
            return
        context = dict(llm_call_context or {})
        wrapper = result.wrapper_json or {}
        usage = wrapper.get("usage") if isinstance(wrapper.get("usage"), dict) else {}
        llm_call_buffer.append(
            {
                "job_id": context.get("job_id"),
                "run_id": context.get("run_id"),
                "document_id": context.get("document_id"),
                "project_id": context.get("project_id"),
                "requested_by": context.get("requested_by"),
                "purpose": "extract",
                "node_name": "claude_code_cli",
                "provider": "claude_code_cli",
                "model_name": "ClaudeCodeRunner",
                "prompt_version": context.get("prompt_version"),
                "system_prompt": None,
                "user_prompt": result.prompt,
                "raw_response": self._truncate(result.stdout, 200000),
                "parsed_response": result.parsed_result,
                "prompt_tokens": usage.get("input_tokens"),
                "completion_tokens": usage.get("output_tokens"),
                "total_tokens": self._total_tokens(usage),
                "elapsed_ms": result.duration_ms,
                "http_status": None,
                "status": "success",
                "error_type": None,
                "error_message": self._truncate(result.stderr, 2000) if result.stderr else None,
                "retry_no": retry_no,
                "started_at": datetime.utcnow(),
                "finished_at": datetime.utcnow(),
            }
        )

    def _job_meta(
        self,
        *,
        job: Any,
        document_id: str | None,
        field_count: int,
        llm_call_context: dict[str, Any] | None,
    ) -> dict[str, Any]:
        input_json = getattr(job, "input_json", None)
        context = llm_call_context or {}
        return {
            "job_id": getattr(job, "id", None),
            "job_type": getattr(job, "job_type", None),
            "run_id": context.get("run_id"),
            "document_id": document_id,
            "patient_id": getattr(job, "patient_id", None),
            "project_id": getattr(job, "project_id", None),
            "project_patient_id": getattr(job, "project_patient_id", None),
            "context_id": getattr(job, "context_id", None),
            "schema_version_id": getattr(job, "schema_version_id", None),
            "target_form_key": getattr(job, "target_form_key", None),
            "input_json": input_json if isinstance(input_json, dict) else None,
            "field_count": field_count,
        }

    def _ocr_payload(self, document: Document | None) -> dict[str, Any] | None:
        payload = getattr(document, "ocr_payload_json", None)
        return payload if isinstance(payload, dict) else None

    def _validation_log_entry(
        self,
        attempt: int,
        *,
        errors: list[str],
        warnings: list[str],
        status: str,
    ) -> dict[str, Any]:
        return {
            "attempt": attempt,
            "status": status,
            "errors": errors,
            "warnings": warnings,
            "created_at": datetime.utcnow().isoformat(),
        }

    def _run_metadata(self, result: ClaudeCodeRunResult) -> dict[str, Any]:
        wrapper = result.wrapper_json or {}
        return {
            "workspace_path": result.workspace_path,
            "result_source": result.result_source,
            "exit_code": result.exit_code,
            "duration_ms": result.duration_ms,
            "session_id": wrapper.get("session_id"),
            "total_cost_usd": wrapper.get("total_cost_usd"),
            "input_hashes": result.input_hashes,
            "command": self._redacted_command(result.command),
        }

    def _redacted_command(self, command: list[str]) -> list[str]:
        redacted = []
        skip_next = False
        for item in command:
            if skip_next:
                redacted.append("<prompt>")
                skip_next = False
                continue
            redacted.append(item)
            if item in {"-p", "--print"}:
                skip_next = True
        return redacted

    def _total_tokens(self, usage: dict[str, Any]) -> int | None:
        input_tokens = usage.get("input_tokens")
        output_tokens = usage.get("output_tokens")
        if input_tokens is None and output_tokens is None:
            return None
        try:
            return int(input_tokens or 0) + int(output_tokens or 0)
        except (TypeError, ValueError):
            return None

    def _truncate(self, value: str, limit: int) -> str:
        text = str(value or "")
        if len(text) <= limit:
            return text
        return f"{text[:limit]}...[truncated]"
