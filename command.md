# EACY 项目启动与运行指南

本项目包含完整的前后端服务及基于 Celery 的文档处理（OCR/Metadata/EHR结构化）流水线。本文档汇总了项目的全部启动与配置指令。

---

## 🚀 推荐方式：一键全栈启动

我们提供了一个并发执行脚本 `start.sh`，可一键同时启动本地需要的 **4** 个核心模块：
1. **Backend API** (Express 服务)
2. **Frontend** (Vite + React)
3. **CRF Service** (FastAPI，接收并发起文档流水线)
4. **Celery Worker** (后台异步任务调度节点)

首先确保赋予运行权限：
```bash
chmod +x start.sh
```

**一键启动：**
```bash
./start.sh
```
> **注意**：
> 1. 本地前置依赖：你需要在本地 6379 端口（或其他在 `.env` 中指定的端口）启动 **Redis** 服务器。否则 Celery Worker 和 API 将无法建立 broker 链接！
> 2. 关闭时只需在这个终端按下 `Ctrl + C`，所有子进程会被自动安全地终止，非常干净。

---

## 🛠 备用方式：分步独立启动

若需排查问题或单独调试某一模块，亦可开 **4 个不同终端窗口**，分别手工启动：

### 1️⃣ 后端 API (Express + SQLite)
```bash
cd /Users/apple/project/first-project/backend
npm run dev
```
- 服务端口：`http://localhost:8000`
- 职责：提供前台 API，SQLite 数据库交互

### 2️⃣ 前端 Web (Vite + React)
```bash
cd /Users/apple/project/first-project/frontend
npm run dev
```
- 服务端口：`http://localhost:5173` 或 `http://localhost:3000`
- API 代理：Vite 会自动将 `/api` 或请求重定向到后端配置的 `localhost:8000` 端口。

### 3️⃣ CRF Service 微服务 (FastAPI)
```bash
cd /Users/apple/project/first-project/crf-service
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8100 --reload
# 或者 python -m app.main
```
- 服务端口：`http://localhost:8100`
- 职责：提供内部供 backend 触发任务的流水线接口 (`/api/pipeline/process`) 和进度事件接口。

### 4️⃣ CRF Celery 任务处理器 (Celery Worker)
```bash
cd /Users/apple/project/first-project/crf-service
source .venv/bin/activate
celery -A app.celery_app worker -l info -c 2
```
- 职责：在后台安静排队地执行各种重量级任务 —— **OCR解析、Metadata 提取、实体抽取及 EHR 报告生**等。

> ~~**Pipeline Daemon (已废弃❌)**~~
> 此前的数据库休眠轮询脚本 (`pipeline-daemon/daemon.py`) 已被彻底废弃以优化系统性能，所有流水线现转由 Backend/Frontend 通过 HTTP 请求直接交由上述 Celery 接管。

### 5️⃣ Prefect Server（仅在个别基于预发布流程流需要时可选启动）
```bash
prefect server start
```
- 端口：`http://127.0.0.1:4200`
- 按需使用，多数情况下当前代码使用原生 Subprocess + Celery 管理无需 Prefect Server。

---

## 📋 环境与依赖记录

| 组件模块 | Python 虚拟环境执行路径 | 备注 |
|------|---------------|-------|
| OCR 处理 | `ocr-worker/.venv/bin/python` | 被 Celery 任务调用 |
| Metadata 处理 | `metadata-worker/.venv/bin/python` | 被 Celery 任务调用 |
| CRF Service | `crf-service/.venv/bin/python` | FastAPI API & Celery 并发池所在之处 | 

### ⚙ 重要可调配的环境变量 (`.env`)

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BACKEND_PORT` | 8000 | 后端服务端口 |
| `FRONTEND_PORT` | 80 | 前端服务最终端口(Nginx等参考) / Dev模式多以 Vite 自带为准 |
| `REDIS_URL` | redis://127.0.0.1:6379/0 | Celery 以及进度推送依赖的共享缓存 |
| `CELERY_BROKER_URL` | redis://127.0.0.1:6379/1 | Celery 任务代理池地址 |
| `CRF_SERVICE_PORT` | 8100 | CRF 微服务占用端口（默认未全部写入env，通常按代码执行）|