from __future__ import annotations

import shutil
import subprocess
import time
from pathlib import Path

from core.config import config

from .claude_code_runner_command import ClaudeCodeRunnerCommandMixin
from .claude_code_runner_prompt import ClaudeCodeRunnerPromptMixin
from .claude_code_runner_types import (
    ClaudeCodeError,
    ClaudeCodeExitError,
    ClaudeCodeParseError,
    ClaudeCodeRunResult,
    ClaudeCodeTimeoutError,
    ClaudeCodeValidationError,
)
from .claude_code_runner_workspace import ClaudeCodeRunnerWorkspaceMixin


class ClaudeCodeRunner(
    ClaudeCodeRunnerWorkspaceMixin,
    ClaudeCodeRunnerCommandMixin,
    ClaudeCodeRunnerPromptMixin,
):
    def __init__(
        self,
        *,
        claude_bin: str | None = None,
        workspace_root: str | Path | None = None,
        skills_root: str | Path | None = None,
        timeout_seconds: float | None = None,
        max_turns: int | None = None,
        keep_workspace: bool | None = None,
        allowed_tools: str | None = None,
        disallowed_tools: str | None = None,
        enable_mcp_tools: bool | None = None,
    ):
        self.claude_bin = claude_bin or config.CLAUDE_CODE_BIN
        self.workspace_root = Path(workspace_root or config.CLAUDE_CODE_WORKSPACE_ROOT)
        self.skills_root = Path(skills_root) if skills_root is not None else self._default_skills_root()
        self.timeout_seconds = float(timeout_seconds if timeout_seconds is not None else config.CLAUDE_CODE_TIMEOUT_SECONDS)
        self.max_turns = int(max_turns if max_turns is not None else config.CLAUDE_CODE_MAX_TURNS)
        self.keep_workspace = bool(config.CLAUDE_CODE_KEEP_WORKSPACE if keep_workspace is None else keep_workspace)
        self.allowed_tools = allowed_tools if allowed_tools is not None else config.CLAUDE_CODE_ALLOWED_TOOLS
        self.disallowed_tools = disallowed_tools if disallowed_tools is not None else config.CLAUDE_CODE_DISALLOWED_TOOLS
        self.enable_mcp_tools = bool(config.CLAUDE_CODE_ENABLE_MCP_TOOLS if enable_mcp_tools is None else enable_mcp_tools)
        self.mcp_server_name = config.CLAUDE_CODE_MCP_SERVER_NAME
        self.use_bare = bool(config.CLAUDE_CODE_BARE)
        self.no_session_persistence = bool(config.CLAUDE_CODE_NO_SESSION_PERSISTENCE)
        self.session_name_prefix = str(config.CLAUDE_CODE_SESSION_NAME_PREFIX or "eacy-extract")

    def run_extraction(
        self,
        *,
        ocr_text: str,
        ocr_payload: dict[str, Any] | None,
        reading_units: list[dict[str, Any]],
        schema_json: dict[str, Any],
        field_specs: list[dict[str, Any]],
        document_meta: dict[str, Any],
        job_meta: dict[str, Any],
        repair_errors: list[str] | None = None,
    ) -> ClaudeCodeRunResult:
        workspace = self.create_workspace(job_meta=job_meta)
        prompt = ""
        started = time.monotonic()
        try:
            input_hashes = self._write_workspace_inputs(
                workspace=workspace,
                ocr_text=ocr_text,
                ocr_payload=ocr_payload,
                reading_units=reading_units,
                schema_json=schema_json,
                field_specs=field_specs,
                document_meta=document_meta,
                job_meta=job_meta,
            )
            self._copy_skills(workspace)
            mcp_config_path = self._write_mcp_config(workspace) if self.enable_mcp_tools else None
            prompt = self._build_task_prompt(
                job_meta=job_meta,
                document_meta=document_meta,
                repair_errors=repair_errors,
            )
            (workspace / "task.md").write_text(prompt, encoding="utf-8")
            command = self._build_command(prompt, workspace=workspace, job_meta=job_meta, mcp_config_path=mcp_config_path)
            completed = self._run_command(command, workspace=workspace)
            duration_ms = int((time.monotonic() - started) * 1000)
            if completed.returncode != 0:
                details = (completed.stderr or completed.stdout or "").strip()
                raise ClaudeCodeExitError(
                    f"Claude Code exited with code {completed.returncode}: {details[:1000]}"
                )
            parsed_result, wrapper_json, source = self._parse_result(
                workspace=workspace,
                stdout=completed.stdout,
            )
            return ClaudeCodeRunResult(
                parsed_result=parsed_result,
                wrapper_json=wrapper_json,
                stdout=completed.stdout,
                stderr=completed.stderr,
                exit_code=completed.returncode,
                duration_ms=duration_ms,
                workspace_path=str(workspace),
                result_source=source,
                prompt=prompt,
                command=command,
                input_hashes=input_hashes,
            )
        except subprocess.TimeoutExpired as exc:
            raise ClaudeCodeTimeoutError(f"Claude Code timed out after {self.timeout_seconds} seconds") from exc
        finally:
            if not self.keep_workspace:
                shutil.rmtree(workspace, ignore_errors=True)
