#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${EACY_ENV_FILE:-}"

HOME_DIR="${HOME:-/Users/Admin}"
export PATH="$HOME_DIR/.local/bin:/Users/Admin/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

if [[ -z "$ENV_FILE" ]]; then
  if [[ -f "$ROOT/.env.prod" ]]; then
    ENV_FILE="$ROOT/.env.prod"
  elif [[ -f "$ROOT/.env" ]]; then
    ENV_FILE="$ROOT/.env"
  fi
elif [[ "$ENV_FILE" != /* ]]; then
  ENV_FILE="$ROOT/$ENV_FILE"
fi

if [[ -n "$ENV_FILE" && -f "$ENV_FILE" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" != *"="* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    key="${key#export }"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi
    export "$key=$value"
  done < "$ENV_FILE"
fi

export PYTHONPATH="$ROOT/backend:$ROOT:${PYTHONPATH:-}"
export DATABASE_URL="${DATABASE_URL:-postgresql+asyncpg://user:pass@localhost:5432/eacy_lab}"
export DISABLE_SQLALCHEMY_CEXT_RUNTIME="${DISABLE_SQLALCHEMY_CEXT_RUNTIME:-1}"
export EACY_EXTRACTION_STRATEGY="${EACY_EXTRACTION_STRATEGY:-claude_code}"
export EACY_LAB_FILE_DIR="${EACY_LAB_FILE_DIR:-$ROOT/lab/ocr_extract_lab/files}"
export EACY_LAB_ALLOWED_ROOT="${EACY_LAB_ALLOWED_ROOT:-$EACY_LAB_FILE_DIR}"
export EACY_LAB_FIELD_LIMIT="${EACY_LAB_FIELD_LIMIT:-160}"
export EACY_LAB_METADATA_STRATEGY="${EACY_LAB_METADATA_STRATEGY:-rule}"
export CLAUDE_CODE_BIN="${CLAUDE_CODE_BIN:-$(command -v claude || printf 'claude')}"
export CLAUDE_CODE_MAX_TURNS="${CLAUDE_CODE_MAX_TURNS:-14}"
export CLAUDE_CODE_ALLOWED_TOOLS="${CLAUDE_CODE_ALLOWED_TOOLS:-Read,LS,Grep}"
export CLAUDE_CODE_DISALLOWED_TOOLS="${CLAUDE_CODE_DISALLOWED_TOOLS:-Bash,Edit,Write,WebFetch,WebSearch}"

mkdir -p "$EACY_LAB_FILE_DIR"

if [[ -x "$ROOT/backend/.venv/bin/python" ]]; then
  exec "$ROOT/backend/.venv/bin/python" -m uvicorn lab.ocr_extract_lab.server:app \
    --host "${HOST:-127.0.0.1}" \
    --port "${PORT:-8777}"
fi

exec uv run --project "$ROOT/backend" python -m uvicorn lab.ocr_extract_lab.server:app \
  --host "${HOST:-127.0.0.1}" \
  --port "${PORT:-8777}"
