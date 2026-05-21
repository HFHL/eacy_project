# EACY 本地启动命令

本文档说明如何把 EACY 本地开发环境完整启动起来。完整环境至少包含：

1. **远程 PostgreSQL**（根目录 `.env` 的 `DATABASE_URL`）
2. **本地 Redis**（Celery broker / 缓存）
3. 后端 FastAPI
4. Celery workers（`ocr` / `metadata` / `extraction`）
5. 前端 Vite

> 只启动后端 API 不够。文档上传后 OCR/元数据抽取依赖 Celery worker；worker 未启动时任务会堆在 Redis 队列里。

首次使用：复制 `.env.example` 为 `.env`，填写 `DATABASE_URL=postgresql+asyncpg://...`。

---

## 一键启动（Windows PowerShell）

```powershell
cd <项目根目录>
npm run start:all -- -SkipDocker
```

跳过迁移或不启动 Celery：

```powershell
npm run start:all -- -SkipDocker -SkipMigrate
npm run start:all -- -SkipDocker -NoCelery
```

> 日常不要加 `-NoCelery`，否则上传后不会自动 OCR/元数据抽取。

---

## 手动启动：macOS / Linux

```bash
cd /Users/apple/project/eacy_project
```

### 1. 确认 `.env` 与 Redis

```env
DATABASE_URL=postgresql+asyncpg://...@HOST:PORT/DATABASE
```

检查远程库端口：

```bash
nc -zv HOST PORT
```

检查本地 Redis：

```bash
nc -zv 127.0.0.1 6379
redis-cli -n 1 llen ocr
```

### 2. 迁移

```bash
cd backend
./.venv/bin/alembic upgrade head
```

### 3. 后端 / Celery / 前端

```bash
# API
./.venv/bin/python main.py --env local

# Workers（各开一个终端，或合并队列）
./.venv/bin/python -m celery -A app.workers.celery_app.celery_app worker -Q ocr --loglevel=info
./.venv/bin/python -m celery -A app.workers.celery_app.celery_app worker -Q metadata --loglevel=info
./.venv/bin/python -m celery -A app.workers.celery_app.celery_app worker -Q extraction --loglevel=info

# 前端（项目根）
npm run dev
```

- API：<http://localhost:8000/docs>
- 前端：<http://localhost:5173>

也可用 `scripts/daemon-start.sh` 后台一键起 API + Celery + Vite（见 `CLAUDE.md`）。

---

## 推荐启动顺序

1. 填写 `.env` 中 `DATABASE_URL`（远程 PostgreSQL）
2. 启动本地 Redis
3. `alembic upgrade head`
4. 后端 API
5. OCR + Metadata（+ 可选 Extraction）worker
6. 前端

上传后无 OCR/元数据结果时，优先检查 Celery worker 与 Redis 队列。
