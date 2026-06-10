#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="${EACY_LAB_SERVICE_LABEL:-com.eacy.ocr-extract-lab}"
PLIST="${EACY_LAB_PLIST:-/tmp/${LABEL}.plist}"
LOG_OUT="${EACY_LAB_STDOUT:-/tmp/eacy-ocr-extract-lab-server.log}"
LOG_ERR="${EACY_LAB_STDERR:-/tmp/eacy-ocr-extract-lab-server.err}"
PORT_VALUE="${PORT:-8777}"
ENV_FILE_VALUE="${EACY_ENV_FILE:-.env.prod}"
DOMAIN="gui/$(id -u)"

command -v launchctl >/dev/null || {
  echo "launchctl is required for background launch on macOS" >&2
  exit 1
}

launchctl bootout "$DOMAIN" "$PLIST" 2>/dev/null || true
launchctl remove "$LABEL" 2>/dev/null || true
rm -f "$PLIST"
: > "$LOG_OUT"
: > "$LOG_ERR"

plutil -create xml1 "$PLIST"
plutil -insert Label -string "$LABEL" "$PLIST"
plutil -insert ProgramArguments -array "$PLIST"
plutil -insert ProgramArguments.0 -string /usr/bin/env "$PLIST"
plutil -insert ProgramArguments.1 -string "EACY_ENV_FILE=$ENV_FILE_VALUE" "$PLIST"
plutil -insert ProgramArguments.2 -string "PORT=$PORT_VALUE" "$PLIST"
plutil -insert ProgramArguments.3 -string "$ROOT/scripts/run-ocr-extract-lab.sh" "$PLIST"
plutil -insert WorkingDirectory -string "$ROOT" "$PLIST"
plutil -insert RunAtLoad -bool true "$PLIST"
plutil -insert KeepAlive -bool true "$PLIST"
plutil -insert StandardOutPath -string "$LOG_OUT" "$PLIST"
plutil -insert StandardErrorPath -string "$LOG_ERR" "$PLIST"

launchctl bootstrap "$DOMAIN" "$PLIST"
sleep 2

echo "OCR extraction lab started: http://127.0.0.1:$PORT_VALUE/"
echo "Logs: $LOG_OUT $LOG_ERR"
