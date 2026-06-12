from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from .claude_code_runner_types import ClaudeCodeParseError


class ClaudeCodeRunnerCommandMixin:
    def _build_command(
        self,
        prompt: str,
        *,
        workspace: Path,
        job_meta: dict[str, Any],
        mcp_config_path: Path | None = None,
    ) -> list[str]:
        command = [
            self.claude_bin,
            "-p",
            prompt,
            "--output-format",
            "json",
            "--max-turns",
            str(self.max_turns),
            "--permission-mode",
            "dontAsk",
            "--json-schema",
            self._json_dumps(self._result_json_schema()),
        ]
        if self.use_bare:
            command.extend(["--bare", "--add-dir", str(workspace)])
        if self.no_session_persistence:
            command.append("--no-session-persistence")
        session_id = self._session_id(job_meta)
        if session_id:
            command.extend(["--session-id", session_id])
        session_name = self._session_name(job_meta)
        if session_name:
            command.extend(["--name", session_name])
        if mcp_config_path is not None:
            command.extend(["--mcp-config", str(mcp_config_path), "--strict-mcp-config"])
        allowed_tools = self._effective_allowed_tools(mcp_config_path=mcp_config_path)
        if allowed_tools:
            command.extend(["--allowedTools", allowed_tools])
        if self.disallowed_tools:
            command.extend(["--disallowedTools", self.disallowed_tools])
        return command

    def _session_id(self, job_meta: dict[str, Any]) -> str:
        raw = job_meta.get("run_id") or job_meta.get("job_id")
        if raw:
            try:
                return str(uuid.UUID(str(raw)))
            except (TypeError, ValueError, AttributeError):
                pass
        seed = self._json_dumps(
            {
                "job_id": job_meta.get("job_id"),
                "run_id": job_meta.get("run_id"),
                "document_id": job_meta.get("document_id"),
                "target_form_key": job_meta.get("target_form_key"),
            }
        )
        return str(uuid.uuid5(uuid.NAMESPACE_URL, f"eacy-claude-code:{seed}"))

    def _session_name(self, job_meta: dict[str, Any]) -> str:
        pieces = [
            self.session_name_prefix,
            str(job_meta.get("job_type") or "extract"),
            str(job_meta.get("document_id") or job_meta.get("job_id") or "job")[:18],
        ]
        return "-".join(piece.strip("-_ ") for piece in pieces if piece)

    def _effective_allowed_tools(self, *, mcp_config_path: Path | None) -> str:
        parts = self._split_tool_list(self.allowed_tools)
        if mcp_config_path is not None:
            parts.extend(
                [
                    f"mcp__{self.mcp_server_name}__get_field_spec",
                    f"mcp__{self.mcp_server_name}__search_ocr",
                    f"mcp__{self.mcp_server_name}__validate_candidate_fields",
                    f"mcp__{self.mcp_server_name}__save_result_json",
                ]
            )
        deduped: list[str] = []
        for item in parts:
            if item and item not in deduped:
                deduped.append(item)
        return ",".join(deduped)

    def _split_tool_list(self, value: str | None) -> list[str]:
        if not value:
            return []
        return [item.strip() for chunk in str(value).split(",") for item in chunk.split() if item.strip()]

    def _run_command(self, command: list[str], *, workspace: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            command,
            cwd=str(workspace),
            capture_output=True,
            text=True,
            timeout=self.timeout_seconds,
            check=False,
        )

    def _parse_result(self, *, workspace: Path, stdout: str) -> tuple[dict[str, Any], dict[str, Any] | None, str]:
        result_path = workspace / "output" / "result.json"
        wrapper_json: dict[str, Any] | None = None
        if result_path.exists():
            parsed_file = self._load_json_object(result_path.read_text(encoding="utf-8"), label="output/result.json")
            try:
                wrapper_json = self._load_json_object(stdout, label="stdout") if stdout else None
            except ClaudeCodeParseError:
                wrapper_json = None
            return parsed_file, wrapper_json, "result_file"

        wrapper_json = self._load_json_object(stdout, label="stdout")
        structured_output = wrapper_json.get("structured_output")
        if isinstance(structured_output, dict):
            return structured_output, wrapper_json, "stdout_structured_output"
        result = wrapper_json.get("result")
        if isinstance(result, dict):
            return result, wrapper_json, "stdout_result_object"
        if isinstance(result, str):
            return self._load_json_object(result, label="stdout.result"), wrapper_json, "stdout_result_string"
        raise ClaudeCodeParseError("Claude Code stdout JSON did not contain an object or JSON string in result")

    def _load_json_object(self, content: str, *, label: str) -> dict[str, Any]:
        cleaned = str(content or "").strip()
        if not cleaned:
            raise ClaudeCodeParseError(f"{label} was empty")
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            raise ClaudeCodeParseError(f"{label} was not valid JSON: {exc}") from exc
        if not isinstance(parsed, dict):
            raise ClaudeCodeParseError(f"{label} must be a JSON object")
        return parsed
