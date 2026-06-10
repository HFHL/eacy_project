#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
export PYTHONPATH="$ROOT/backend:$ROOT:${PYTHONPATH:-}"

exec uv run --project "$ROOT/backend" python "$ROOT/lab/ocr_extract_lab/batch_ocr.py" "$@"
