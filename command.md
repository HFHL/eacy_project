# EACY 本地启动命令

本文档说明如何把 EACY 本地开发环境完整启动起来。完整环境至少包含：

1. 远程 PostgreSQL 数据库（通过根目录 `.env` 的 `DATABASE_URL` 连接）
2. 本地 Redis
3. 后端 FastAPI
4. Celery OCR worker
5. Celery metadata worker
6. 可选：Celery extraction worker
7. 前端 Vite

> 关键提醒：只启动后端 API 不够。文档上传后 OCR/元数据抽取依赖 Celery worker；如果 worker 没启动，任务会堆在 Redis 队列里，前端会一直停留在待处理/解析中状态。

---

## 一键启动（Windows PowerShell 推荐）

当前项目使用远程 PostgreSQL，不需要启动本地 MySQL。只需要保证 `.env` 中的 `DATABASE_URL` 可访问，并启动本地 Redis。

在项目根目录执行：

```powershell
cd C:\Users\Administrator\Desktop\code\eacy_project
npm run start:all -- -SkipDocker
```

如果你没有本地 Redis，可以用 Docker 启动依赖服务；但当前脚本的 `-WithDocker` 会按 `backend/docker/docker-compose.yml` 同时启动 MySQL 和 Redis。当前项目实际使用远程 PostgreSQL，所以这个 MySQL 通常不会被后端使用。

```powershell
cd C:\Users\Administrator\Desktop\code\eacy_project
npm run start:all -- -WithDocker
```

如果只想启动 Redis，建议单独启动本机 Redis 或单独运行 Redis 容器，不必启动项目 compose 里的 MySQL。

跳过数据库迁移：

```powershell
cd C:\Users\Administrator\Desktop\code\eacy_project
npm run start:all -- -SkipDocker -SkipMigrate
```

不启动 Celery worker：

```powershell
cd C:\Users\Administrator\Desktop\code\eacy_project
npm run start:all -- -SkipDocker -NoCelery
```

> 不建议日常使用 `-NoCelery`，否则上传文档后不会自动完成 OCR 和元数据抽取。

---

## 手动启动：macOS / Linux

以下命令以当前仓库路径为例：

```bash
cd /Users/apple/project/eacy_project
```

### 1. 确认远程数据库和本地 Redis

当前项目使用根目录 `.env` 中的远程 PostgreSQL：

```env
DATABASE_URL=postgresql+asyncpg://...@115.175.28.60:5433/EACY_new
```

不需要启动本地 MySQL，也不需要检查 `3306`。

确认远程数据库端口可访问：

```bash
nc -zv 115.175.28.60 5433
```

确认本地 Redis 可用：

```bash
nc -zv 127.0.0.1 6379
```

如果没有本地 Redis，可以只启动 Docker Redis，或使用你本机的 Redis 服务。项目自带的 `backend/docker/docker-compose.yml` 同时包含 MySQL 和 Redis；在当前远程数据库模式下，不建议为了 Redis 去启动其中的 MySQL。

也可以检查 Redis 队列：

```bash
redis-cli -n 1 llen ocr
redis-cli -n 1 llen metadata
redis-cli -n 1 llen extraction
```

### 2. 执行数据库迁移

优先使用项目虚拟环境：

```bash
cd /Users/apple/project/eacy_project/backend
./.venv/bin/alembic upgrade head
```

如果使用 Poetry：

```bash
cd /Users/apple/project/eacy_project/backend
poetry run alembic upgrade head
```

### 3. 启动后端 API

新开一个终端窗口：

```bash
cd /Users/apple/project/eacy_project/backend
./.venv/bin/python main.py --env local
```

访问：

```text
http://localhost:8000/docs
```

> 在受限环境下，`--debug` 会启用文件监听，可能报 `Operation not permitted`。如果遇到该问题，用不带 `--debug` 的命令启动。

### 4. 启动 OCR worker

新开一个终端窗口：

```bash
cd /Users/apple/project/eacy_project/backend
./.venv/bin/python -m celery -A app.workers.celery_app.celery_app worker -Q ocr --loglevel=info
```

OCR worker 负责消费 `ocr` 队列，调用 OCR 服务，并在 OCR 完成后继续投递 metadata 任务。

### 5. 启动 Metadata worker

新开一个终端窗口：

```bash
cd /Users/apple/project/eacy_project/backend
./.venv/bin/python -m celery -A app.workers.celery_app.celery_app worker -Q metadata --loglevel=info
```

Metadata worker 负责消费 `metadata` 队列，抽取患者姓名、性别、年龄、住院号、文档类型等元数据。分组功能依赖这些元数据。

### 6. 可选：启动 Extraction worker

如果需要处理 EHR/CRF 结构化字段抽取任务，新开一个终端窗口：

```bash
cd /Users/apple/project/eacy_project/backend
./.venv/bin/python -m celery -A app.workers.celery_app.celery_app worker -Q extraction --loglevel=info
```

### 7. 启动前端

新开一个终端窗口：

```bash
cd /Users/apple/project/eacy_project
npm run dev
```

访问：

```text
http://localhost:5173
```

---

## 手动启动：Windows PowerShell

当前项目使用远程 PostgreSQL，不需要启动本地 MySQL。以下命令假设项目路径为：

```powershell
cd C:\Users\Administrator\Desktop\code\eacy_project
```

### 1. 检查 Redis

