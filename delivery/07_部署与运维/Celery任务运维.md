---
type: deploy
module: 部署运维
status: draft
audience: [ops]
code_path:
  - docker-compose.prod.yml
  - backend/app/workers/celery_app.py
  - backend/app/workers/ocr_tasks.py
  - backend/app/workers/metadata_tasks.py
  - backend/app/workers/extraction_tasks.py
last_verified_commit: 132a529
last_verified_date: 2026-05-31
owner: 运维
---

# Celery 任务运维

> EACY 把异步任务拆为三条业务队列：`ocr` / `metadata` / `extraction`。当前生产用 Docker Compose 分别运行 `worker-ocr`、`worker-metadata`、`worker-extraction`，并用 `celery-beat` 执行周期维护任务。

## 一、队列与任务速查

| 队列 | 任务名 | 主要外部依赖 | 单任务平均成本 |
|---|---|---|---|
| `ocr` | `eacy.ocr.process_document_ocr` | TextIn OCR / OSS | I/O 重，受 TextIn 超时控制（默认 120s） |
| `metadata` | `eacy.metadata.extract_document_metadata` | LLM | LLM 调用，单文档秒级 |
| `maintenance` | `eacy.maintenance.abandon_stale_pending_extraction_jobs` | DB | Celery Beat 触发，清理超时 pending 抽取任务 |
| `extraction` | `eacy.extraction.process_extraction_job` | LLM / OSS / DB | 任务级，重 LLM |

任务路由声明在 [`celery_app.py`](../../backend/app/workers/celery_app.py)。

## 二、生产启动与重启

当前生产 worker 由 `docker-compose.prod.yml` 管理：

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d celery-beat worker-ocr worker-metadata worker-extraction
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

单独重启：

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod restart worker-ocr
docker compose -f docker-compose.prod.yml --env-file .env.prod restart worker-metadata
docker compose -f docker-compose.prod.yml --env-file .env.prod restart worker-extraction
docker compose -f docker-compose.prod.yml --env-file .env.prod restart celery-beat
```

compose 内等价命令：

```bash
# OCR worker
celery -A app.workers.celery_app.celery_app worker \
  -Q ocr --loglevel=info --concurrency=${OCR_CONCURRENCY:-1} \
  --max-tasks-per-child=${CELERY_MAX_TASKS_PER_CHILD:-20} -n eacy-ocr@%h

# Metadata + maintenance worker
celery -A app.workers.celery_app.celery_app worker \
  -Q metadata,maintenance --loglevel=info --concurrency=${METADATA_CONCURRENCY:-1} \
  --max-tasks-per-child=${CELERY_MAX_TASKS_PER_CHILD:-20} -n eacy-metadata@%h

# Extraction worker
celery -A app.workers.celery_app.celery_app worker \
  -Q extraction --loglevel=info --concurrency=${EXTRACTION_CONCURRENCY:-2} \
  --max-tasks-per-child=${CELERY_MAX_TASKS_PER_CHILD:-20} -n eacy-extraction@%h
```

### 开发环境单 worker

调试时可在 `backend/` 下启动一个 worker 监听全部队列：

```bash
celery -A app.workers.celery_app.celery_app worker \
  -Q ocr,metadata,maintenance,extraction --loglevel=info --concurrency=2
```

Windows 调试需要追加 `--pool=solo`。

## 三、并发与资源建议

| Worker | 默认并发 | 调整变量 | 理由 |
|---|---:|---|---|
| `worker-ocr` | 1 | `OCR_CONCURRENCY` | TextIn 限频；并发高反而失败率上升 |
| `worker-metadata` | 1 | `METADATA_CONCURRENCY` | 单条 LLM，开高了瞬时 burst LLM 配额 |
| `worker-extraction` | 2 | `EXTRACTION_CONCURRENCY` | 单任务串行多次 LLM，多并发能压平等待 |

> [!warning] 加并发前先看 DB 连接池
> 每个 worker 进程会占用 `DB_POOL_SIZE + DB_MAX_OVERFLOW` 上限的连接。估算公式见 [[环境变量清单#二数据库]]。

## 四、查看任务状态

### 4.1 队列长度

生产 `.env.prod.example` 使用 Redis DB 11 作为 broker：

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec redis redis-cli -n 11 llen ocr
docker compose -f docker-compose.prod.yml --env-file .env.prod exec redis redis-cli -n 11 llen metadata
docker compose -f docker-compose.prod.yml --env-file .env.prod exec redis redis-cli -n 11 llen maintenance
docker compose -f docker-compose.prod.yml --env-file .env.prod exec redis redis-cli -n 11 llen extraction
```

