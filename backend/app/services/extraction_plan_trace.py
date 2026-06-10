"""Helpers for persisting and reading extraction batch plan snapshots."""

from __future__ import annotations

from typing import Any

from app.models import Document, ExtractionJob
from app.services.extraction_planner import ExtractionPlanItem, ExtractionPlanner


def document_trace_terms(document: Document) -> list[str]:
    raw_metadata = getattr(document, "metadata_json", None)
    metadata = raw_metadata if isinstance(raw_metadata, dict) else {}
    values = [
        getattr(document, "doc_type", None),
        getattr(document, "doc_subtype", None),
        getattr(document, "document_type", None),
        getattr(document, "document_sub_type", None),
        getattr(document, "doc_title", None),
        getattr(document, "original_filename", None),
        metadata.get("文档类型"),
        metadata.get("文档子类型"),
        metadata.get("document_type"),
        metadata.get("document_subtype"),
        metadata.get("doc_type"),
        metadata.get("doc_subtype"),
        metadata.get("title"),
    ]
    return [str(value).strip() for value in values if value not in (None, "")]


def document_trace_summary(document: Document) -> dict[str, Any]:
    raw_metadata = getattr(document, "metadata_json", None)
    return {
        "document_id": getattr(document, "id", None),
        "file_name": getattr(document, "file_name", None) or getattr(document, "original_filename", None),
        "original_filename": getattr(document, "original_filename", None),
        "doc_type": getattr(document, "doc_type", None) or getattr(document, "document_type", None),
        "doc_subtype": getattr(document, "doc_subtype", None) or getattr(document, "document_sub_type", None),
        "doc_title": getattr(document, "doc_title", None),
        "metadata_json": raw_metadata if isinstance(raw_metadata, dict) else None,
        "ocr_status": getattr(document, "ocr_status", None),
        "doc_terms": document_trace_terms(document),
    }


def plan_item_payload(item: ExtractionPlanItem, *, job_id: str | None = None) -> dict[str, Any]:
    return {
        "target_form_key": item.target_form_key,
        "form_title": item.form_title,
        "match_role": item.match_role,
        "reason": item.reason,
        "job_id": job_id,
        "status": "planned" if job_id else "candidate",
    }


def _as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if item is not None]
    return [str(value)]


def _job_targets_full_schema(job: ExtractionJob) -> bool:
    input_json = job.input_json if isinstance(job.input_json, dict) else {}
    if getattr(job, "target_form_key", None):
        return False
    target_filters = (
        _as_list(input_json.get("form_keys"))
        + _as_list(input_json.get("field_paths"))
        + _as_list(input_json.get("field_keys"))
        + _as_list(input_json.get("group_keys"))
    )
    return not any(target_filters)


def _full_schema_plan_payload(job: ExtractionJob) -> dict[str, Any]:
    input_json = job.input_json if isinstance(job.input_json, dict) else {}
    return {
        "target_form_key": None,
        "form_title": "全部表单",
        "match_role": input_json.get("match_role") or "full_schema",
        "reason": input_json.get("planned_reason") or "document scheduled for full schema extraction",
        "job_id": job.id,
        "status": "planned",
    }


