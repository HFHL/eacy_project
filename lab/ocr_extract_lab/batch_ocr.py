from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import mimetypes
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPO_ROOT / "backend"
DEFAULT_INPUT_DIR = REPO_ROOT / "lab" / "ocr_extract_lab" / "files"
DEFAULT_OUTPUT_ROOT = REPO_ROOT / "lab" / "ocr_extract_lab" / "ocr_results"
SUPPORTED_EXTS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}


def load_env_file(path: Path | None) -> None:
    if not path or not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.removeprefix("export ").strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            continue
        value = value.strip()
        if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
            value = value[1:-1]
        os.environ.setdefault(key, value)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Batch OCR lab files with TextIn")
    parser.add_argument("--input-dir", default=os.getenv("EACY_LAB_FILE_DIR") or str(DEFAULT_INPUT_DIR))
    parser.add_argument("--output-root", default=os.getenv("EACY_LAB_OCR_OUTPUT_ROOT") or str(DEFAULT_OUTPUT_ROOT))
    parser.add_argument("--env-file", default=os.getenv("EACY_ENV_FILE") or ".env.prod")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--resume", action="store_true", help="Skip files already completed in the output batch")
    return parser.parse_args()


def discover_files(input_dir: Path, limit: int) -> list[Path]:
    files = [
        path
        for path in sorted(input_dir.rglob("*"))
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTS and path.name != ".gitignore"
    ]
    return files[:limit] if limit and limit > 0 else files


def safe_name(index: int, path: Path, digest: str) -> str:
    stem = re.sub(r"[^0-9A-Za-z._\-\u4e00-\u9fff]+", "_", path.stem).strip("._-")
    return f"{index:03d}_{stem or 'file'}_{digest[:10]}"


def sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")


def write_markdown(path: Path, *, source: Path, markdown: str) -> None:
    heading = f"# OCR Markdown\n\n- Source: `{source.name}`\n\n"
    path.write_text(heading + (markdown or "").strip() + "\n", encoding="utf-8")


async def ocr_one(index: int, source: Path, input_dir: Path, batch_dir: Path) -> dict[str, Any]:
    from app.integrations.textin_ocr import TextInOcrClient
    from app.services.ocr_payload_normalizer import normalize_textin_ocr_payload

    content = source.read_bytes()
    digest = sha256_bytes(content)
    item_dir = batch_dir / "items" / safe_name(index, source, digest)
    done_path = item_dir / "done.json"
    if done_path.exists():
        return json.loads(done_path.read_text(encoding="utf-8"))

    started_at = datetime.utcnow()
    metadata = {
        "index": index,
        "source_name": source.name,
        "relative_path": str(source.relative_to(input_dir)),
        "source_path": str(source),
        "size_bytes": len(content),
        "sha256": digest,
        "mime_type": mimetypes.guess_type(source.name)[0] or "application/octet-stream",
        "started_at": started_at.isoformat(),
    }
    write_json(item_dir / "input.json", metadata)

    try:
        raw = await TextInOcrClient().parse_document_bytes(
            content,
            filename=source.name,
            mime_type=metadata["mime_type"],
        )
        normalized = normalize_textin_ocr_payload(raw, request_snapshot=metadata)
        markdown = normalized.get("markdown") or ""
        write_json(item_dir / "textin_raw.json", raw)
        write_json(item_dir / "textin_normalized.json", normalized)
        write_markdown(item_dir / "ocr.md", source=source, markdown=markdown)
        result = {
            **metadata,
            "status": "completed",
            "finished_at": datetime.utcnow().isoformat(),
            "output_dir": str(item_dir),
            "raw_json": str(item_dir / "textin_raw.json"),
            "normalized_json": str(item_dir / "textin_normalized.json"),
            "markdown": str(item_dir / "ocr.md"),
            "markdown_chars": len(markdown),
            "page_count": len(normalized.get("pages") or []),
        }
        write_json(done_path, result)
        return result
    except Exception as exc:
        result = {
            **metadata,
            "status": "failed",
            "finished_at": datetime.utcnow().isoformat(),
            "output_dir": str(item_dir),
            "error_type": exc.__class__.__name__,
            "error_message": str(exc),
        }
        write_json(item_dir / "error.json", result)
        return result


def write_combined_markdown(batch_dir: Path, results: list[dict[str, Any]]) -> None:
    chunks = ["# Batch OCR Markdown\n"]
    for item in results:
        chunks.append(f"\n\n## {item['index']:03d}. {item['source_name']}\n")
        if item.get("status") != "completed":
            chunks.append(f"\nOCR failed: {item.get('error_message', '')}\n")
            continue
        md_path = Path(item["markdown"])
        chunks.append(md_path.read_text(encoding="utf-8") if md_path.exists() else "")
    (batch_dir / "combined_ocr.md").write_text("".join(chunks), encoding="utf-8")


async def main() -> int:
    args = parse_args()
    env_file = Path(args.env_file)
    if not env_file.is_absolute():
        env_file = REPO_ROOT / env_file
    load_env_file(env_file)
    os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://user:pass@localhost:5432/eacy_lab")
    sys.path.insert(0, str(BACKEND_ROOT))

    input_dir = Path(args.input_dir).expanduser().resolve()
    output_root = Path(args.output_root).expanduser().resolve()
    batch_dir = output_root / datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    batch_dir.mkdir(parents=True, exist_ok=True)

    files = discover_files(input_dir, args.limit)
    results: list[dict[str, Any]] = []
    print(f"Batch OCR input={input_dir} files={len(files)} output={batch_dir}", flush=True)
    for index, source in enumerate(files, start=1):
        print(f"[{index}/{len(files)}] OCR {source.name}", flush=True)
        result = await ocr_one(index, source, input_dir, batch_dir)
        results.append(result)
        print(f"  -> {result['status']} chars={result.get('markdown_chars', 0)} pages={result.get('page_count', 0)}", flush=True)
        write_json(batch_dir / "summary.json", {"batch_dir": str(batch_dir), "input_dir": str(input_dir), "results": results})

    completed = sum(1 for item in results if item.get("status") == "completed")
    failed = len(results) - completed
    summary = {
        "batch_dir": str(batch_dir),
        "input_dir": str(input_dir),
        "started_file_count": len(files),
        "completed_count": completed,
        "failed_count": failed,
        "finished_at": datetime.utcnow().isoformat(),
        "results": results,
    }
    write_json(batch_dir / "summary.json", summary)
    write_combined_markdown(batch_dir, results)
    print(f"Done completed={completed} failed={failed}", flush=True)
    print(str(batch_dir), flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
