from __future__ import annotations

from dataclasses import dataclass
from typing import Any


class ClaudeCodeError(RuntimeError):
    error_type = "claude_code_error"


class ClaudeCodeTimeoutError(ClaudeCodeError):
    error_type = "llm_timeout"


class ClaudeCodeExitError(ClaudeCodeError):
    error_type = "claude_code_exit_error"


class ClaudeCodeParseError(ClaudeCodeError):
    error_type = "parse_error"


class ClaudeCodeValidationError(ClaudeCodeError):
    error_type = "parse_error"


@dataclass(frozen=True)
class ClaudeCodeRunResult:
    parsed_result: dict[str, Any]
    wrapper_json: dict[str, Any] | None
    stdout: str
    stderr: str
    exit_code: int
    duration_ms: int
    workspace_path: str
    result_source: str
    prompt: str
    command: list[str]
    input_hashes: dict[str, str]
