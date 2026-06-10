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
- Claude worker CLI: `NanmiCoder/cc-haha` via GitHub archive

Override these in `.env.prod` if your host has a faster registry or a private mirror:

```env
PYTHON_IMAGE=python:3.11.7-slim
NODE_IMAGE=node:20-alpine
NGINX_IMAGE=nginx:1.27-alpine
REDIS_IMAGE=redis:7-alpine
APT_MIRROR=https://deb.debian.org
PIP_INDEX_URL=https://pypi.org/simple/
NPM_REGISTRY=https://registry.npmjs.org
CLAUDE_CODE_CLI_SOURCE=cc-haha
CC_HAHA_ARCHIVE_URL=https://codeload.github.com/NanmiCoder/cc-haha/tar.gz/refs/heads/main
```

`worker-claude-code` installs `cc-haha` and runs it through `CLAUDE_CODE_BIN=claude-haha`.
Because `cc-haha` speaks the Anthropic Messages API, compose starts an internal `litellm` service that converts Anthropic requests to the OpenAI-compatible endpoint configured by `OPENAI_API_BASE_URL` and `OPENAI_MODEL`.
For best compatibility with a native Anthropic-compatible provider, set `ANTHROPIC_BASE_URL` explicitly and bypass the internal fallback.
If network access is slow from OrbStack, pass proxy variables such as `HTTP_PROXY=http://host.docker.internal:12000` and `ALL_PROXY=socks5h://host.docker.internal:12000`; the Claude Code worker forwards them to `cc-haha`.
`cc-haha` also expects the root config file at `/home/eacy/.claude.json`, so set `CLAUDE_CODE_CONFIG_FILE` to the host-side `.claude.json` path in addition to `CLAUDE_CODE_CREDENTIALS_DIR`. Both mounts are writable because cc-haha backs up and rewrites its config during startup.

## Service Layout

- `redis`: Celery broker/backend and cache dependency, persisted in the `redis-data` named volume.
- `litellm`: internal Anthropic-to-OpenAI-compatible proxy for `cc-haha`; it is not exposed publicly.
- `migrate`: one-shot Alembic migration job.
- `api`: FastAPI via Gunicorn + Uvicorn worker, listening on `api:8000` inside the compose network.
- `worker-ocr`: consumes the `ocr` queue.
- `celery-beat`: schedules periodic maintenance, including stale pending extraction cleanup.
- `worker-metadata`: consumes the `metadata` and `maintenance` queues.
- `worker-extraction`: consumes the `extraction` queue.
- `worker-claude-code`: consumes the `claude-code` queue, uses the cc-haha-enabled backend image, mounts `${CLAUDE_CODE_CREDENTIALS_DIR:-/root/.claude}` to `/home/eacy/.claude`, and mounts `${CLAUDE_CODE_CONFIG_FILE:-/root/.claude.json}` to `/home/eacy/.claude.json`.
- `nginx`: serves the built React app and proxies `/api/v1/` to `api:8000`; this is the only public port.

## Production Sizing

The default sizing is intentionally conservative:

```text
API_WORKERS=2
OCR_CONCURRENCY=1
METADATA_CONCURRENCY=1
EXTRACTION_CONCURRENCY=2
CLAUDE_CODE_CONCURRENCY=1
DB_POOL_SIZE=2
DB_MAX_OVERFLOW=1
```

Estimated database connection ceiling:

```text
(API_WORKERS + OCR_CONCURRENCY + METADATA_CONCURRENCY + EXTRACTION_CONCURRENCY + CLAUDE_CODE_CONCURRENCY)
  * (DB_POOL_SIZE + DB_MAX_OVERFLOW)
```

With defaults, this is `(2 + 1 + 1 + 2 + 1) * 3 = 21` connections. Keep this below PostgreSQL `max_connections` after reserving room for maintenance and backup clients.

## Upgrade Order

Run a database backup before migrations in production.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod stop celery-beat worker-ocr worker-metadata worker-extraction worker-claude-code
docker compose -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm migrate
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d api
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d celery-beat worker-ocr worker-metadata worker-extraction worker-claude-code nginx
```

## Common Operations

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f api
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f worker-extraction
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f worker-claude-code
docker compose -f docker-compose.prod.yml --env-file .env.prod restart api
docker compose -f docker-compose.prod.yml --env-file .env.prod down
```
