from __future__ import annotations

import asyncio
import json
import os
import re
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from app.services.agent import ClaudeCodeEhrExtractor
from app.services.evidence_location_resolver import resolve_evidence_locations
from app.services.llm_ehr_extractor import LlmEhrExtractor
from app.services.schema_field_planner import plan_schema_fields

from .assets import persist_page_assets
from .cache import load_batch_entries, read_json
from .metadata_cache import ensure_batch_metadata, load_metadata_index, metadata_for_entry
from .evaluation import evaluate_run
from .schema_routing import (
    filter_fields_by_query,
    filter_fields_for_plan,
    metadata_document,
    plan_document_forms,
    rank_and_limit_fields,
    target_form_keys,
)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")


def append_event(run_dir: Path, stage: str, message: str, data: dict[str, Any] | None = None) -> None:
    event = {"at": datetime.utcnow().isoformat(), "stage": stage, "message": message, "data": data or {}}
    log_path = run_dir / "logs" / "events.jsonl"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, ensure_ascii=False, default=str) + "\n")


def load_run(run_dir: Path) -> dict[str, Any]:
    path = run_dir / "run.json"
    return read_json(path) if path.exists() else {}


def update_run(run_dir: Path, **updates: Any) -> dict[str, Any]:
    payload = {**load_run(run_dir), **updates, "updated_at": datetime.utcnow().isoformat()}
    write_json(run_dir / "run.json", payload)
    return payload


def initial_run_payload(run_id: str, run_dir: Path, *, directory: str, batch_dir: Path, schema_path: Path) -> dict[str, Any]:
    payload = {
        "run_id": run_id,
        "status": "running",
        "stage": "queued",
        "directory": directory,
        "run_dir": str(run_dir),
        "ocr_batch_dir": str(batch_dir),
        "schema_path": str(schema_path),
        "created_at": datetime.utcnow().isoformat(),
        "documents": [],
        "pages": [],
        "fields": [],
        "validation_log": [],
        "logs": {"events": str(run_dir / "logs" / "events.jsonl")},
    }
    write_json(run_dir / "run.json", payload)
    append_event(run_dir, "queued", "病例级抽取父任务已创建")
    return payload


