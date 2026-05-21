# EACY 项目 — AI 接手必读

本文件用于让接手的 AI agent 第一时间搞清楚“项目当前是怎么跑起来的”，避免在多套启动方式之间产生歧义。

## 当前服务器实际启动方式（authoritative）

**生产环境用 Docker Compose 启动**，入口文件：

```
/data/eacy/eacy_project/docker-compose.prod.yml
```

启动命令（必须带 `--env-file .env.prod`，否则 `POSTGRES_PASSWORD` 等变量缺失会报错）：

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

容器命名前缀：`eacy_project-*`。使用 `docker ps` 确认实际运行状态。

### 服务编排

| 服务 | 镜像 | 作用 |
| --- | --- | --- |
| `postgres` | postgres:16-alpine | DB，命名卷 `postgres-data` |
| `redis` | redis:7-alpine | Celery broker/backend，命名卷 `redis-data` |
| `migrate` | eacy-backend:prod | 一次性 `alembic upgrade head`，跑完退出 |
| `api` | eacy-backend:prod | `gunicorn app.server:app -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000 --workers ${API_WORKERS:-2} --timeout ${API_TIMEOUT_SECONDS:-180}` |
| `worker-ocr` | eacy-backend:prod | celery worker，队列 `ocr`，并发 `${OCR_CONCURRENCY:-1}` |
| `celery-beat` | eacy-backend:prod | Celery Beat，默认每天 03:00（Asia/Shanghai）清理超时 `pending` 抽取任务（标为 `failed`，可重试） |
| `worker-metadata` | eacy-backend:prod | celery worker，队列 `metadata,maintenance`，并发 `${METADATA_CONCURRENCY:-1}` |
| `worker-extraction` | eacy-backend:prod | celery worker，队列 `extraction`，并发 `${EXTRACTION_CONCURRENCY:-2}` |
| `nginx` | eacy-frontend:prod | 唯一对外端口 `${HTTP_PORT:-80}:80`，反代到 `api:8000` |

### 对外端口

`.env.prod` 当前设置 `HTTP_PORT=8000`，所以浏览器访问入口是：

```
http://<服务器IP>:8000/
```

不是 80，也不是后端的 8000（后端 8000 只在容器内暴露给 nginx）。

### 镜像构建源

- 后端镜像 `eacy-backend:prod` — `deploy/docker/backend.Dockerfile`，基础 `python:3.11.7-slim`，默认走阿里云 apt + pypi 镜像
- 前端镜像 `eacy-frontend:prod` — `deploy/docker/frontend.Dockerfile`，`node:20-alpine` 构建 React/Vite，`nginx:1.27-alpine` 提供 `dist/`

### 常用运维命令

所有命令都必须带 `--env-file .env.prod`：

```bash
# 状态
docker compose -f docker-compose.prod.yml --env-file .env.prod ps

# 日志
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f api
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f worker-extraction

# 重启单个服务
docker compose -f docker-compose.prod.yml --env-file .env.prod restart api

# 升级（参考 deploy/docker/README.md 中的 Upgrade Order）
docker compose -f docker-compose.prod.yml --env-file .env.prod stop celery-beat worker-ocr worker-metadata worker-extraction
docker compose -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm migrate
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# 关停（不删卷）
docker compose -f docker-compose.prod.yml --env-file .env.prod down
```

### 配置文件

- `.env.prod` — 真实密钥，**未提交 git**，是 `docker-compose.prod.yml` 默认读取的 env 文件
- `.env.prod.example` — 模板，可提交，用于新机器初始化

`docker-compose.prod.yml` 里也可以通过 `EACY_ENV_FILE=...` 覆盖默认 env 文件位置。

## ⚠️ 不要被这些迷惑

仓库里存在多套“启动方式”的脚本/文档，**当前生产并不使用它们**。看到时不要误以为是当前在跑的方式：

### `scripts/daemon-start.sh` — 仅本机/SSH 开发用

