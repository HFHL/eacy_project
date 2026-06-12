from __future__ import annotations

import asyncio
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any

from app.services.agent import ClaudeCodeEhrExtractor
from app.services.llm_ehr_extractor import LlmEhrExtractor

from .assets import persist_page_assets
from .cache import read_json
from .case_runner_documents import document_field_limit, lab_job
from .case_runner_fields import enrich_fields_with_locations, remap_fields
from .case_runner_io import write_json
from .schema_routing import (
    filter_fields_by_query,
    filter_fields_for_plan,
    metadata_document,
    plan_document_forms,
    rank_and_limit_fields,
    target_form_keys,
)


async def extract_one_document(
    *,
    run_id: str,
    doc_dir: Path,
    entry: dict[str, Any],
    schema_json: dict[str, Any],
    all_fields: list[Any],
    field_query: str | None,
    field_limit: int | None,
    metadata: dict[str, Any] | None,
    page_offset: int,
) -> dict[str, Any]:
    doc_dir.mkdir(parents=True, exist_ok=True)
    payload = read_json(Path(str(entry.get("normalized_json"))))
    write_json(doc_dir / "input" / "ocr_payload.json", payload)
    (doc_dir / "input" / "ocr.md").write_text(payload.get("markdown") or "", encoding="utf-8")
    page_assets = await persist_page_assets(payload, doc_dir, page_offset=page_offset, entry=entry)
    document_id = f"{run_id}-doc-{int(entry.get('index') or 0):03d}"
    document = metadata_document(document_id=document_id, entry=entry, payload=payload, metadata=metadata)
    plan_items = plan_document_forms(document=document, schema_json=schema_json)
    planned_fields = filter_fields_for_plan(all_fields, plan_items)
    matched_fields = filter_fields_by_query(planned_fields, field_query)
    effective_limit = field_limit if field_limit is not None else document_field_limit()
    selected_fields = rank_and_limit_fields(matched_fields, payload.get("markdown") or "", effective_limit)
    form_keys = target_form_keys(plan_items)
    write_json(doc_dir / "input" / "document_metadata.json", metadata or {})
    write_json(doc_dir / "input" / "schema_plan.json", plan_items)
    write_json(doc_dir / "input" / "selected_fields.json", [asdict(field) for field in selected_fields])
    write_json(doc_dir / "input" / "field_specs.json", [LlmEhrExtractor()._field_spec(field) for field in selected_fields])
    if not selected_fields:
        if not plan_items:
            skip_reason = "no primary source matched"
        elif not planned_fields:
            skip_reason = "no schema fields matched document plan"
        else:
            skip_reason = "no fields matched query or limit"
        output = {
            "status": "skipped",
            "entry": entry,
            "document_id": document_id,
            "doc_type": document.doc_type,
            "doc_subtype": document.doc_subtype,
            "doc_title": document.doc_title,
            "planned_forms": plan_items,
            "skip_reason": skip_reason,
            "fields": [],
            "pages": page_assets,
            "page_count": len(payload.get("pages") or []) or 1,
            "selected_field_count": 0,
            "llm_calls": [],
            "validation_log": [{"attempt": 0, "status": "skipped", "warnings": [skip_reason]}],
            "raw_output": {"fields": []},
        }
        write_json(doc_dir / "output" / "result.json", output)
        return output
    llm_calls: list[dict[str, Any]] = []
    try:
        result = await asyncio.to_thread(
            ClaudeCodeEhrExtractor().extract,
            text=payload.get("markdown") or "",
            fields=selected_fields,
            schema_json=schema_json,
            document_id=document_id,
            document=document,
            job=lab_job(run_id, document_id, entry, form_keys=form_keys),
            llm_call_buffer=llm_calls,
            llm_call_context={"run_id": run_id, "document_id": document_id, "purpose": "lab_document_extract"},
        )
        fields = remap_fields(
            enrich_fields_with_locations(result.get("fields") or [], document),
            page_offset=page_offset,
            entry=entry,
            document_id=document_id,
        )
        output = {
            "status": "completed",
            "document_id": document_id,
            "entry": entry,
            "doc_type": document.doc_type,
            "doc_subtype": document.doc_subtype,
            "doc_title": document.doc_title,
            "planned_forms": plan_items,
            "fields": fields,
            "pages": page_assets,
            "page_count": len(payload.get("pages") or []) or 1,
            "selected_field_count": len(selected_fields),
            "llm_calls": llm_calls,
            "validation_log": result.get("validation_log") or [],
            "raw_output": result.get("raw_output") or {},
        }
        write_json(doc_dir / "logs" / "llm_calls.json", llm_calls)
        write_json(doc_dir / "output" / "fields.json", fields)
        write_json(doc_dir / "output" / "raw_output.json", result.get("raw_output") or {})
        write_json(doc_dir / "output" / "result.json", output)
        return output
    except Exception as exc:
        error = {"type": exc.__class__.__name__, "message": str(exc), "at": datetime.utcnow().isoformat()}
        write_json(doc_dir / "logs" / "llm_calls.json", llm_calls)
        write_json(doc_dir / "errors" / "error.json", error)
        return {
            "status": "failed",
            "entry": entry,
            "fields": [],
            "pages": page_assets,
            "page_count": len(payload.get("pages") or []) or 1,
            "selected_field_count": len(selected_fields),
            "llm_calls": llm_calls,
            "error": error,
            "doc_type": document.doc_type,
            "doc_subtype": document.doc_subtype,
            "doc_title": document.doc_title,
            "planned_forms": plan_items,
        }