def build_folder_plan_json(
    *,
    options: dict[str, Any],
    schema_version_id: str | None,
    source_tag: str,
    documents_total: int,
    eligible_documents: list[Document],
    pending_documents: list[Document],
    already_extracted_document_ids: set[str],
    jobs: list[ExtractionJob],
    skipped: list[dict[str, str]],
    schema_json: dict[str, Any],
    planner: ExtractionPlanner | None = None,
    extra_stats: dict[str, Any] | None = None,
) -> dict[str, Any]:
    planner = planner or ExtractionPlanner()
    job_id_by_doc_form: dict[tuple[str, str], str] = {}
    full_schema_job_by_doc: dict[str, ExtractionJob] = {}
    for job in jobs:
        if not job.document_id:
            continue
        doc_id = str(job.document_id)
        if _job_targets_full_schema(job):
            full_schema_job_by_doc[doc_id] = job
            continue
        input_json = job.input_json if isinstance(job.input_json, dict) else {}
        form_keys = {str(key) for key in (input_json.get("form_keys") or []) if key}
        if job.target_form_key:
            form_keys.add(str(job.target_form_key))
        for form_key in form_keys:
            job_id_by_doc_form[(doc_id, form_key)] = job.id

    skipped_by_document: dict[str, str] = {}
    for entry in skipped:
        document_id = entry.get("document_id")
        if document_id:
            skipped_by_document[str(document_id)] = entry.get("reason") or "skipped"

    eligible_ids = {str(document.id) for document in eligible_documents}
    pending_ids = {str(document.id) for document in pending_documents}
    plan_documents: list[dict[str, Any]] = []

    for document in eligible_documents:
        doc_id = str(document.id)
        summary = document_trace_summary(document)
        if doc_id in skipped_by_document:
            summary["status"] = "skipped"
            summary["skip_reason"] = skipped_by_document[doc_id]
            summary["forms"] = []
            plan_documents.append(summary)
            continue
        if doc_id not in pending_ids and doc_id in already_extracted_document_ids:
            summary["status"] = "already_extracted"
            summary["forms"] = []
            plan_documents.append(summary)
            continue
        if doc_id not in pending_ids:
            summary["status"] = "not_planned"
            summary["forms"] = []
            plan_documents.append(summary)
            continue
        full_schema_job = full_schema_job_by_doc.get(doc_id)
        if full_schema_job is not None:
            summary["status"] = "planned"
            summary["forms"] = [_full_schema_plan_payload(full_schema_job)]
            plan_documents.append(summary)
            continue

        all_plan_items = planner.plan(
            document=document,
            schema_json=schema_json,
            input_json={"source": source_tag},
            source_roles={"primary"},
        )
        forms: list[dict[str, Any]] = []
        for item in all_plan_items:
            job_id = job_id_by_doc_form.get((doc_id, item.target_form_key))
            forms.append(plan_item_payload(item, job_id=job_id))
        summary["status"] = "planned" if forms else "skipped"
        if not forms:
            summary["skip_reason"] = skipped_by_document.get(doc_id) or "no primary source matched"
        summary["forms"] = forms
        plan_documents.append(summary)

    stats = {
        "documents_total": documents_total,
        "eligible_documents": len(eligible_documents),
        "pending_documents": len(pending_documents),
        "planned_jobs": len(jobs),
        "skipped_documents": len(skipped_by_document),
        "already_extracted_documents": len(already_extracted_document_ids & eligible_ids),
    }
    if extra_stats:
        stats.update(extra_stats)

    return {
        "options": options,
        "schema_version_id": schema_version_id,
        "source_tag": source_tag,
        "stats": stats,
        "documents": plan_documents,
        "skipped": skipped,
    }


def build_single_job_plan_json(*, job: ExtractionJob, document: Document | None) -> dict[str, Any]:
    input_json = job.input_json if isinstance(job.input_json, dict) else {}
    doc_summary = document_trace_summary(document) if document is not None else {"document_id": job.document_id}
    doc_summary["status"] = "planned"
    doc_summary["forms"] = [
        {
            "target_form_key": form_key,
            "form_title": form_key,
            "match_role": input_json.get("match_role"),
            "reason": input_json.get("planned_reason") or "single job",
            "job_id": job.id,
            "status": "planned",
        }
        for form_key in (input_json.get("form_keys") or [job.target_form_key])
        if form_key
    ]
    return {
        "options": {"mode": "single"},
        "schema_version_id": job.schema_version_id,
        "source_tag": input_json.get("source") or "single_job",
        "stats": {"planned_jobs": 1, "documents_total": 1 if document else 0},
        "documents": [doc_summary],
        "skipped": [],
    }
