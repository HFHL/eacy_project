# shellcheck shell=bash
# 被 daemon-start.sh / daemon-stop.sh source
EACY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EACY_RUN="${EACY_ROOT}/run"
EACY_LOG="${EACY_ROOT}/logs"

_load_env_val() {
  local key="$1"
  grep "^${key}=" "${EACY_ROOT}/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r'
}

# 从 .env 读取端口；可被环境变量覆盖
eacy_backend_port() {
  local p="${EACY_BACKEND_PORT:-$(_load_env_val BACKEND_PORT)}"
  echo "${p:-8000}"
}

eacy_frontend_port() {
  local p="${EACY_FRONTEND_PORT:-5173}"
  echo "$p"
}

_port_in_use() {
  local p="$1"
  ss -tln 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${p}$"
}

# 若端口被占用则递增，直到空闲（最多尝试 50 次）
_pick_free_port() {
  local p="$1"
  local max="$2"
  local i=0
  while _port_in_use "$p"; do
    p=$((p + 1))
    i=$((i + 1))
    if [ "$i" -ge "$max" ]; then
      echo "No free port from base $1 after $max tries" >&2
      return 1
    fi
  done
  echo "$p"
}

eacy_map_env() {
  local app_env
  app_env="$(_load_env_val APP_ENV)"
  case "${app_env:-local}" in
    production) export ENV=prod ;;
    *) export ENV=local ;;
  esac
}
