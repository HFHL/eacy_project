#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=daemon-common.sh
source "${SCRIPT_DIR}/daemon-common.sh"

stop_one() {
  local name="$1"
  local f="${EACY_RUN}/${name}.pid"
  if [ ! -f "$f" ]; then
    echo "${name}: 无 pid 文件，跳过"
    return 0
  fi
  local pid
  pid="$(cat "$f")"
  if kill -0 "$pid" 2>/dev/null; then
    echo "${name}: 停止 pid ${pid}"
    kill "$pid" 2>/dev/null || true
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  else
    echo "${name}: pid ${pid} 已不存在"
  fi
  rm -f "$f"
}

# 先停前端，再 Celery，再后端
stop_one frontend
stop_one celery
stop_one backend

echo "已停止（若仍有残留 uvicorn/celery/vite，请自行 ps 检查）。"