async def run_case_extraction(
    *,
    run_id: str,
    run_dir: Path,
    directory: str,
    batch_dir: Path,
    schema_path: Path,
    field_query: str | None,
    field_limit: int | None,
    document_limit: int | None = None,
) -> None:
    started_at = datetime.utcnow()
    try:
        update_run(run_dir, stage="load_ocr")
        entries = load_batch_entries(batch_dir)
        if document_limit and document_limit > 0:
            entries = entries[:document_limit]
        docs = [document_status(entry, index) for index, entry in enumerate(entries, start=1)]
        write_json(run_dir / "input" / "ocr_entries.json", entries)
        update_run(run_dir, documents=docs, total_documents=len(docs), completed_documents=0)
        append_event(run_dir, "load_ocr", "读取 OCR 批次索引", {"document_count": len(entries)})

        update_run(run_dir, stage="classify_documents")
        metadata_summary = await asyncio.to_thread(ensure_batch_metadata, batch_dir)
        metadata_index = load_metadata_index(batch_dir)
        docs = [
            document_status(entry, index, metadata=metadata_for_entry(entry, metadata_index))
            for index, entry in enumerate(entries, start=1)
        ]
        write_json(run_dir / "input" / "document_metadata_summary.json", metadata_summary)
        update_run(run_dir, documents=docs, metadata_summary=metadata_summary)
        append_event(
            run_dir,
            "classify_documents",
            "完成 OCR 文档类型识别并读取本地缓存",
            {"processed": metadata_summary.get("processed_count"), "strategy": metadata_summary.get("strategy")},
        )

        update_run(run_dir, stage="load_schema")
        schema_json = json.loads(schema_path.read_text(encoding="utf-8"))
        all_fields = plan_schema_fields(schema_json)
        write_json(run_dir / "input" / "schema.json", schema_json)
        write_json(run_dir / "input" / "all_schema_fields.json", [asdict(field) for field in all_fields])

        if not all_fields:
            finish_empty_run(run_dir, entries=entries, total_schema_fields=len(all_fields), batch_dir=batch_dir)
            return

        accumulated_fields: list[dict[str, Any]] = []
        accumulated_pages: list[dict[str, Any]] = []
        all_llm_calls: list[dict[str, Any]] = []
        page_offset = 0
        for index, entry in enumerate(entries, start=1):
            doc_dir = run_dir / "documents" / safe_doc_dir(index, entry)
            docs[index - 1]["status"] = "running"
            update_run(
                run_dir,
                status="running",
                stage="extract_document",
                current_document=docs[index - 1],
                documents=docs,
                fields=accumulated_fields,
                pages=accumulated_pages,
                completed_documents=index - 1,
            )
            append_event(run_dir, "extract_document", "开始抽取单个 OCR 文件", {"index": index, "source": entry.get("source_name")})
            doc_result = await extract_one_document(
                run_id=run_id,
                doc_dir=doc_dir,
                entry=entry,
                schema_json=schema_json,
                all_fields=all_fields,
                field_query=field_query,
                field_limit=field_limit,
                metadata=metadata_for_entry(entry, metadata_index),
                page_offset=page_offset,
            )
            page_offset += doc_result["page_count"]
            accumulated_pages.extend(doc_result["pages"])
            accumulated_fields.extend(doc_result["fields"])
            all_llm_calls.extend(doc_result["llm_calls"])
            docs[index - 1].update(
                {
                    "status": doc_result["status"],
                    "field_count": len(doc_result["fields"]),
                    "page_count": doc_result["page_count"],
                    "run_dir": str(doc_dir),
                    "error": doc_result.get("error"),
                    "doc_type": doc_result.get("doc_type"),
                    "doc_subtype": doc_result.get("doc_subtype"),
                    "doc_title": doc_result.get("doc_title"),
                    "planned_forms": doc_result.get("planned_forms") or [],
                    "selected_field_count": doc_result.get("selected_field_count"),
                    "skip_reason": doc_result.get("skip_reason"),
                    "finished_at": datetime.utcnow().isoformat(),
                }
            )
            if doc_result["status"] == "failed" and abort_on_document_failure():
                response = {
                    **load_run(run_dir),
                    "status": "failed",
                    "stage": "failed",
                    "finished_at": datetime.utcnow().isoformat(),
                    "documents": docs,
                    "pages": accumulated_pages,
                    "fields": accumulated_fields,
                    "completed_documents": index,
                    "field_result_count": len(accumulated_fields),
                    "error": {
                        "type": "document_failed",
                        "message": f"文件抽取失败：{entry.get('source_name')}",
                        "document": docs[index - 1],
                    },
                }
                write_json(run_dir / "run.json", response)
                evaluation = evaluate_run(run_dir)
                write_json(run_dir / "run.json", {**response, "evaluation": evaluation})
                append_event(run_dir, "failed", "单个 OCR 文件失败，父任务已中断", {"index": index, "error": doc_result.get("error")})
                return
            update_run(
                run_dir,
                documents=docs,
                pages=accumulated_pages,
                fields=accumulated_fields,
                completed_documents=index,
                field_result_count=len(accumulated_fields),
            )
            append_event(run_dir, "document_completed", "单个 OCR 文件抽取结束", {"index": index, "fields": len(doc_result["fields"])})

        response = {
            **load_run(run_dir),
            "status": "completed",
            "stage": "completed",
            "finished_at": datetime.utcnow().isoformat(),
            "duration_seconds": round((datetime.utcnow() - started_at).total_seconds(), 3),
            "ocr_source": {"mode": "cached_textin_per_file", "batch_dir": str(batch_dir), "document_count": len(entries)},
            "field_count": len(accumulated_fields),
            "total_schema_fields": len(all_fields),
            "fields": accumulated_fields,
            "pages": accumulated_pages,
            "documents": docs,
        }
        write_json(run_dir / "logs" / "llm_calls.json", all_llm_calls)
        write_json(run_dir / "output" / "fields.json", accumulated_fields)
        write_json(run_dir / "output" / "result.json", response)
        write_json(run_dir / "run.json", response)
        evaluation = evaluate_run(run_dir)
        write_json(run_dir / "run.json", {**response, "evaluation": evaluation})
        append_event(run_dir, "completed", "病例级父任务完成", {"documents": len(entries), "fields": len(accumulated_fields)})
    except Exception as exc:
        error = {"type": exc.__class__.__name__, "message": str(exc), "at": datetime.utcnow().isoformat()}
        write_json(run_dir / "errors" / "error.json", error)
        update_run(run_dir, status="failed", stage="failed", error=error, finished_at=datetime.utcnow().isoformat())
        try:
            update_run(run_dir, evaluation=evaluate_run(run_dir))
        except Exception:
            pass
        append_event(run_dir, "failed", "病例级父任务失败", error)


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


def document_status(entry: dict[str, Any], index: int, *, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "index": index,
        "status": "queued",
        "source_name": entry.get("source_name"),
        "relative_path": entry.get("relative_path"),
        "metadata_status": (metadata or {}).get("status") or "missing",
        "doc_type": (metadata or {}).get("doc_type"),
        "doc_subtype": (metadata or {}).get("doc_subtype"),
        "doc_title": (metadata or {}).get("doc_title"),
    }


def safe_doc_dir(index: int, entry: dict[str, Any]) -> str:
    name = re.sub(r"[^0-9A-Za-z._\-\u4e00-\u9fff]+", "_", str(entry.get("source_name") or "document")).strip("._-")
    return f"{index:03d}_{name or 'document'}"


