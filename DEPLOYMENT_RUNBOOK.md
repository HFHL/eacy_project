# EACY 项目部署与快速运行手册

本文档面向接手项目的 AI 工具或工程师，目标是在另一台服务器上尽快把 EACY 跑起来。

## 1. 项目结构

```text
.
├── backend/          # FastAPI 后端、Alembic 迁移、Celery worker
├── frontend_new/     # React + Vite + Ant Design 前端
├── eacy/             # Obsidian 项目文档
├── ehr_schema.json   # 电子病历夹 schema 导入源之一
└── package.json      # 前端 workspace 脚本
```

核心服务：

- 后端 API：FastAPI，默认端口 `8000`
- 前端：Vite dev 默认端口 `5173`，生产部署使用 `frontend_new/dist`
- 数据库：PostgreSQL，异步驱动 `asyncpg`
- 队列：Redis
- Worker：Celery，队列包括 `ocr`、`metadata`、`extraction`
- 文件存储：阿里云 OSS
- OCR：TextIn
- LLM：OpenAI 兼容接口

## 2. 服务器基础依赖

推荐版本：

- Python `3.11.7`
- Node.js `18+` 或 `20+`
- PostgreSQL `14+`
- Redis `6+`
- Git
- `uv` 或 Poetry（二选一；当前仓库有 `pyproject.toml`/`poetry.lock`）

安装 `uv` 示例：

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

## 3. 拉取代码

```bash
git clone https://github.com/HFHL/eacy_project.git
cd eacy_project
```

如果已经有代码：

```bash
git pull --rebase
```

## 4. 环境变量

后端配置读取根目录 `.env` 或 `backend/.env`。建议在项目根目录创建 `.env`。

最小可运行模板：

```bash
cat > .env <<'ENV'
ENV=local
DEBUG=true
APP_HOST=0.0.0.0
APP_PORT=8000

# PostgreSQL async URL
DATABASE_URL=postgresql+asyncpg://eacy:eacy_password@127.0.0.1:5432/eacy

# Auth
ENABLE_AUTH=true
JWT_SECRET_KEY=replace-with-a-long-random-secret
JWT_ALGORITHM=HS256

# Redis / Celery
CELERY_BROKER_URL=redis://127.0.0.1:6379/1
CELERY_BACKEND_URL=redis://127.0.0.1:6379/2
CELERY_TASK_ALWAYS_EAGER=false
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# OSS document storage
DOCUMENT_STORAGE_PROVIDER=oss
OSS_ACCESS_KEY_ID=replace-me
OSS_ACCESS_KEY_SECRET=replace-me
OSS_BUCKET_NAME=replace-me
OSS_ENDPOINT=oss-cn-shanghai.aliyuncs.com
OSS_REGION=cn-shanghai
OSS_BASE_PREFIX=documents
# OSS_PUBLIC_BASE_URL 可为空；为空时使用 bucket endpoint 生成 URL
OSS_PUBLIC_BASE_URL=

# TextIn OCR
TEXTIN_APP_ID=replace-me
TEXTIN_SECRET_CODE=replace-me
TEXTIN_API_URL=https://api.textin.com/ai/service/v1/pdf_to_markdown
TEXTIN_TIMEOUT_SECONDS=120
DOCUMENT_OCR_AUTO_ENQUEUE=true

# OpenAI-compatible LLM
OPENAI_API_KEY=replace-me
OPENAI_API_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
METADATA_LLM_TIMEOUT_SECONDS=120
METADATA_LLM_TEMPERATURE=0
METADATA_LLM_ENABLE_RULE_FALLBACK=true

# Extraction strategy: simple 可不走 LLM；llm/agent 依赖 OPENAI 配置
EACY_EXTRACTION_STRATEGY=simple
EXTRACTION_LLM_TIMEOUT_SECONDS=180
EXTRACTION_LLM_TEMPERATURE=0
ENV
```

注意：

- 不要提交 `.env`。
- 生产环境必须替换 `JWT_SECRET_KEY`。
- 如果 LLM 接口返回 `403 Forbidden`，检查 `OPENAI_API_KEY`、`OPENAI_API_BASE_URL`、模型权限，并重启 API 和 worker。

## 5. 初始化数据库与 Redis

### 5.1 本机服务方式

创建数据库：

```bash
createdb eacy
# 或使用 psql 手工创建用户和库
```

启动 Redis：

```bash
redis-server
```

### 5.2 Docker 快速启动依赖

如果只想用 Docker 跑依赖服务：

```bash
docker run -d --name eacy-postgres \
  -e POSTGRES_USER=eacy \
  -e POSTGRES_PASSWORD=eacy_password \
  -e POSTGRES_DB=eacy \
  -p 5432:5432 \
  postgres:15

docker run -d --name eacy-redis -p 6379:6379 redis:7
```

## 6. 后端安装、迁移与启动

进入后端：

```bash
cd backend
```

### 6.1 安装依赖

推荐使用 Poetry：

```bash
poetry install
```

如果使用 `uv`：

```bash
uv venv --python 3.11.7
uv pip install -e .
```

### 6.2 数据库迁移

```bash
poetry run alembic upgrade head
# 或
uv run alembic upgrade head
```

迁移会创建用户表并写入 5 个简单账号：

| 邮箱 | 密码 |
| --- | --- |
| `admin@example.com` | `123456` |
| `user1@example.com` | `123456` |
| `user2@example.com` | `123456` |
| `user3@example.com` | `123456` |
| `user4@example.com` | `123456` |

### 6.3 启动 API

开发/调试：

