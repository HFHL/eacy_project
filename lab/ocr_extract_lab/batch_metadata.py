from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPO_ROOT / "backend"
DEFAULT_OCR_BATCH_DIR = REPO_ROOT / "lab" / "ocr_extract_lab" / "ocr_results" / "latest"


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
    parser = argparse.ArgumentParser(description="Classify cached OCR documents for the extraction lab")
    parser.add_argument("--batch-dir", default=os.getenv("EACY_LAB_OCR_BATCH_DIR") or str(DEFAULT_OCR_BATCH_DIR))
    parser.add_argument("--env-file", default=os.getenv("EACY_ENV_FILE") or ".env.prod")
    parser.add_argument("--strategy", default=os.getenv("EACY_LAB_METADATA_STRATEGY") or "rule")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    env_file = Path(args.env_file)
    if not env_file.is_absolute():
        env_file = REPO_ROOT / env_file
    load_env_file(env_file)
    os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://user:pass@localhost:5432/eacy_lab")
    sys.path.insert(0, str(BACKEND_ROOT))
    sys.path.insert(0, str(REPO_ROOT))

    from lab.ocr_extract_lab.metadata_cache import ensure_batch_metadata

    batch_dir = Path(args.batch_dir).expanduser().resolve()
    summary = ensure_batch_metadata(batch_dir, force=args.force, limit=args.limit, strategy=args.strategy)
    print(json.dumps({k: v for k, v in summary.items() if k != "results"}, ensure_ascii=False, indent=2))
    print(f"summary={batch_dir / 'document_metadata_summary.json'}")
    return 1 if summary.get("failed_count") else 0


if __name__ == "__main__":
    raise SystemExit(main())
