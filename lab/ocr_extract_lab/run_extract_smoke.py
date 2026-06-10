from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import uuid
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPO_ROOT / "backend"
DEFAULT_BATCH_DIR = REPO_ROOT / "lab" / "ocr_extract_lab" / "ocr_results" / "latest"
DEFAULT_SCHEMA_PATH = REPO_ROOT / "ehr_schema.json"
DEFAULT_RUN_ROOT = Path("/tmp/eacy-ocr-extract-lab")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a partial Claude Code extraction lab smoke test")
    parser.add_argument("--batch-dir", default=os.getenv("EACY_LAB_OCR_BATCH_DIR") or str(DEFAULT_BATCH_DIR))
    parser.add_argument("--schema-path", default=os.getenv("EACY_LAB_SCHEMA_PATH") or str(DEFAULT_SCHEMA_PATH))
    parser.add_argument("--run-root", default=os.getenv("EACY_LAB_RUN_ROOT") or str(DEFAULT_RUN_ROOT))
    parser.add_argument("--document-limit", type=int, default=1)
    parser.add_argument("--field-limit", type=int, default=12)
    parser.add_argument("--field-query", default=None)
    parser.add_argument("--env-file", default=os.getenv("EACY_ENV_FILE") or ".env.prod")
    return parser.parse_args()


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.removeprefix("export ").strip()
        if not key.replace("_", "").isalnum() or key[0].isdigit():
            continue
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


async def main() -> int:
    args = parse_args()
    env_file = Path(args.env_file)
    if not env_file.is_absolute():
        env_file = REPO_ROOT / env_file
    load_env_file(env_file)
    os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://user:pass@localhost:5432/eacy_lab")
    os.environ.setdefault("DISABLE_SQLALCHEMY_CEXT_RUNTIME", "1")
    os.environ.setdefault("EACY_EXTRACTION_STRATEGY", "claude_code")
    os.environ.setdefault("CLAUDE_CODE_ALLOWED_TOOLS", "Read,LS,Grep")
    os.environ.setdefault("CLAUDE_CODE_DISALLOWED_TOOLS", "Bash,Edit,Write,WebFetch,WebSearch")
    sys.path.insert(0, str(BACKEND_ROOT))
    sys.path.insert(0, str(REPO_ROOT))

    from lab.ocr_extract_lab.case_runner import initial_run_payload, run_case_extraction

    run_id = uuid.uuid4().hex
    run_dir = Path(args.run_root).expanduser().resolve() / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    batch_dir = Path(args.batch_dir).expanduser().resolve()
    schema_path = Path(args.schema_path).expanduser().resolve()
    initial_run_payload(run_id, run_dir, directory=str(batch_dir), batch_dir=batch_dir, schema_path=schema_path)
    await run_case_extraction(
        run_id=run_id,
        run_dir=run_dir,
        directory=str(batch_dir),
        batch_dir=batch_dir,
        schema_path=schema_path,
        field_query=args.field_query,
        field_limit=args.field_limit,
        document_limit=args.document_limit,
    )
    run = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
    summary = {
        "run_id": run_id,
        "run_dir": str(run_dir),
        "status": run.get("status"),
        "field_count": len(run.get("fields") or []),
        "evaluation": run.get("evaluation"),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2, default=str))
    return 0 if run.get("status") == "completed" else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
