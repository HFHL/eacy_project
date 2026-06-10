from __future__ import annotations

from typing import Any

from core.config import config


SCHEMA_EXTRACTION_JOB_TYPES = {"patient_ehr", "project_crf", "targeted_schema"}
CLAUDE_CODE_STRATEGY = "claude_code"
CLAUDE_CODE_QUEUE = "claude-code"
DEFAULT_EXTRACTION_QUEUE = "extraction"


def normalize_extraction_strategy(value: Any) -> str:
    return str(value or "").strip().lower().replace("-", "_")


def configured_extraction_strategy() -> str:
    return normalize_extraction_strategy(config.EACY_EXTRACTION_STRATEGY)


def effective_extraction_strategy(*, job_type: str | None, input_json: Any = None) -> str:
    payload = input_json if isinstance(input_json, dict) else {}
    explicit = normalize_extraction_strategy(payload.get("extractor_strategy"))
    if explicit:
        return explicit
    if job_type in SCHEMA_EXTRACTION_JOB_TYPES:
        return configured_extraction_strategy()
    return ""


def job_uses_claude_code(*, job_type: str | None, input_json: Any = None) -> bool:
    return job_type in SCHEMA_EXTRACTION_JOB_TYPES and effective_extraction_strategy(
        job_type=job_type,
        input_json=input_json,
    ) == CLAUDE_CODE_STRATEGY


def with_default_extraction_strategy(*, job_type: str | None, input_json: Any = None) -> dict[str, Any] | None:
    if input_json is None:
        payload: dict[str, Any] | None = None
    elif isinstance(input_json, dict):
        payload = dict(input_json)
    else:
        return input_json

    if job_type in SCHEMA_EXTRACTION_JOB_TYPES and configured_extraction_strategy() == CLAUDE_CODE_STRATEGY:
        payload = payload or {}
        payload.setdefault("extractor_strategy", CLAUDE_CODE_STRATEGY)
    return payload


def extraction_queue_for_job(job: Any) -> str:
    if job_uses_claude_code(
        job_type=getattr(job, "job_type", None),
        input_json=getattr(job, "input_json", None),
    ):
        return CLAUDE_CODE_QUEUE
    return DEFAULT_EXTRACTION_QUEUE
