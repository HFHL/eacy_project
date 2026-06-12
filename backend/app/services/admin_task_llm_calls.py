from __future__ import annotations

from typing import Any

from sqlalchemy import select

from app.models import LLMCallLog
from core.db import session


class AdminTaskLlmCallMixin:
    async def _llm_calls_for_jobs(
        self,
        job_ids: list[str],
        *,
        jobs_payload: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if not job_ids:
            return []
        result = await session.execute(
            select(LLMCallLog)
            .where(LLMCallLog.job_id.in_(job_ids))
            .order_by(LLMCallLog.started_at, LLMCallLog.id)
        )
        logs = list(result.scalars().all())
        if not logs:
            return []

        job_index: dict[str, dict[str, Any]] = {}
        for job in jobs_payload:
            key = job.get("extraction_job_id")
            if key:
                job_index[str(key)] = job

        calls: list[dict[str, Any]] = []
        for log in logs:
            job_info = job_index.get(str(log.job_id)) if log.job_id else None
            task_name = (job_info or {}).get("document_name") or log.job_id or log.call_id
            task_path = list(
                filter(
                    None,
                    [
                        (job_info or {}).get("project_name"),
                        (job_info or {}).get("patient_name"),
                        (job_info or {}).get("schema_name"),
                        (job_info or {}).get("document_name"),
                    ],
                )
            )
            calls.append(
                {
                    "call_id": log.call_id,
                    "task_name": task_name,
                    "task_path": task_path,
                    "document_id": log.document_id,
                    "status": log.status,
                    "error": log.error_message,
                    "error_type": log.error_type,
                    "model_name": log.model_name,
                    "prompt_version": log.prompt_version,
                    "purpose": log.purpose,
                    "node_name": log.node_name,
                    "retry_no": log.retry_no,
                    "http_status": log.http_status,
                    "prompt_tokens": log.prompt_tokens,
                    "completion_tokens": log.completion_tokens,
                    "total_tokens": log.total_tokens,
                    "elapsed_ms": log.elapsed_ms,
                    "started_at": log.started_at,
                    "finished_at": log.finished_at,
                    "instruction": log.system_prompt,
                    "user_message": log.user_prompt,
                    "extracted_raw": log.raw_response,
                    "parsed": log.parsed_response,
                    "validation_log": ((job_info or {}).get("extraction_run") or {}).get("validation_log"),
                }
            )
        return calls
