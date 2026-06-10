# EACY 项目部署与快速运行手册

> ⚠️ 当前生产的唯一权威入口是 `docker-compose.prod.yml`。
> 本文只保留“快速跑起来”的操作摘要；更详细的生产部署、升级、运维请看 `AGENTS.md` / `CLAUDE.md`、`SERVER_DEPLOYMENT_NOTES.md`、`deploy/docker/README.md` 与 `delivery/07_部署与运维/`。

## 1. 当前生产部署方式

生产使用 Docker Compose：

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

当前 compose 服务：

```text
redis
migrate
api
worker-extraction
worker-metadata
worker-ocr
celery-beat
nginx
```

说明：

- PostgreSQL 不由 compose 启动，必须通过 `.env.prod` 的 `DATABASE_URL=postgresql+asyncpg://...` 指向外部/远程库。
- Redis 由 compose 管理，生产 broker/backend 模板使用 Redis DB 11/12。
- nginx 是唯一对外入口，宿主机端口由 `HTTP_PORT` 决定。
- 后端 ASGI 入口是 `app.server:app`。

## 2. 生产首次部署摘要

```bash
cd /data/eacy/eacy_project
cp .env.prod.example .env.prod
# 编辑 .env.prod，至少填写 DATABASE_URL / JWT_SECRET_KEY / OSS_* / TEXTIN_* / OPENAI_* / HTTP_PORT

docker compose -f docker-compose.prod.yml --env-file .env.prod config --services
docker compose -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm migrate
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d api celery-beat worker-ocr worker-metadata worker-extraction nginx
```

健康检查：

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
curl -I http://127.0.0.1:${HTTP_PORT:-80}/
curl http://127.0.0.1:${HTTP_PORT:-80}/api/v1/auth/
```

## 3. 生产升级摘要

升级前先备份外部 PostgreSQL。

```bash
cd /data/eacy/eacy_project
git fetch --all
git pull --rebase

docker compose -f docker-compose.prod.yml --env-file .env.prod stop celery-beat worker-ocr worker-metadata worker-extraction
docker compose -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm migrate
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d api
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d celery-beat worker-ocr worker-metadata worker-extraction nginx
```

## 4. 本地开发快速运行

本地开发仍需要一个 PostgreSQL 连接串，建议指向远程/开发库；本地只需 Redis。

```bash
cp .env.example .env
# 编辑 .env，填写 DATABASE_URL、JWT/OSS/TextIn/LLM 等配置
```

后端：

```bash
cd backend
poetry install
poetry run alembic upgrade head
poetry run python main.py --env local --debug
```

或直接启动 ASGI 入口：

```bash
cd backend
poetry run uvicorn app.server:app --host 0.0.0.0 --port 8000 --reload
```

Celery：

```bash
cd backend
poetry run celery -A app.workers.celery_app.celery_app worker \
  -Q ocr,metadata,maintenance,extraction --loglevel=info --concurrency=2
```

前端：

```bash
npm install
npm run dev -w xidong-crf-prototype-new -- --host 0.0.0.0 --port 5173
```

## 5. 常见检查

```bash
# compose 服务状态
docker compose -f docker-compose.prod.yml --env-file .env.prod ps

# API 日志
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f api

# Worker 日志
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f worker-extraction

# Redis 队列长度（生产模板 DB 11）
docker compose -f docker-compose.prod.yml --env-file .env.prod exec redis redis-cli -n 11 llen ocr
docker compose -f docker-compose.prod.yml --env-file .env.prod exec redis redis-cli -n 11 llen metadata
docker compose -f docker-compose.prod.yml --env-file .env.prod exec redis redis-cli -n 11 llen extraction
```

## 6. 开发种子账号

```text
admin@example.com / 123456
user1@example.com / 123456
user2@example.com / 123456
user3@example.com / 123456
user4@example.com / 123456
```

生产环境上线前请修改或删除简单密码账号。
