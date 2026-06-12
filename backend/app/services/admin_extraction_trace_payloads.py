from __future__ import annotations

from typing import Any

from app.models import AsyncTaskBatch, AsyncTaskItem, Document, LLMCallLog


def single_job_summary(
    job_payload: dict[str, Any] | None,
    items: list[AsyncTaskItem],
) -> dict[str, Any]:
    if job_payload is None:
        return {}
    item = items[0] if items else None
    return {
        "id": item.batch_id if item and item.batch_id else job_payload.get("extraction_job_id"),
        "source_table": "extraction_jobs",
        "task_type": "targeted",
        "status": job_payload.get("status"),
        "progress": job_payload.get("progress", 0),
        "patient_name": job_payload.get("patient_name"),
        "schema_name": job_payload.get("schema_name"),
        "target_section": job_payload.get("extraction_run", {}).get("target_path"),
        "completed_count": 1 if job_payload.get("status") in {"succeeded", "completed"} else 0,
        "failed_count": 1 if job_payload.get("status") == "failed" else 0,
        "running_count": 1 if job_payload.get("status") == "running" else 0,
        "pending_count": 0,
        "started_at": job_payload.get("started_at"),
        "finished_at": job_payload.get("completed_at"),
        "error_message": job_payload.get("last_error"),
    }


def trace_plan(batch: AsyncTaskBatch | None, jobs: list[dict[str, Any]]) -> dict[str, Any] | None:
    if batch is not None and isinstance(batch.plan_json, dict):
        return {"plan_json": batch.plan_json, "stats": batch.plan_json.get("stats")}
    if not jobs:
        return None
    return {
        "plan_json": {
            "stats": {"planned_jobs": len(jobs)},
            "documents": [],
        },
        "stats": {"planned_jobs": len(jobs)},
        "synthetic": True,
    }


def document_payload(document: Document | None, doc_id: str) -> dict[str, Any]:
    if document is None:
        return {"document_id": doc_id, "file_name": None, "doc_type": None, "metadata_json": None}
    return {
        "document_id": document.id,
        "file_name": document.file_name or document.original_filename,
        "original_filename": document.original_filename,
        "doc_type": document.doc_type or document.document_type,
        "doc_subtype": document.doc_subtype or document.document_sub_type,
        "doc_title": document.doc_title,
        "metadata_json": document.metadata_json if isinstance(document.metadata_json, dict) else None,
        "ocr_status": document.ocr_status,
    }


def match_payload(job_payload: dict[str, Any]) -> dict[str, Any]:
    raw_input = job_payload.get("input_json")
    input_json = raw_input if isinstance(raw_input, dict) else {}
    run = job_payload.get("extraction_run") or {}
    return {
        "target_form_key": run.get("target_path") or job_payload.get("target_form_key"),
        "planned_reason": input_json.get("planned_reason"),
        "match_role": input_json.get("match_role"),
        "form_keys": input_json.get("form_keys"),
        "source": input_json.get("source"),
    }


def llm_call_payload(
    log: LLMCallLog,
    *,
    include_prompts: bool,
    jobs_payload: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    job_info = None
    if jobs_payload and log.job_id:
        for job in jobs_payload:
            if str(job.get("extraction_job_id")) == str(log.job_id):
                job_info = job
                break
    payload = {
        "call_id": log.call_id,
        "job_id": log.job_id,
        "run_id": log.run_id,
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
        "parsed": log.parsed_response,
        "validation_log": ((job_info or {}).get("extraction_run") or {}).get("validation_log"),
    }
    if include_prompts:
        payload["instruction"] = log.system_prompt
        payload["user_message"] = log.user_prompt
        payload["extracted_raw"] = log.raw_response
    else:
        payload["instruction_preview"] = (log.system_prompt or "")[:500] or None
        payload["user_message_preview"] = (log.user_prompt or "")[:500] or None
        payload["extracted_raw_size"] = len(log.raw_response or "")
    return payload
