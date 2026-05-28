"""LLM call logging utilities.

`LLMCallRecorder` is a sync context manager that builds a single record per
outbound LLM HTTP call. Records are appended to a shared buffer that the
async caller flushes to the `llm_call_logs` table via `flush_llm_call_logs`.

Splitting recording (sync, inside the langgraph node / httpx.Client) from
persistence (async, in the service) keeps the existing langgraph
synchronous design while letting us survive partial failures: if the LLM
call raises, the buffer is still populated and can be flushed in the
exception path.
"""

from __future__ import annotations

import uuid
from uuid import UUID
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any

import httpx

from app.models import LLMCallLog
from core.db import session


# error_type taxonomy — keep stable, surfaced to admin UI
ERROR_TIMEOUT = "llm_timeout"
ERROR_HTTP = "llm_http"
ERROR_CONNECTION = "connection_error"
ERROR_PARSE = "parse_error"
ERROR_UNKNOWN = "unknown"


def classify_exception(exc: BaseException) -> str:
    """Map a captured exception to a stable error_type string."""
    if isinstance(exc, httpx.TimeoutException):
        return ERROR_TIMEOUT
    if isinstance(exc, httpx.HTTPStatusError):
        return ERROR_HTTP
    if isinstance(exc, httpx.TransportError):
        return ERROR_CONNECTION
    if isinstance(exc, (ValueError, TypeError)):
        return ERROR_PARSE
    return ERROR_UNKNOWN


class LLMCallRecorder:
    """Capture one LLM call. Use as a sync `with` block.

    Typical flow:
        recorder = LLMCallRecorder(buffer=buf, context={...})
        recorder.set_request(system_prompt=..., user_prompt=..., model_name=...)
        with recorder:
            resp = httpx.post(...)
            recorder.set_response(http_status=resp.status_code, raw_response=resp.text)
        # on exit, recorder appends itself to buffer
    """

    def __init__(self, *, buffer: list[dict[str, Any]] | None, context: dict[str, Any] | None = None):
        self.buffer = buffer
        ctx = dict(context or {})
        self._record: dict[str, Any] = {
            "call_id": ctx.pop("call_id", None) or str(uuid.uuid4()),
            "job_id": ctx.pop("job_id", None),
            "run_id": ctx.pop("run_id", None),
            "document_id": ctx.pop("document_id", None),
            "project_id": ctx.pop("project_id", None),
            "requested_by": ctx.pop("requested_by", None),
            "purpose": ctx.pop("purpose", None),
            "node_name": ctx.pop("node_name", None),
            "provider": ctx.pop("provider", None),
            "model_name": ctx.pop("model_name", None),
            "prompt_version": ctx.pop("prompt_version", None),
            "retry_no": int(ctx.pop("retry_no", 0) or 0),
            "system_prompt": None,
            "user_prompt": None,
            "raw_response": None,
            "parsed_response": None,
            "prompt_tokens": None,
            "completion_tokens": None,
            "total_tokens": None,
            "elapsed_ms": None,
            "http_status": None,
            "status": "success",
            "error_type": None,
            "error_message": None,
            "started_at": datetime.utcnow(),
            "finished_at": None,
        }
        # Any extra context keys we didn't claim go on the record verbatim
        for key, value in ctx.items():
            self._record.setdefault(key, value)
        self._failed = False

    # --- mutators ----------------------------------------------------------

    def set_request(
        self,
        *,
        system_prompt: str | None = None,
        user_prompt: str | None = None,
        model_name: str | None = None,
        prompt_version: str | None = None,
        retry_no: int | None = None,
    ) -> None:
        if system_prompt is not None:
            self._record["system_prompt"] = system_prompt
        if user_prompt is not None:
            self._record["user_prompt"] = user_prompt
        if model_name is not None:
            self._record["model_name"] = model_name
        if prompt_version is not None:
            self._record["prompt_version"] = prompt_version
        if retry_no is not None:
            self._record["retry_no"] = int(retry_no)

    def set_response(
        self,
        *,
        http_status: int | None = None,
        raw_response: str | None = None,
        parsed_response: Any = None,
        usage: dict[str, Any] | None = None,
    ) -> None:
        if http_status is not None:
            self._record["http_status"] = int(http_status)
        if raw_response is not None:
            self._record["raw_response"] = raw_response
        if parsed_response is not None:
            self._record["parsed_response"] = parsed_response
        if usage:
            self._record["prompt_tokens"] = usage.get("prompt_tokens")
            self._record["completion_tokens"] = usage.get("completion_tokens")
            self._record["total_tokens"] = usage.get("total_tokens")

    def set_failure(self, exc: BaseException, *, error_type: str | None = None) -> None:
        self._failed = True
        self._record["status"] = "timeout" if (error_type or classify_exception(exc)) == ERROR_TIMEOUT else "failed"
        self._record["error_type"] = error_type or classify_exception(exc)
        self._record["error_message"] = str(exc) or exc.__class__.__name__

    # --- lifecycle ---------------------------------------------------------

    def __enter__(self) -> "LLMCallRecorder":
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        if exc is not None and not self._failed:
            self.set_failure(exc)
        self._record["finished_at"] = datetime.utcnow()
        started: datetime = self._record["started_at"]
        if isinstance(started, datetime):
            self._record["elapsed_ms"] = int(
                (self._record["finished_at"] - started).total_seconds() * 1000
            )
        if self.buffer is not None:
            self.buffer.append(self._record)
        return False  # never swallow the exception

    @property
    def record(self) -> dict[str, Any]:
        return self._record

    @property
    def call_id(self) -> str:
        return self._record["call_id"]


def _is_valid_uuid(value: Any) -> bool:
    if value is None:
        return True
    try:
        UUID(str(value))
        return True
    except (ValueError, AttributeError, TypeError):
        return False


# `LLMCallRecorder` 允许调用方塞任意 context 键值（如 batch_index/batch_count），用于
# 在调试日志里关联 LLM 调用。但落库时必须严格限制到 `LLMCallLog` 真实声明的列，否则
# `LLMCallLog(**record)` 会抛 TypeError，让整个 worker 任务直接失败、batch/job 卡住。
_LLM_CALL_LOG_COLUMNS: frozenset[str] = frozenset(LLMCallLog.__table__.columns.keys())


async def flush_llm_call_logs(buffer: list[dict[str, Any]] | None, *, commit: bool = False) -> None:
    """Persist accumulated LLM call records. Safe to call with an empty buffer."""
    if not buffer:
        return
    for record in buffer:
        if not all(_is_valid_uuid(record.get(key)) for key in ("job_id", "run_id", "document_id", "project_id", "requested_by")):
            continue
        log_kwargs = {
            key: value
            for key, value in record.items()
            if value is not None and key in _LLM_CALL_LOG_COLUMNS
        }
        log = LLMCallLog(**log_kwargs)
        session.add(log)
    # Drain the buffer so the same records aren't flushed twice if the caller retries
    buffer.clear()
    if commit:
        await session.commit()
