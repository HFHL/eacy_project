# EACY Docker Production Deployment

This directory contains the Docker production assets. The authoritative compose entrypoint is at the repository root:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Create `.env.prod` from `.env.prod.example` before running the stack. Do not commit real secrets.

`docker-compose.prod.yml` starts Redis, the migration job, API, Celery workers, Celery Beat, and nginx. It does **not** start PostgreSQL; set `DATABASE_URL` in `.env.prod` to the external/remote PostgreSQL instance.

If you want to validate the compose file before using real secrets:

```bash
EACY_ENV_FILE=.env.prod.example docker compose -f docker-compose.prod.yml --env-file .env.prod.example config --services
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
REDIS_IMAGE=redis:7-alpine
APT_MIRROR=https://deb.debian.org
PIP_INDEX_URL=https://pypi.org/simple/
NPM_REGISTRY=https://registry.npmjs.org
```

## Service Layout

- `redis`: Celery broker/backend and cache dependency, persisted in the `redis-data` named volume.
- `migrate`: one-shot Alembic migration job.
- `api`: FastAPI via Gunicorn + Uvicorn worker, listening on `api:8000` inside the compose network.
- `worker-ocr`: consumes the `ocr` queue.
- `celery-beat`: schedules periodic maintenance, including stale pending extraction cleanup.
- `worker-metadata`: consumes the `metadata` and `maintenance` queues.
- `worker-extraction`: consumes the `extraction` queue.
- `nginx`: serves the built React app and proxies `/api/v1/` to `api:8000`; this is the only public port.

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

Run a database backup before migrations in production.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod stop celery-beat worker-ocr worker-metadata worker-extraction
docker compose -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm migrate
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d api
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d celery-beat worker-ocr worker-metadata worker-extraction nginx
```

## Common Operations

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f api
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f worker-extraction
docker compose -f docker-compose.prod.yml --env-file .env.prod restart api
docker compose -f docker-compose.prod.yml --env-file .env.prod down
```
