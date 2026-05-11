#!/usr/bin/env bash
# 后台启动：后端 (uvicorn，无 reload) + Celery (三队列单 worker) + 前端 (Vite dev + API 代理)
# 断开 SSH 后仍运行（nohup）。日志：logs/*.log，PID：run/*.pid
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=daemon-common.sh
source "${SCRIPT_DIR}/daemon-common.sh"

mkdir -p "${EACY_RUN}" "${EACY_LOG}"

REDIS_P="$(_load_env_val REDIS_PORT)"
REDIS_P="${REDIS_P:-6379}"

redis_ping_ok() {
  if command -v redis-cli >/dev/null 2>&1; then
    redis-cli -h 127.0.0.1 -p "${REDIS_P}" ping 2>/dev/null | grep -q PONG
    return $?
  fi
  # 无 redis-cli 时用 bash /dev/tcp 探测端口
  timeout 1 bash -c "echo >/dev/tcp/127.0.0.1/${REDIS_P}" 2>/dev/null
}

if ! redis_ping_ok; then
  echo "Redis 127.0.0.1:${REDIS_P} 不可用，请先启动 Redis（例如 backend/docker 下 docker compose up -d redis）" >&2
  exit 1
fi

if [ ! -x "${EACY_ROOT}/backend/.venv/bin/python" ]; then
  echo "未找到 backend/.venv，请先在 backend 目录用 uv/poetry 安装依赖" >&2
  exit 1
fi

BASE_PORT="$(eacy_backend_port)"
BACKEND_PORT="$(_pick_free_port "${BASE_PORT}" 50)"
FRONT_BASE="$(eacy_frontend_port)"
FRONTEND_PORT="$(_pick_free_port "${FRONT_BASE}" 30)"

eacy_map_env
export DEBUG="${DEBUG:-false}"

PROXY_URL="http://127.0.0.1:${BACKEND_PORT}"

echo "EACY_ROOT=${EACY_ROOT}"
echo "ENV=${ENV} BACKEND_PORT=${BACKEND_PORT} FRONTEND_PORT=${FRONTEND_PORT}"
echo "VITE_DEV_API_PROXY_TARGET=${PROXY_URL}"

# 避免重复启动：若 pid 文件存在且进程仍存活则退出
for name in backend celery frontend; do
  f="${EACY_RUN}/${name}.pid"
  if [ -f "$f" ]; then
    pid="$(cat "$f")"
    if kill -0 "$pid" 2>/dev/null; then
      echo "${name} 已在运行 (pid ${pid})，请先执行 scripts/daemon-stop.sh" >&2
      exit 1
    fi
    rm -f "$f"
  fi
done

cd "${EACY_ROOT}/backend"
nohup env ENV="${ENV}" DEBUG="${DEBUG}" PYTHONUNBUFFERED=1 \
  .venv/bin/uvicorn app.server:app --host 0.0.0.0 --port "${BACKEND_PORT}" --workers 1 \
  >>"${EACY_LOG}/backend.log" 2>&1 &
echo $! >"${EACY_RUN}/backend.pid"

nohup env ENV="${ENV}" DEBUG="${DEBUG}" PYTHONUNBUFFERED=1 \
  .venv/bin/celery -A app.workers.celery_app.celery_app worker \
  -n "eacy-eacyproject@%h" \
  -Q ocr,metadata,extraction --loglevel=info --concurrency=4 --max-tasks-per-child=20 \
  >>"${EACY_LOG}/celery.log" 2>&1 &
echo $! >"${EACY_RUN}/celery.pid"

VITE_BIN="${EACY_ROOT}/node_modules/.bin/vite"
if [ ! -x "$VITE_BIN" ]; then
  echo "未找到 ${VITE_BIN}，请在项目根目录执行 npm install" >&2
  exit 1
fi

cd "${EACY_ROOT}/frontend_new"
nohup env VITE_DEV_API_PROXY_TARGET="${PROXY_URL}" PYTHONUNBUFFERED=1 \
  "$VITE_BIN" --host --port "${FRONTEND_PORT}" --strictPort \
  >>"${EACY_LOG}/frontend.log" 2>&1 &
echo $! >"${EACY_RUN}/frontend.pid"

{
  echo "BACKEND_PORT=${BACKEND_PORT}"
  echo "FRONTEND_PORT=${FRONTEND_PORT}"
  echo "VITE_DEV_API_PROXY_TARGET=${PROXY_URL}"
  echo "STARTED_AT=$(date -Iseconds)"
} >"${EACY_RUN}/ports.env"

echo "已启动。"
echo "  后端:    http://0.0.0.0:${BACKEND_PORT}/docs"
echo "  前端:    http://0.0.0.0:${FRONTEND_PORT}/"
echo "  端口记录: ${EACY_RUN}/ports.env"
echo "  日志:    ${EACY_LOG}/"
echo "  停止:    ${EACY_ROOT}/scripts/daemon-stop.sh"