用 `nohup` 起：
- `backend/.venv/bin/uvicorn app.server:app --workers 1`（无 reload）
- `.venv/bin/celery ... -Q ocr,metadata,extraction --concurrency=4`
- `node_modules/.bin/vite --host --port ...`（**Vite dev server，不是生产构建**）

PID 写到 `run/*.pid`，端口写到 `run/ports.env`，日志在 `logs/*.log`。
当前 `run/ports.env`、`run/*.pid` 是历史残留，**进程早已不在**。

适用场景：在没有 Docker 的开发机上快速起一份能改代码的环境。不要在已经用 docker-compose 跑着的服务器上同时启动它，会端口冲突 / 数据库连接打满。

### `start-all.bat` / `start-all.ps1` — Windows 开发用

只为 Windows 工程师本地开发设计，Linux 服务器无关。

### `DEPLOYMENT_RUNBOOK.md` — 通用部署指南，非当前部署实情

它写的是 systemd + 本机 poetry/uv + 本机 nginx 的部署方式。**当前服务器没有使用这种部署**。当前服务器是 Docker。

### 数据库 — 仅远程 PostgreSQL

开发与生产均通过根目录 `.env` 的 **`DATABASE_URL`**（`postgresql+asyncpg://...`）连接远程库。**不存在**本地 MySQL / 本地 PostgreSQL compose。复制 `.env.example` 为 `.env` 后填写真实连接串。本地仅需 Redis（Celery broker）。

## 文档地图

| 文档 | 用途 |
| --- | --- |
| `CLAUDE.md`（本文件） | AI 接手必读，描述**当前**怎么跑 |
| `SERVER_DEPLOYMENT_NOTES.md` | 当前服务器状态快照（容器、端口、日志位置） |
| `deploy/docker/README.md` | docker-compose.prod.yml 的详细说明、镜像源、调优、升级顺序 |
| `DEPLOYMENT_RUNBOOK.md` | **通用**部署手册（非 Docker 方案，供迁移到新机器或裸机部署时参考） |
| `deploy/production/README.md` | systemd + nginx 裸机部署示例 |
| `eacy/` | Obsidian 设计文档 |

## 项目结构速览

```
backend/          FastAPI + Alembic + Celery（uvicorn 入口 app.server:app）
frontend_new/     React + Vite + Ant Design（生产构建产物 dist/，由 nginx 容器托管）
deploy/docker/    生产镜像 Dockerfile + nginx 配置
deploy/production/ systemd / nginx 裸机部署示例（非当前部署方式）
scripts/          本机/SSH 开发后台启停脚本（daemon-start.sh / daemon-stop.sh）
docker-compose.prod.yml   ← 当前生产部署入口
.env.example              ← 开发环境变量模板（DATABASE_URL 必填）
```

## 核心栈

- 后端：FastAPI（async），驱动 `asyncpg`，迁移 `alembic`
- 队列：Celery，三条队列 `ocr` / `metadata` / `extraction`，broker 是 Redis
- 数据库：PostgreSQL（开发/测试经 `.env` 的 `DATABASE_URL` 连远程库；生产 compose 内嵌 `postgres` 服务）
- 前端：React + Vite + Ant Design，生产由 nginx 提供静态文件并反代 `/api/v1/` 到 `api:8000`
- 对象存储：阿里云 OSS（`DOCUMENT_STORAGE_PROVIDER=oss`）
- OCR：TextIn
- LLM：OpenAI 兼容接口（`OPENAI_API_BASE_URL` 可指向自建/兼容服务）

## 验证服务是否健康

```bash
# 容器
docker compose -f docker-compose.prod.yml --env-file .env.prod ps

# 入口
curl -I http://127.0.0.1:8000/

# API（经 nginx 反代）
curl http://127.0.0.1:8000/api/v1/auth/

# 开发种子账号（生产上线前应改掉）
# admin@example.com / 123456
# user1@example.com / 123456
```