def finish_empty_run(run_dir: Path, *, entries: list[dict[str, Any]], total_schema_fields: int, batch_dir: Path) -> None:
    response = {
        **load_run(run_dir),
        "status": "completed",
        "stage": "completed",
        "finished_at": datetime.utcnow().isoformat(),
        "ocr_source": {"mode": "cached_textin_per_file", "batch_dir": str(batch_dir), "document_count": len(entries)},
        "fields": [],
        "pages": [],
        "field_count": 0,
        "total_schema_fields": total_schema_fields,
        "validation_status": "valid_empty",
        "validation_log": [{"attempt": 0, "status": "valid_empty", "errors": [], "warnings": ["no selected fields"]}],
    }
    write_json(run_dir / "logs" / "llm_calls.json", [])
    write_json(run_dir / "output" / "result.json", response)
    write_json(run_dir / "run.json", response)
    evaluation = evaluate_run(run_dir)
    write_json(run_dir / "run.json", {**response, "evaluation": evaluation})
    append_event(run_dir, "completed", "没有匹配字段，跳过 Claude Code 调用")


def lab_job(run_id: str, document_id: str, entry: dict[str, Any], *, form_keys: list[str]) -> SimpleNamespace:
    return SimpleNamespace(
        id=f"lab-{run_id}-{document_id}",
        job_type="patient_ehr",
        input_json={
            "extractor_strategy": "claude_code",
            "source": "ocr_extract_lab_document",
            "relative_path": entry.get("relative_path"),
            "form_keys": form_keys,
        },
        document_id=document_id,
        patient_id=None,
        project_id=None,
        project_patient_id=None,
        context_id=None,
        schema_version_id="ehr_schema_json",
        target_form_key=form_keys[0] if len(form_keys) == 1 else None,
    )


def enrich_fields_with_locations(fields: list[dict[str, Any]], document: SimpleNamespace) -> list[dict[str, Any]]:
    enriched: list[dict[str, Any]] = []
    for field in fields:
        evidences = field.get("evidences") if isinstance(field.get("evidences"), list) else []
        resolved = resolve_evidence_locations(document, evidences, fallback_text=display_value(field))
        next_field = {**field, "evidences": resolved}
        next_field["locations"] = [evidence["bbox_json"] for evidence in resolved if isinstance(evidence, dict) and isinstance(evidence.get("bbox_json"), dict)]
        enriched.append(next_field)
    return enriched


def remap_fields(fields: list[dict[str, Any]], *, page_offset: int, entry: dict[str, Any], document_id: str) -> list[dict[str, Any]]:
    return [remap_field(field, page_offset=page_offset, entry=entry, document_id=document_id) for field in fields]


def remap_field(field: dict[str, Any], *, page_offset: int, entry: dict[str, Any], document_id: str) -> dict[str, Any]:
    next_field = {**field, "source_document_id": document_id, "source_name": entry.get("source_name"), "relative_path": entry.get("relative_path")}
    next_field["evidences"] = [remap_evidence(evidence, page_offset=page_offset, entry=entry) for evidence in field.get("evidences") or [] if isinstance(evidence, dict)]
    next_field["locations"] = [evidence["bbox_json"] for evidence in next_field["evidences"] if isinstance(evidence.get("bbox_json"), dict)]
    return next_field


def remap_evidence(evidence: dict[str, Any], *, page_offset: int, entry: dict[str, Any]) -> dict[str, Any]:
    next_evidence = dict(evidence)
    if next_evidence.get("page_no") is not None:
        next_evidence["source_page_no"] = next_evidence.get("page_no")
        next_evidence["page_no"] = int(next_evidence["page_no"]) + page_offset
    next_evidence["source_name"] = entry.get("source_name")
    next_evidence["relative_path"] = entry.get("relative_path")
    bbox = next_evidence.get("bbox_json")
    if isinstance(bbox, dict):
        next_bbox = dict(bbox)
        if next_bbox.get("page_no") is not None:
            next_bbox["source_page_no"] = next_bbox.get("page_no")
            next_bbox["page_no"] = int(next_bbox["page_no"]) + page_offset
        next_bbox["source_name"] = entry.get("source_name")
        next_bbox["relative_path"] = entry.get("relative_path")
        next_evidence["bbox_json"] = next_bbox
    return next_evidence


def display_value(field: dict[str, Any]) -> Any:
    for key in ("value_text", "value_number", "value_date", "value_datetime", "value_json"):
        if key in field and field[key] not in (None, "", [], {}):
            return field[key]
    return ""


def abort_on_document_failure() -> bool:
    value = os.getenv("EACY_LAB_ABORT_ON_DOCUMENT_FAILURE", "true").strip().lower()
    return value not in {"0", "false", "no", "off"}


def document_field_limit() -> int:
    try:
        return int(os.getenv("EACY_LAB_DOCUMENT_FIELD_LIMIT", "40"))
    except ValueError:
        return 40
