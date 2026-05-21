# EACY 当前服务器启动与部署说明

最后核对：2026-05-18
项目目录：`/data/eacy/eacy_project`

> 想知道“当前怎么跑”的最快路径：先看根目录 `CLAUDE.md`。

## 当前服务器状态（authoritative）

**当前服务器使用 Docker Compose 跑生产**，入口 `docker-compose.prod.yml`，env 文件 `.env.prod`。

实际运行的容器（`docker ps`）：

```
eacy_project-nginx-1             eacy-frontend:prod   0.0.0.0:8000->80/tcp
eacy_project-api-1               eacy-backend:prod    8000/tcp (healthy)
eacy_project-worker-ocr-1        eacy-backend:prod    8000/tcp
eacy_project-worker-metadata-1   eacy-backend:prod    8000/tcp
eacy_project-worker-extraction-1 eacy-backend:prod    8000/tcp
eacy_project-postgres-1          postgres:16-alpine   5432/tcp (healthy)
eacy_project-redis-1             redis:7-alpine       6379/tcp (healthy)
```

对外访问入口：`http://<服务器IP>:8000/`（`.env.prod` 里 `HTTP_PORT=8000`，nginx 容器把宿主机 8000 映射到容器 80，再代理到 `api:8000`）。

常用命令（必须带 `--env-file .env.prod`，否则会报 `POSTGRES_PASSWORD missing`）：

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f api
docker compose -f docker-compose.prod.yml --env-file .env.prod restart api
docker compose -f docker-compose.prod.yml --env-file .env.prod down       # 不删卷
```

详细 compose 编排、镜像源、调优、升级顺序见 `deploy/docker/README.md`。

## 历史遗留：`run/` 与 `logs/` 来自旧的 daemon-start.sh

`run/` 目录里的 PID 和 `run/ports.env`、以及 `logs/*.log` 是早期用 `scripts/daemon-start.sh` 跑过留下的残留，**与当前 Docker 部署无关**。当前 Docker 部署的日志请用 `docker compose ... logs` 查看。

`run/ports.env` 历史值（仅供参考，不代表当前）：

```bash
BACKEND_PORT=8000
FRONTEND_PORT=9091
VITE_DEV_API_PROXY_TARGET=http://127.0.0.1:8000
STARTED_AT=2026-04-29T17:12:36+08:00
```

---

下文记录的是 **非当前部署方式**（裸机 / 本机开发 / Windows 开发），用于在没有 Docker 的环境里启项目，或者临时调试。**正在 Docker 跑着的服务器上不要同时启动这些，会端口冲突 / 数据库连接打满。**

## Linux 后台启动方式（开发用，非当前生产）

Linux/SSH 环境主要使用：

```bash
scripts/daemon-start.sh
```

该脚本使用 `nohup` 后台启动三类进程：

### 1. 后端 API

工作目录：`backend`

实际命令形态：

```bash
env ENV=<local|prod> DEBUG=false PYTHONUNBUFFERED=1 \
  .venv/bin/uvicorn app.server:app --host 0.0.0.0 --port <BACKEND_PORT> --workers 1
```

端口来源：

- 优先读取环境变量 `EACY_BACKEND_PORT`
- 否则读取 `.env` 中的 `BACKEND_PORT`
- 默认 `8000`
- 如果端口占用，会自动向后递增查找可用端口

日志与 PID：

```bash
logs/backend.log
run/backend.pid
```

### 2. Celery Worker

工作目录：`backend`

实际命令形态：

```bash
env ENV=<local|prod> DEBUG=false PYTHONUNBUFFERED=1 \
  .venv/bin/celery -A app.workers.celery_app.celery_app worker \
  -n "eacy-eacyproject@%h" \
  -Q ocr,metadata,extraction --loglevel=info --concurrency=4
```

监听队列：

- `ocr`
- `metadata`
- `extraction`

任务定义入口：

```text
backend/app/workers/celery_app.py
backend/app/workers/ocr_tasks.py
backend/app/workers/metadata_tasks.py
backend/app/workers/extraction_tasks.py
```

日志与 PID：

```bash
logs/celery.log
run/celery.pid
```

### 3. 前端 Vite Dev Server

工作目录：`frontend_new`

实际命令形态：

```bash
env VITE_DEV_API_PROXY_TARGET=http://127.0.0.1:<BACKEND_PORT> PYTHONUNBUFFERED=1 \
  /data/eacy/eacy_project/node_modules/.bin/vite --host --port <FRONTEND_PORT> --strictPort
```

端口来源：

- 优先读取环境变量 `EACY_FRONTEND_PORT`
- 默认 `5173`
- 如果端口占用，会自动向后递增查找可用端口
- 上一次实际选中端口为 `9091`

API 代理：

`frontend_new/vite.config.js` 将 `/api/v1` 代理到：

```bash
VITE_DEV_API_PROXY_TARGET
```

日志与 PID：

```bash
logs/frontend.log
run/frontend.pid
```

## Linux 停止方式

使用：

```bash
scripts/daemon-stop.sh
```

停止顺序：

1. 前端
2. Celery
3. 后端

脚本按 `run/*.pid` 停止进程；如果 PID 已不存在，会删除过期 PID 文件。

## 依赖服务

后台启动脚本启动前会检查 Redis：

```bash
127.0.0.1:<REDIS_PORT>
```

`REDIS_PORT` 来自 `.env`，默认 `6379`。如果 Redis 不可用，`scripts/daemon-start.sh` 会直接退出。

数据库为**远程 PostgreSQL**（根目录 `.env` 的 `DATABASE_URL`），无本地 MySQL compose。本地开发仅需 Redis（默认 `6379`）。配置模板见 `.env.example`。

## Windows 一键启动方式（开发用，非当前生产）

Windows 使用：

```bat
start-all.bat
```

它会调用：

```powershell
start-all.ps1
```

PowerShell 脚本行为：

- 默认检查本地 Redis 端口（可用 `-SkipDocker` 跳过）
- 默认执行数据库迁移：`alembic upgrade head`
- 可跳过迁移：`-SkipMigrate`
- 默认启动 Celery
- 可跳过 Celery：`-NoCelery`

Windows 启动的服务命令：

后端：

```powershell
python main.py --env local
```

Celery：

```powershell
celery -A app.workers.celery_app.celery_app worker -Q ocr,metadata,extraction --loglevel=info --pool=solo
```

前端：

```powershell
npm run dev
```

Windows 脚本会打开多个 PowerShell 窗口，停止时需要在各窗口中 `Ctrl+C`。

## 常用操作

检查 PID 是否仍存活：

```bash
for p in $(cat run/backend.pid run/frontend.pid run/celery.pid); do
  if kill -0 "$p" 2>/dev/null; then
    echo "$p alive"
  else
    echo "$p dead"
  fi
done
```

查看服务进程：

```bash
ps -eo pid,ppid,cmd | grep -E 'uvicorn|vite|celery|npm|node|python' | grep -v grep
```

查看端口监听：

```bash
ss -tlnp | grep -E ':8000|:9091|:5173|:6379|:5432'
```

查看日志：

```bash
tail -f logs/backend.log
tail -f logs/celery.log
tail -f logs/frontend.log
```

重新后台启动：

```bash
scripts/daemon-stop.sh
scripts/daemon-start.sh
```

## 目前需要注意的问题

1. `run/*.pid`、`run/ports.env`、`logs/*.log` 都是旧 `daemon-start.sh` 的残留，**不反映当前 Docker 部署状态**。要看现在的日志请用 `docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f <service>`。

2. 后端日志曾出现：

   ```text
   asyncpg.exceptions.TooManyConnectionsError: sorry, too many clients already
   ```

   说明曾经存在数据库连接耗尽。文档页的列表/树/轮询优化已经针对该问题做了部分缓解，但仍建议后续检查数据库连接池、Celery 并发和前端轮询频率。

3. 后端日志曾出现：

   ```text
   UnicodeDecodeError ... response_log.py ... body.decode("utf8")
   ```

   这是响应日志中间件尝试按 UTF-8 解码二进制响应导致的风险，和文件流/导出类接口有关。建议后续让 `ResponseLogMiddleware` 跳过二进制响应体或按 content-type 判断。

4. `daemon-start.sh` 是开发型部署：前端 Vite dev server、后端单 worker uvicorn、Celery 一个 worker 监听三条队列。当前生产已经迁移到 `docker-compose.prod.yml`：前端 nginx 托管 `dist`，后端 gunicorn + 多 uvicorn worker，Celery 按队列拆分，PostgreSQL/Redis 用命名卷持久化。
