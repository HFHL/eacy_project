from __future__ import annotations

import os
import re
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from .case_runner_io import append_event, load_run, write_json
from .evaluation import evaluate_run


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

def abort_on_document_failure() -> bool:
    value = os.getenv("EACY_LAB_ABORT_ON_DOCUMENT_FAILURE", "true").strip().lower()
    return value not in {"0", "false", "no", "off"}


def document_field_limit() -> int:
    try:
        return int(os.getenv("EACY_LAB_DOCUMENT_FIELD_LIMIT", "40"))
    except ValueError:
        return 40
