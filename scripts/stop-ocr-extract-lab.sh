#!/usr/bin/env bash
set -euo pipefail

LABEL="${EACY_LAB_SERVICE_LABEL:-com.eacy.ocr-extract-lab}"
PLIST="${EACY_LAB_PLIST:-/tmp/${LABEL}.plist}"
DOMAIN="gui/$(id -u)"

launchctl bootout "$DOMAIN" "$PLIST" 2>/dev/null || true
launchctl remove "$LABEL" 2>/dev/null || true

echo "OCR extraction lab stopped"
