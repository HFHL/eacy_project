#!/bin/bash
# =============================================================================
# EACY 项目一键启动脚本
# =============================================================================
# 
# 一键并行启动：
# 1. Express 后端 API
# 2. Vite + React 前端
# 3. CRF Service (FastAPI)
# 4. CRF Celery Worker (任务调度)
# 
# 预置条件：
# - 已全局安装或可使用 npx concurrently
# - 本地 6379 端口已有 Redis 在运行

echo "=========================================================="
echo " 🚀 正在启动 EACY 项目全栈服务..."
echo " 提示：按 Ctrl+C 可同时一键关闭所有服务。"
echo "=========================================================="

npx concurrently \
  -n "backend,frontend,crf-api,celery" \
  -c "green,cyan,magenta,yellow" \
  "npm run dev -w backend" \
  "npm run dev -w frontend" \
  "cd crf-service && source .venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8100 --reload" \
  "cd crf-service && source .venv/bin/activate && celery -A app.celery_app worker -l info -c 2"
