# EACY 当前服务器启动与部署说明

最后核对：2026-05-31
项目目录：`/data/eacy/eacy_project`

> 想知道“当前怎么跑”的最快路径：先看根目录 `CLAUDE.md` / `AGENTS.md`，再看 `docker-compose.prod.yml`。

## 当前服务器状态（authoritative）

当前服务器使用 Docker Compose 跑生产，入口 `docker-compose.prod.yml`，env 文件 `.env.prod`。

当前 compose 定义的服务：

```text
redis
migrate
api
worker-metadata
worker-ocr
celery-beat
nginx
worker-extraction
worker-claude-code
```

说明：

- `nginx` 是唯一对外入口，宿主机端口由 `.env.prod` 的 `HTTP_PORT` 决定，映射到容器 `80`。
- `api` 在 compose 网络内监听 `8000`，由 nginx 反代。
- `migrate` 是一次性 Alembic migration job，成功后退出。
- `worker-ocr`、`worker-metadata`、`worker-extraction`、`worker-claude-code` 分别消费 `ocr`、`metadata,maintenance`、`extraction`、`claude-code` 队列。
- `celery-beat` 负责定时维护任务，例如清理长时间 `pending` 的抽取任务。
- 当前 compose **不包含 PostgreSQL 服务**；数据库由 `.env.prod` 的 `DATABASE_URL` 指向外部/远程 PostgreSQL。

## 常用命令

所有命令必须带 `--env-file .env.prod`：

```bash
# 状态
docker compose -f docker-compose.prod.yml --env-file .env.prod ps

# 日志
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f api
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f worker-extraction
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f worker-claude-code

# 重启单个服务
docker compose -f docker-compose.prod.yml --env-file .env.prod restart api
docker compose -f docker-compose.prod.yml --env-file .env.prod restart worker-ocr
docker compose -f docker-compose.prod.yml --env-file .env.prod restart worker-claude-code

# 跑迁移
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm migrate

# 关停（不删除外部数据库）
docker compose -f docker-compose.prod.yml --env-file .env.prod down
```

详细 compose 编排、镜像源、调优、升级顺序见 `deploy/docker/README.md`。

## 健康检查

```bash
# 容器状态
docker compose -f docker-compose.prod.yml --env-file .env.prod ps

# 入口；把端口替换成 .env.prod 的 HTTP_PORT，未设置时默认 80
curl -I http://127.0.0.1:${HTTP_PORT:-80}/

# API，经 nginx 反代
curl http://127.0.0.1:${HTTP_PORT:-80}/api/v1/auth/

# Celery worker 心跳
docker compose -f docker-compose.prod.yml --env-file .env.prod exec worker-ocr \
  celery -A app.workers.celery_app.celery_app inspect ping
```

## 历史遗留说明

仓库曾经存在裸机/systemd、Windows 一键启动、Linux `nohup` daemon 脚本等多套启动方式。当前工作区已清理掉这些旧入口，包括：

- `deploy/production/`
- `scripts/daemon-start.sh`
- `scripts/daemon-stop.sh`
- `scripts/daemon-common.sh`
- `scripts/pg-connection-guard.sh`
- `start-all.bat`
- `start-all.ps1`

如果旧文档或历史记录提到这些文件，不代表当前服务器仍在使用。当前生产只以 Docker Compose 为准。

## 数据与配置边界

- PostgreSQL：外部/远程服务，连接串在 `.env.prod` 的 `DATABASE_URL`。
- Redis：compose 内 `redis` 服务，命名卷 `redis-data`。
- OSS：阿里云 OSS，通过 `DOCUMENT_STORAGE_PROVIDER=oss` 与 `OSS_*` 配置。
- 真实密钥：只放 `.env.prod`，不要提交 git。
