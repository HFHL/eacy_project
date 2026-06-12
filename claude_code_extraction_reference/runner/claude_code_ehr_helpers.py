from __future__ import annotations

from datetime import datetime
from typing import Any

from app.models import Document
from app.services.agent.claude_code_runner import ClaudeCodeRunResult
from app.services.llm_ehr_extractor import VALUE_SLOTS


class ClaudeCodeEhrHelperMixin:
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
        quote_warnings = [warning for warning in warnings if "quote_text must be an OCR substring" in warning]
        errors.extend(quote_warnings)
        warnings = [warning for warning in warnings if warning not in quote_warnings]
        errors.extend(self._validate_confidence(raw_output))
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
                errors.append(f"fields[{index}].confidence is required")
        return errors

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
