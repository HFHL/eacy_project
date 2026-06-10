from __future__ import annotations

import json
import mimetypes
import os
import sys
import uuid
import asyncio
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel


os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://user:pass@localhost:5432/eacy_lab")
REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from .cache import load_batch_entries  # noqa: E402
from .case_runner import initial_run_payload, run_case_extraction  # noqa: E402
from .metadata_cache import batch_metadata_summary_path, load_metadata_index, metadata_for_entry  # noqa: E402


STATIC_DIR = Path(__file__).resolve().parent / "static"
DEFAULT_FILE_DIR = REPO_ROOT / "lab" / "ocr_extract_lab" / "files"
DEFAULT_RUN_ROOT = Path("/tmp/eacy-ocr-extract-lab")
DEFAULT_SCHEMA_PATH = REPO_ROOT / "ehr_schema.json"
DEFAULT_OCR_BATCH_DIR = REPO_ROOT / "lab" / "ocr_extract_lab" / "ocr_results" / "latest"
SUPPORTED_EXTS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}

app = FastAPI(title="EACY Extraction Lab")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class RunRequest(BaseModel):
    directory: str | None = None
    field_query: str | None = None
    field_limit: int | None = None
    document_limit: int | None = None


def file_root(raw: str | None = None) -> Path:
    value = raw or os.getenv("EACY_LAB_FILE_DIR") or str(DEFAULT_FILE_DIR)
    return Path(value).expanduser().resolve()


def run_root() -> Path:
    root = Path(os.getenv("EACY_LAB_RUN_ROOT") or DEFAULT_RUN_ROOT).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def schema_path() -> Path:
    return Path(os.getenv("EACY_LAB_SCHEMA_PATH") or DEFAULT_SCHEMA_PATH).expanduser().resolve()


def ocr_batch_dir() -> Path:
    return Path(os.getenv("EACY_LAB_OCR_BATCH_DIR") or DEFAULT_OCR_BATCH_DIR).expanduser().resolve()


def ensure_allowed_dir(path: Path) -> Path:
    allowed = os.getenv("EACY_LAB_ALLOWED_ROOT")
    if not allowed:
        return path
    allowed_root = Path(allowed).expanduser().resolve()
    if not path.is_relative_to(allowed_root):
        raise HTTPException(status_code=403, detail=f"Directory must be under {allowed_root}")
    return path


def read_run(run_id: str) -> dict[str, Any]:
    path = run_root() / run_id / "run.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Run not found")
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/", response_class=HTMLResponse)
async def index() -> str:
    return (STATIC_DIR / "index.html").read_text(encoding="utf-8")


@app.get("/api/config")
async def config() -> dict[str, Any]:
    return {
        "file_dir": str(file_root()),
        "run_root": str(run_root()),
        "schema_path": str(schema_path()),
        "ocr_batch_dir": str(ocr_batch_dir()),
        "metadata_summary": str(batch_metadata_summary_path(ocr_batch_dir())),
        "field_limit": int(os.getenv("EACY_LAB_FIELD_LIMIT") or 160),
    }


@app.get("/api/files")
async def list_files(directory: str | None = None) -> dict[str, Any]:
    root = ensure_allowed_dir(file_root(directory))
    root.mkdir(parents=True, exist_ok=True)
    cached_entries = cached_ocr_entries()
    cached = {str(item.get("relative_path")) for item in cached_entries if item.get("relative_path")}
    entries_by_relative = cached_entries_by_relative(cached_entries)
    metadata_index = cached_metadata_index()
    files: list[dict[str, Any]] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in SUPPORTED_EXTS:
            continue
        relative_path = str(path.relative_to(root))
        entry = entries_by_relative.get(relative_path)
        metadata = metadata_for_entry(entry, metadata_index) if entry else None
        stat = path.stat()
        files.append(
            {
                "name": path.name,
                "relative_path": relative_path,
                "size": stat.st_size,
                "ocr_cached": relative_path in cached,
                "metadata_cached": bool(metadata),
                "doc_type": (metadata or {}).get("doc_type"),
                "doc_subtype": (metadata or {}).get("doc_subtype"),
                "doc_title": (metadata or {}).get("doc_title"),
                "mime_type": mimetypes.guess_type(path.name)[0] or "application/octet-stream",
            }
        )
        if len(files) >= 500:
            break
    return {"directory": str(root), "ocr_batch_dir": str(ocr_batch_dir()), "files": files}


@app.post("/api/runs")
async def create_run(request: RunRequest) -> dict[str, Any]:
    directory = str(ensure_allowed_dir(file_root(request.directory)))
    batch_dir = ocr_batch_dir()
    if not (batch_dir / "summary.json").exists():
        raise HTTPException(status_code=400, detail=f"未找到 OCR 缓存：{batch_dir / 'summary.json'}")
    run_id = uuid.uuid4().hex
    run_dir = run_root() / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    payload = initial_run_payload(run_id, run_dir, directory=directory, batch_dir=batch_dir, schema_path=schema_path())
    asyncio.create_task(
        run_case_extraction(
            run_id=run_id,
            run_dir=run_dir,
            directory=directory,
            batch_dir=batch_dir,
            schema_path=schema_path(),
            field_query=request.field_query,
            field_limit=request.field_limit,
            document_limit=request.document_limit,
        )
    )
    return payload


@app.get("/api/runs/{run_id}")
async def get_run(run_id: str) -> dict[str, Any]:
    return read_run(run_id)


@app.get("/api/runs/{run_id}/evaluation")
async def get_run_evaluation(run_id: str) -> dict[str, Any]:
    run_dir = run_root() / run_id
    path = run_dir / "output" / "evaluation.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Evaluation not found")
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/api/runs/{run_id}/page/{page_no}")
async def run_page(run_id: str, page_no: int) -> FileResponse:
    run_dir = run_root() / run_id
    for ext in (".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"):
        path = run_dir / "pages" / f"page-{page_no}{ext}"
        if path.exists():
            return FileResponse(path, media_type=mimetypes.guess_type(path.name)[0] or "application/octet-stream")
    raise HTTPException(status_code=404, detail="Page image not found")


def cached_relative_paths() -> set[str]:
    return {str(item.get("relative_path")) for item in cached_ocr_entries() if item.get("relative_path")}


def cached_ocr_entries() -> list[dict[str, Any]]:
    try:
        return load_batch_entries(ocr_batch_dir())
    except Exception:
        return []


def cached_entries_by_relative(entries: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {str(item.get("relative_path")): item for item in entries if item.get("relative_path")}


def cached_metadata_index() -> dict[str, dict[str, Any]]:
    try:
        return load_metadata_index(ocr_batch_dir())
    except Exception:
        return {}
