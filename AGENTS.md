# EACY 项目 — AI 接手必读

本文件用于让接手的 AI agent 第一时间搞清楚“项目当前是怎么跑起来的”，避免在多套启动方式之间产生歧义。

## 当前服务器实际启动方式（authoritative）

**生产环境用 Docker Compose 启动**，入口文件：

```text
/data/eacy/eacy_project/docker-compose.prod.yml
```

启动命令必须带 `--env-file .env.prod`，否则 `DATABASE_URL`、JWT、OSS、TextIn、LLM、Redis/Celery 等生产配置可能缺失：

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

容器命名前缀：`eacy_project-*`。使用 `docker compose ... ps` 或 `docker ps` 确认实际运行状态。

### 服务编排

| 服务 | 镜像 | 作用 |
| --- | --- | --- |
| `redis` | redis:7-alpine | Celery broker/backend 与缓存依赖，命名卷 `redis-data` |
| `migrate` | eacy-backend:prod | 一次性 `alembic upgrade head`，跑完退出 |
| `api` | eacy-backend:prod | `gunicorn app.server:app -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000 --workers ${API_WORKERS:-2} --timeout ${API_TIMEOUT_SECONDS:-180}` |
| `worker-ocr` | eacy-backend:prod | celery worker，队列 `ocr`，并发 `${OCR_CONCURRENCY:-1}` |
| `celery-beat` | eacy-backend:prod | Celery Beat，默认每天 03:00（Asia/Shanghai）清理超时 `pending` 抽取任务（标为 `failed`，可重试） |
| `worker-metadata` | eacy-backend:prod | celery worker，队列 `metadata,maintenance`，并发 `${METADATA_CONCURRENCY:-1}` |
| `worker-extraction` | eacy-backend:prod | celery worker，队列 `extraction`，并发 `${EXTRACTION_CONCURRENCY:-2}` |
| `nginx` | eacy-frontend:prod | 唯一对外端口 `${HTTP_PORT:-80}:80`，反代到 `api:8000` |

> 当前 compose **不启动 PostgreSQL 容器**。生产数据库由 `.env.prod` 的 `DATABASE_URL` 指向外部/远程 PostgreSQL。

### 对外端口

浏览器入口以 `.env.prod` 的 `HTTP_PORT` 为准：

```text
http://<服务器IP>:${HTTP_PORT}/
```

后端的 `8000` 只在 compose 网络内暴露给 nginx。

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

# 关停（不删外部数据库；只停止 compose 管理的容器/网络/Redis 卷）
docker compose -f docker-compose.prod.yml --env-file .env.prod down
```

### 配置文件

- `.env.prod` — 真实密钥，**未提交 git**，是 `docker-compose.prod.yml` 默认读取的 env 文件
- `.env.prod.example` — 模板，可提交，用于新机器初始化
- `.env` / `.env.example` — 本地开发配置；`DATABASE_URL` 仍然必填

`docker-compose.prod.yml` 里也可以通过 `EACY_ENV_FILE=...` 覆盖默认 env 文件位置。

## ⚠️ 不要被这些迷惑

仓库曾经存在多套“启动方式”的脚本/文档，当前生产不使用它们。最近已清理掉 `deploy/production/`、`scripts/daemon-start.sh`、`scripts/daemon-stop.sh`、`start-all.bat`、`start-all.ps1` 等旧入口；如果其他历史文档还提到这些名称，应按当前 Docker Compose 方案改写。

`DEPLOYMENT_RUNBOOK.md` 仍保留为裸机/开发参考，不是当前生产事实。生产以本文件、`docker-compose.prod.yml` 和 `deploy/docker/README.md` 为准。

### 数据库 — 外部 PostgreSQL

开发与生产都通过 env 中的 **`DATABASE_URL`**（`postgresql+asyncpg://...`）连接 PostgreSQL。当前 compose 不包含本地 MySQL，也不包含本地 PostgreSQL 服务；本地/生产 compose 只管理 Redis。

## 文档地图

| 文档 | 用途 |
| --- | --- |
| `AGENTS.md`（本文件） | AI 接手必读，描述**当前**怎么跑 |
| `CLAUDE.md` | 与本文件保持一致，供 Claude/Codex 接手使用 |
| `SERVER_DEPLOYMENT_NOTES.md` | 当前服务器状态快照与常用命令 |
| `deploy/docker/README.md` | docker-compose.prod.yml 的详细说明、镜像源、调优、升级顺序 |
| `DEPLOYMENT_RUNBOOK.md` | 裸机/开发参考，**非当前生产入口** |
| `delivery/` | 交付文档与运维手册 |
| `eacy/` | Obsidian 设计文档 |

## 项目结构速览

```text
backend/          FastAPI + Alembic + Celery（ASGI 入口 app.server:app）
frontend_new/     React + Vite + Ant Design（生产构建产物 dist/，由 nginx 容器托管）
deploy/docker/    生产镜像 Dockerfile + nginx 配置
delivery/         交付/运维/业务文档
docker-compose.prod.yml   ← 当前生产部署入口
.env.example              ← 开发环境变量模板（DATABASE_URL 必填）
.env.prod.example         ← 生产 Docker env 模板（DATABASE_URL 指向外部 PostgreSQL）
```

## 核心栈

- 后端：FastAPI（async），驱动 `asyncpg`，迁移 `alembic`
- 队列：Celery，三条队列 `ocr` / `metadata` / `extraction`，broker 是 Redis
- 数据库：外部/远程 PostgreSQL（通过 `DATABASE_URL` 连接）
- 前端：React + Vite + Ant Design，生产由 nginx 提供静态文件并反代 `/api/v1/` 到 `api:8000`
- 对象存储：阿里云 OSS（`DOCUMENT_STORAGE_PROVIDER=oss`）
- OCR：TextIn
- LLM：OpenAI 兼容接口（`OPENAI_API_BASE_URL` 可指向自建/兼容服务）

## 验证服务是否健康

```bash
# 容器
docker compose -f docker-compose.prod.yml --env-file .env.prod ps

# 入口（把端口替换成 .env.prod 的 HTTP_PORT；默认 80）
curl -I http://127.0.0.1:${HTTP_PORT:-80}/

# API（经 nginx 反代）
curl http://127.0.0.1:${HTTP_PORT:-80}/api/v1/auth/

# 开发种子账号（生产上线前应改掉）
# admin@example.com / 123456
# user1@example.com / 123456
```
