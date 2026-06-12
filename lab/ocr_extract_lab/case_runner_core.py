from __future__ import annotations

import asyncio
import json
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any

from app.services.schema_field_planner import plan_schema_fields

from .cache import load_batch_entries
from .case_runner_documents import (
    abort_on_document_failure,
    document_status,
    finish_empty_run,
    safe_doc_dir,
)
from .case_runner_extract import extract_one_document
from .case_runner_io import append_event, load_run, update_run, write_json
from .evaluation import evaluate_run
from .metadata_cache import ensure_batch_metadata, load_metadata_index, metadata_for_entry


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
