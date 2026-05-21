#!/usr/bin/env bash
# 一键入口：./run.sh [users] [duration]
#
#   ./run.sh              单账号冒烟（users=1，跑到流程结束或 30 分钟超时）
#   ./run.sh 1            同上
#   ./run.sh 5            5 个并发账号，每跑完一个 spawn 新的
#   ./run.sh 5 60m        5 并发跑 60 分钟
#
# 退出后报告位置：results/<run_id>/locust_stats.csv 等

set -euo pipefail

cd "$(dirname "$0")"

# --- 参数 ----------------------------------------------------------
USERS="${1:-1}"
DURATION="${2:-30m}"
SPAWN_RATE="${SPAWN_RATE:-1}"

# --- 校验 ----------------------------------------------------------
if [[ ! -f config/base.env ]]; then
    echo "ERROR: config/base.env not found; copy from config/base.env.example and fill in."
    exit 1
fi

# 加载 env，校验关键字段
set -o allexport
# shellcheck disable=SC1091
source config/base.env
set +o allexport

: "${EACY_BASE_URL:?EACY_BASE_URL not set in config/base.env}"
: "${TEMPLATE_ID:?TEMPLATE_ID not set in config/base.env}"
: "${FIXTURES_DIR:=./fixtures}"
: "${DOCS_PER_VU:=5}"

# fixtures 校验：扁平池，统计 pdf/jpg/jpeg/png 文件数
FIXTURE_COUNT=$(find "$FIXTURES_DIR" -maxdepth 1 -type f \
    \( -iname '*.pdf' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' \) 2>/dev/null \
    | wc -l | tr -d ' ')
if [[ "$FIXTURE_COUNT" -lt "$DOCS_PER_VU" ]]; then
    echo "ERROR: only $FIXTURE_COUNT files in $FIXTURES_DIR, need ≥ DOCS_PER_VU=$DOCS_PER_VU"
    exit 1
fi
echo "[run.sh] fixtures: $FIXTURE_COUNT files in $FIXTURES_DIR (each VU samples $DOCS_PER_VU)"

# --- 准备 run_id 目录 ----------------------------------------------
RUN_ID="$(date +%Y%m%d_%H%M%S)"
RESULT_DIR="results/$RUN_ID"
mkdir -p "$RESULT_DIR"

export STRESS_RUN_ID="$RUN_ID"

echo "[run.sh] run_id=$RUN_ID users=$USERS duration=$DURATION host=$EACY_BASE_URL"
echo "[run.sh] results → $RESULT_DIR/"

# --- 跑 locust ----------------------------------------------------
# --csv 会输出 _stats.csv / _failures.csv / _stats_history.csv / _exceptions.csv
locust \
    -f scripts/locustfile.py \
    --headless \
    --host "$EACY_BASE_URL" \
    -u "$USERS" \
    -r "$SPAWN_RATE" \
    -t "$DURATION" \
    --csv "$RESULT_DIR/locust" \
    --html "$RESULT_DIR/report.html" \
    --loglevel INFO \
    2>&1 | tee "$RESULT_DIR/locust.log"

EXIT=${PIPESTATUS[0]}

echo ""
echo "=================================================="
echo "[run.sh] done. exit=$EXIT"
echo "[run.sh] stats : $RESULT_DIR/locust_stats.csv"
echo "[run.sh] fails : $RESULT_DIR/locust_failures.csv"
echo "[run.sh] log   : $RESULT_DIR/locust.log"
echo "[run.sh] html  : $RESULT_DIR/report.html"
echo "=================================================="

exit "$EXIT"