```bash
poetry run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
# 或
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

生产建议：

```bash
poetry run gunicorn main:app \
  -k uvicorn.workers.UvicornWorker \
  -b 0.0.0.0:8000 \
  --workers 2 \
  --timeout 180
```

健康检查：

```bash
curl http://127.0.0.1:8000/api/v1/auth/
```

## 7. Celery Worker 启动

至少启动一个 worker 监听全部业务队列：

```bash
cd backend
poetry run celery -A app.workers.celery_app worker \
  -Q ocr,metadata,extraction \
  --loglevel=info \
  --concurrency=2
```

也可以拆成多个 worker：

```bash
poetry run celery -A app.workers.celery_app worker -Q ocr --loglevel=info --concurrency=2
poetry run celery -A app.workers.celery_app worker -Q metadata --loglevel=info --concurrency=1
poetry run celery -A app.workers.celery_app worker -Q extraction --loglevel=info --concurrency=1
```

配置变化后需要重启：

- API key / LLM base url 变化：重启 API、metadata worker、extraction worker
- TextIn / OCR 相关变化：重启 API、ocr worker
- 数据库/Redis/JWT 变化：重启 API 和所有 worker

## 8. 前端安装与启动

进入前端目录：

```bash
cd frontend_new
npm install
```

### 8.1 开发运行

同域代理推荐保持默认 `VITE_API_BASE_URL=/api/v1`，由 Vite 代理到后端。

```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

浏览器打开：

```text
http://服务器IP:5173
```

### 8.2 生产构建

```bash
npm run build
```

构建产物：

```text
frontend_new/dist
```

## 9. Nginx 生产部署示例

将前端 `dist` 作为静态目录，并把 `/api/` 反向代理到后端。

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /opt/eacy_project/frontend_new/dist;
    index index.html;

    client_max_body_size 200m;

    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Reload：

```bash
nginx -t && systemctl reload nginx
```

## 10. Systemd 示例

### 10.1 API service

`/etc/systemd/system/eacy-api.service`：

```ini
[Unit]
Description=EACY FastAPI API
After=network.target

[Service]
WorkingDirectory=/opt/eacy_project/backend
EnvironmentFile=/opt/eacy_project/.env
ExecStart=/usr/local/bin/poetry run gunicorn main:app -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000 --workers 2 --timeout 180
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 10.2 Worker service

`/etc/systemd/system/eacy-worker.service`：

```ini
[Unit]
Description=EACY Celery Worker
After=network.target redis.service

[Service]
WorkingDirectory=/opt/eacy_project/backend
EnvironmentFile=/opt/eacy_project/.env
ExecStart=/usr/local/bin/poetry run celery -A app.workers.celery_app worker -Q ocr,metadata,extraction --loglevel=info --concurrency=2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启动：

```bash
systemctl daemon-reload
systemctl enable --now eacy-api eacy-worker
systemctl status eacy-api eacy-worker
```

## 11. 验证清单

### 11.1 登录

打开前端，使用：

```text
user1@example.com / 123456
```

或：

```text
admin@example.com / 123456
```

### 11.2 API

```bash
curl http://127.0.0.1:8000/api/v1/auth/
```

### 11.3 前端构建

```bash
cd frontend_new
npm run build
```

### 11.4 后端语法

```bash
cd backend
python -m compileall app core -q
```

### 11.5 PDF 预览

PDF 预览不使用 iframe，走 PDF.js canvas。前端请求：

```text
/api/v1/documents/{document_id}/stream?access_token=...
```

后端必须返回 `200 application/pdf`，不能返回 `302` 到 OSS。若出现 OSS CORS，说明后端未重启到最新代码。

## 12. 常见问题

### 12.1 登录 401

- 检查 `ENABLE_AUTH=true`
- 检查 `JWT_SECRET_KEY` 是否和签发 token 时一致
- 修改 token 逻辑或 JWT 配置后，必须重新登录

### 12.2 PDF 预览 401

- 重新登录，清理旧 token
- 前端强刷或重启 Vite
- 确认请求 URL 是 `/stream?access_token=...`

### 12.3 PDF 预览跳 OSS 导致 CORS

- 后端 API 没重启到最新代码
- `/documents/{id}/stream` 必须由后端代理 OSS 内容并返回 `StreamingResponse`

### 12.4 LLM 403

- 检查 `OPENAI_API_KEY`
- 检查 `OPENAI_API_BASE_URL`
- 检查模型名和账号权限
- 重启 API、metadata worker、extraction worker

### 12.5 OCR 失败

- 检查 `TEXTIN_APP_ID` / `TEXTIN_SECRET_CODE`
- 检查上传文件 OSS URL 能否被 TextIn 访问
- 中文文件名已做 URL 编码；如仍失败，查看 worker 日志

### 12.6 Worker 死锁或任务失败

- extraction worker 已对部分瞬时数据库错误做重试
- 大批量抽取建议降低 `--concurrency`
- 如果数据库出现 deadlock，优先重启失败任务，不要手工改数据

## 13. 另一个 AI 接手时的建议顺序

1. `git pull --rebase`
2. 阅读本文档和 `eacy/` 下 Obsidian 设计文档
3. 配 `.env`
4. `alembic upgrade head`
5. 启 API
6. 启 Celery worker
7. 启前端或部署 `dist`
8. 用 `user1@example.com / 123456` 登录验证
9. 上传一份 PDF，确认 OCR、归档、电子病历夹抽取、PDF 溯源预览链路

## 14. 当前关键账号

开发种子账号：

```text
admin@example.com / 123456
user1@example.com / 123456
user2@example.com / 123456
user3@example.com / 123456
user4@example.com / 123456
```

生产环境上线前请修改或删除简单密码账号。
