# EACY Docker Production Deployment

This directory contains Docker production assets. The compose entrypoint is at the repository root:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d postgres redis
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm migrate
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d api celery-beat worker-ocr worker-metadata worker-extraction nginx
```

Create `.env.prod` from `.env.prod.example` before running the stack. Do not commit real secrets.

If you want to validate the compose file before creating real secrets:

```bash
EACY_ENV_FILE=.env.prod.example docker compose -f docker-compose.prod.yml --env-file .env.prod.example config
```

## China Mirror Defaults

The production files default to China-friendly mirrors:

- Base images: `docker.m.daocloud.io/library/...`
- Debian apt: `https://mirrors.aliyun.com`
- PyPI: `https://mirrors.aliyun.com/pypi/simple/`
- npm: `https://registry.npmmirror.com`

Override these in `.env.prod` if your host has a faster registry or a private mirror:

```env
PYTHON_IMAGE=python:3.11.7-slim
NODE_IMAGE=node:20-alpine
NGINX_IMAGE=nginx:1.27-alpine
POSTGRES_IMAGE=postgres:16-alpine
REDIS_IMAGE=redis:7-alpine
APT_MIRROR=https://deb.debian.org
PIP_INDEX_URL=https://pypi.org/simple/
NPM_REGISTRY=https://registry.npmjs.org
```

## Service Layout

- `nginx`: serves the built React app and proxies `/api/v1/` to `api:8000`.
- `api`: FastAPI via Gunicorn + Uvicorn worker.
- `worker-ocr`: consumes the `ocr` queue.
- `celery-beat`: schedules periodic maintenance (default: daily 03:00 Asia/Shanghai, abandon stale pending extraction jobs).
- `worker-metadata`: consumes the `metadata` and `maintenance` queues.
- `worker-extraction`: consumes the `extraction` queue.
- `migrate`: one-shot Alembic migration job.
- `postgres` and `redis`: internal dependency services with named volumes.

## Production Sizing

The default sizing is intentionally conservative:

```text
API_WORKERS=2
OCR_CONCURRENCY=1
METADATA_CONCURRENCY=1
EXTRACTION_CONCURRENCY=2
DB_POOL_SIZE=2
DB_MAX_OVERFLOW=1
```

Estimated database connection ceiling:

```text
(API_WORKERS + OCR_CONCURRENCY + METADATA_CONCURRENCY + EXTRACTION_CONCURRENCY)
  * (DB_POOL_SIZE + DB_MAX_OVERFLOW)
```

With defaults, this is `(2 + 1 + 1 + 2) * 3 = 18` connections. Keep this below PostgreSQL `max_connections` after reserving room for maintenance and backup clients.

## Upgrade Order

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod stop celery-beat worker-ocr worker-metadata worker-extraction
docker compose -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm migrate
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d api
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d celery-beat worker-ocr worker-metadata worker-extraction nginx
```

Run a database backup before migrations in production.
