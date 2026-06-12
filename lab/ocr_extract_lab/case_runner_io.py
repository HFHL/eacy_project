from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from .cache import read_json


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
