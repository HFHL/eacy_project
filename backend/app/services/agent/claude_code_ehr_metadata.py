from __future__ import annotations

from datetime import datetime
from typing import Any

from app.models import Document
from app.services.agent.claude_code_runner import ClaudeCodeRunResult


class ClaudeCodeEhrMetadataMixin:
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