```powershell
$client = New-Object System.Net.Sockets.TcpClient
$iar = $client.BeginConnect('127.0.0.1', 6379, $null, $null)
$ok = $iar.AsyncWaitHandle.WaitOne(2000, $false)
if ($ok) { $client.EndConnect($iar); 'Redis TcpConnect=OK' } else { 'Redis TcpConnect=TIMEOUT' }
$client.Close()
```

### 2. 检查远程 PostgreSQL

```powershell
$client = New-Object System.Net.Sockets.TcpClient
$iar = $client.BeginConnect('115.175.28.60', 5433, $null, $null)
$ok = $iar.AsyncWaitHandle.WaitOne(3000, $false)
if ($ok) { $client.EndConnect($iar); 'Remote PostgreSQL TcpConnect=OK' } else { 'Remote PostgreSQL TcpConnect=TIMEOUT' }
$client.Close()
```

### 3. 清理端口

后端默认端口：

```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force }
```

前端默认端口：

```powershell
Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force }
```

### 4. 数据库迁移

使用 Poetry：

```powershell
cd C:\Users\Administrator\Desktop\code\eacy_project\backend
poetry run alembic upgrade head
```

不用 Poetry：

```powershell
cd C:\Users\Administrator\Desktop\code\eacy_project\backend
alembic upgrade head
```

### 5. 启动后端 API

新开一个 PowerShell 窗口：

```powershell
cd C:\Users\Administrator\Desktop\code\eacy_project\backend
poetry run python main.py --env local
```

不用 Poetry：

```powershell
cd C:\Users\Administrator\Desktop\code\eacy_project\backend
python main.py --env local
```

访问：

```text
http://localhost:8000/docs
```

### 6. 启动 Celery workers

#### 方案 A：一个窗口启动全部队列（Windows 推荐）

新开一个 PowerShell 窗口：

```powershell
cd C:\Users\Administrator\Desktop\code\eacy_project\backend
poetry run celery -A app.workers.celery_app.celery_app worker -Q ocr,metadata,extraction --loglevel=info --pool=solo
```

不用 Poetry：

```powershell
cd C:\Users\Administrator\Desktop\code\eacy_project\backend
celery -A app.workers.celery_app.celery_app worker -Q ocr,metadata,extraction --loglevel=info --pool=solo
```

#### 方案 B：分别启动队列

OCR：

```powershell
cd C:\Users\Administrator\Desktop\code\eacy_project\backend
poetry run celery -A app.workers.celery_app.celery_app worker -Q ocr --loglevel=info --pool=solo
```

Metadata：

```powershell
cd C:\Users\Administrator\Desktop\code\eacy_project\backend
poetry run celery -A app.workers.celery_app.celery_app worker -Q metadata --loglevel=info --pool=solo
```

Extraction：

```powershell
cd C:\Users\Administrator\Desktop\code\eacy_project\backend
poetry run celery -A app.workers.celery_app.celery_app worker -Q extraction --loglevel=info --pool=solo
```

### 7. 启动前端

新开一个 PowerShell 窗口：

```powershell
cd C:\Users\Administrator\Desktop\code\eacy_project
npm run dev
```

访问：

```text
http://localhost:5173
```

---

## 常用检查命令

### 检查后端 API

```bash
curl -I http://127.0.0.1:8000/docs
```

应返回：

```text
HTTP/1.1 200 OK
```

### 检查 Redis 队列是否堆积

```bash
redis-cli -n 1 llen ocr
redis-cli -n 1 llen metadata
redis-cli -n 1 llen extraction
```

正常情况下：

- 上传后 `ocr` 可能短暂增加。
- OCR 完成后 `metadata` 可能短暂增加。
- worker 正常时队列会逐渐回到 `0`。

如果 `ocr` 或 `metadata` 长时间大于 `0`，说明对应 Celery worker 没启动或执行失败。

### 检查分组树接口

```bash
curl http://127.0.0.1:8000/api/v1/documents/v2/tree
```

重点看：

```json
{
  "counts": {
    "parse_total": 0,
    "todo_total": 8,
    "archived_total": 1
  }
}
```

- `parse_total > 0`：还有文档未完成 OCR/元数据。
- `todo_total > 0`：有待归档分组。
- `archived_total > 0`：已有归档文档。

### 手动触发单文档 OCR

后端和 Celery 都启动后：

```text
POST http://localhost:8000/api/v1/documents/{document_id}/ocr
```

### 手动触发单文档元数据抽取

OCR 完成后：

```text
POST http://localhost:8000/api/v1/documents/{document_id}/metadata
```

---

## 环境变量重点

上传后自动进入 OCR 队列需要开启：

```env
DOCUMENT_OCR_AUTO_ENQUEUE=true
```

Celery 默认使用：

```env
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_BACKEND_URL=redis://localhost:6379/2
```

后端默认端口：

```env
APP_PORT=8000
```

前端默认端口：

```text
5173
```

---

## 推荐日常启动顺序

1. 远程 PostgreSQL 数据库（通过根目录 `.env` 的 `DATABASE_URL` 连接）
2. 本地 Redis
3. 数据库迁移 `alembic upgrade head`
4. 后端 API
5. OCR worker
6. Metadata worker
7. 可选 Extraction worker
8. 前端

如果上传文档后没有 OCR/元数据结果，优先检查第 5、6 步是否启动。