数字一直 > 0 且不下降，优先查对应 worker 日志。

### 4.2 Worker 心跳与活跃任务

```bash
# 检查 worker 是否在线
docker compose -f docker-compose.prod.yml --env-file .env.prod exec worker-ocr \
  celery -A app.workers.celery_app.celery_app inspect ping

# 查看正在执行的任务
docker compose -f docker-compose.prod.yml --env-file .env.prod exec worker-extraction \
  celery -A app.workers.celery_app.celery_app inspect active

# 查看预留中任务
docker compose -f docker-compose.prod.yml --env-file .env.prod exec worker-extraction \
  celery -A app.workers.celery_app.celery_app inspect reserved

# 查看 worker 监听队列
docker compose -f docker-compose.prod.yml --env-file .env.prod exec worker-extraction \
  celery -A app.workers.celery_app.celery_app inspect active_queues
```

### 4.3 单任务结果

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api python - <<'PY'
from app.workers.celery_app import celery_app
r = celery_app.AsyncResult("<task_id>")
print(r.status, r.result)
PY
```

### 4.4 日志

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f worker-ocr
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f worker-metadata
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f worker-extraction
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f celery-beat
```

关键字检索建议：`ERROR`、`Retry`、`missed heartbeat`、`TooManyConnectionsError`。

## 五、任务卡死处理

### 5.1 现象判断

- `inspect active` 显示同一任务 ID 持续 N 分钟未变化
- 日志卡在某次外部 API 调用（TextIn / LLM）
- 队列长度持续上升，对应 worker 无新日志

### 5.2 处理顺序

```bash
# 1. 优雅停止 worker，Celery 会在可恢复任务上交给 broker 重新派发
docker compose -f docker-compose.prod.yml --env-file .env.prod stop worker-extraction

# 2. 重启 worker
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d worker-extraction

# 3. 极端情况下手动撤销任务
docker compose -f docker-compose.prod.yml --env-file .env.prod exec worker-extraction \
  celery -A app.workers.celery_app.celery_app control revoke <task_id> --terminate
```

> [!warning] `--terminate` 会终止执行该任务的子进程
> 已写入 DB 的中间状态不会自动回滚，请检查相关业务表（如 `extraction_job.status`）是否需要通过业务重试恢复。

### 5.3 队列阻塞清理

> [!warning] 清空队列会丢失未消费任务
> 仅在确认任务可重发或可忽略时使用。

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec redis redis-cli -n 11 llen ocr
docker compose -f docker-compose.prod.yml --env-file .env.prod exec redis redis-cli -n 11 del ocr
```

更安全的方式是临时停 API 入队（`DOCUMENT_OCR_AUTO_ENQUEUE=false`），让 worker 消化完积压再恢复。

## 六、重试策略

`extraction` 任务在代码层已对部分瞬时数据库/网络错误做指数退避重试，详见 `backend/app/workers/extraction_tasks.py`。其他队列默认无统一显式重试，失败即终态，由前端或用户重新发起。

Celery Beat 的 stale pending 清理由这些变量控制：

- `STALE_PENDING_ABANDON_ENABLED`
- `STALE_PENDING_ABANDON_HOURS`
- `STALE_PENDING_ABANDON_LIMIT`
- `STALE_PENDING_ABANDON_CRON_HOUR`
- `STALE_PENDING_ABANDON_CRON_MINUTE`

## 七、扩容路径

按“瓶颈 → 扩容方向”：

1. **OCR 慢且 TextIn 不限流**：提高 `OCR_CONCURRENCY` 后重启 `worker-ocr`
2. **抽取慢且 LLM 配额足**：提高 `EXTRACTION_CONCURRENCY`，或增加另一组连接同一 broker/DB 的 worker
3. **DB 成为瓶颈**：先扩 DB 连接数并调整 SQLAlchemy 池，再考虑加 worker
4. **多机部署**：新机器也用同一镜像/配置连接同一 Redis broker 与外部 PostgreSQL，注意只保留一个 `celery-beat`

## 相关文档

- [[环境变量清单]]
- [[监控与告警]]
- [[常见故障排查]]
- [[首次部署手册]]
- [[升级流程]]
