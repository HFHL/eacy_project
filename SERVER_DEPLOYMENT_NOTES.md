# EACY 当前服务器启动与部署说明

生成时间：2026-04-30
项目目录：`/data/eacy/eacy_project`

## 当前服务器状态

本次检查发现 `run/` 目录中保留了上一轮后台启动的 PID 和端口记录：

- 后端 PID：`run/backend.pid`
- 前端 PID：`run/frontend.pid`
- Celery PID：`run/celery.pid`
- 端口记录：`run/ports.env`

但这些 PID 对应的进程当前都已经不存在，说明服务目前不是通过这些 PID 文件处于运行状态，或者上一轮服务已退出但 PID 文件未清理。

`run/ports.env` 记录的上一轮启动信息：

```bash
BACKEND_PORT=8000
FRONTEND_PORT=9091
VITE_DEV_API_PROXY_TARGET=http://127.0.0.1:8000
STARTED_AT=2026-04-29T17:12:36+08:00
```

日志位置：

- 后端日志：`logs/backend.log`
- Celery 日志：`logs/celery.log`
- 前端日志：`logs/frontend.log`

日志中可见上一轮服务曾经启动并处理请求；Celery 日志后段出现 `missed heartbeat`，后端日志中曾出现数据库连接过多和响应日志解码异常。

## Linux 后台启动方式

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

项目提供了开发用 Docker Compose：

```bash
backend/docker/docker-compose.yml
```

包含：

- MySQL 8.0，端口 `3306`
- Redis 6.2，端口 `6379`

启动依赖服务：

```bash
docker compose -f backend/docker/docker-compose.yml up -d
```

停止依赖服务：

```bash
docker compose -f backend/docker/docker-compose.yml down
```

当前 `.env` 中还配置了远程 PostgreSQL 连接、Redis、Celery broker/result backend。文档中不记录具体密码或密钥。

## Windows 一键启动方式

Windows 使用：

```bat
start-all.bat
```

它会调用：

```powershell
start-all.ps1
```

PowerShell 脚本行为：

- 可选启动 Docker 中的 MySQL/Redis：`-WithDocker`
- 可跳过 Docker：`-SkipDocker`
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
ss -tlnp | grep -E ':8000|:9091|:5173|:6379|:3306|:5432'
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

1. `run/*.pid` 当前是过期 PID。重新启动前建议先执行：

   ```bash
   scripts/daemon-stop.sh
   ```

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

4. 当前 Linux 启动方式是开发型部署：前端使用 Vite dev server，后端使用单 worker uvicorn，Celery 使用一个 worker 监听三条队列。正式生产建议改为：

   - 前端 `npm run build` 后由 Nginx 托管 `dist`
   - 后端由 systemd/supervisor 管理 uvicorn/gunicorn
   - Celery 按队列拆分 worker，并单独配置并发
   - Redis、数据库使用独立稳定服务
