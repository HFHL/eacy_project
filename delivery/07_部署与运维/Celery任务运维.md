---
type: deploy
module: 部署运维
status: draft
audience: [ops]
code_path:
  - backend/app/workers/celery_app.py
  - backend/app/workers/ocr_tasks.py
  - backend/app/workers/metadata_tasks.py
  - backend/app/workers/extraction_tasks.py
  - deploy/production/systemd
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 运维
---

# Celery 任务运维

> EACY 把异步任务拆为三条队列：`ocr` / `metadata` / `extraction`，分别消费 OCR、元数据抽取、字段抽取任务。Broker / Backend 默认 Redis。本文覆盖启动、并发、状态查看、卡死处理。

## 一、队列与任务速查

| 队列 | 任务名 | 主要外部依赖 | 单任务平均成本 |
|---|---|---|---|
| `ocr` | `eacy.ocr.process_document_ocr` | TextIn OCR | I/O 重，受 TextIn 超时控制（默认 120s） |
| `metadata` | `eacy.metadata.extract_document_metadata` | LLM | LLM 调用，单文档秒级 |
| `extraction` | `eacy.extraction.process_extraction_job` | LLM（按 schema 字段循环） | 任务级，重 LLM |

任务路由声明在 [`celery_app.py`](../../backend/app/workers/celery_app.py)。

## 二、启动命令（生产 systemd）

生产推荐三个 unit 分别管理，已由 `deploy/production/install-systemd-nginx.sh` 安装。

```bash
sudo systemctl start  eacy-celery-ocr
sudo systemctl start  eacy-celery-metadata
sudo systemctl start  eacy-celery-extraction

sudo systemctl status eacy-celery-ocr eacy-celery-metadata eacy-celery-extraction
sudo systemctl restart eacy-celery-ocr  # 单独重启
```

unit 内部的等价命令（生产默认参数）：

```bash
# OCR worker（每次只跑 1 个 OCR 调用，避免 TextIn 限流）
poetry run celery -A app.workers.celery_app.celery_app worker \
  -Q ocr --loglevel=info --concurrency=1

# Metadata worker（LLM 调用，单并发即可）
poetry run celery -A app.workers.celery_app.celery_app worker \
  -Q metadata --loglevel=info --concurrency=1

# Extraction worker（单任务时间长，可适当提并发；deploy/production 默认 2）
poetry run celery -A app.workers.celery_app.celery_app worker \
  -Q extraction --loglevel=info --concurrency=2
```

> [!info] Windows 用 `--pool=solo`
> Windows 下需要在命令末尾加 `--pool=solo`，否则 Celery 在 Win 不稳定。Linux 默认 prefork 即可。

### 开发环境单 worker

调试时一个 worker 监听全部队列即可：

```bash
poetry run celery -A app.workers.celery_app.celery_app worker \
  -Q ocr,metadata,extraction --loglevel=info --concurrency=2
```

## 三、并发与资源建议

### 3.1 并发参数

| Worker | `--concurrency` | 理由 |
|---|---|---|
| `ocr` | 1（高峰 2） | TextIn 限频；并发高反而失败率上升 |
| `metadata` | 1~2 | 单条 LLM，开高了瞬时 burst LLM 配额 |
| `extraction` | 2~4 | 单任务串行多次 LLM，多并发能压平等待 |

### 3.2 资源建议（每队列一台 worker 进程）

| Worker | CPU | 内存 | 网络 | 备注 |
|---|---|---|---|---|
| `ocr` | 1 core | 1 GiB | 高（OSS 下载 + TextIn 上传） | I/O 主导，CPU 占用低 |
| `metadata` | 1 core | 1 GiB | 中（LLM 文本） | 调高并发前先看 LLM 配额 |
| `extraction` | 2 core | 2 GiB | 中 | 串行多次 LLM 调用，并发越高内存涨幅越大 |

> [!warning] 加并发前先看 DB 连接池
> 每个 Celery worker 进程会占用 `DB_POOL_SIZE + DB_MAX_OVERFLOW` 上限的连接。`总连接数 = API workers + 各队列 concurrency`，必须小于 DB `max_connections`。详见 [[常见故障排查#数据库连接耗尽]]。

## 四、查看任务状态

### 4.1 队列长度

```bash
redis-cli -n 1 llen ocr
redis-cli -n 1 llen metadata
redis-cli -n 1 llen extraction
```

数字一直 > 0 → worker 没消费上，立刻查 worker 状态。

### 4.2 Worker 心跳与活跃任务

```bash
cd /opt/eacy_project/backend

# 检查所有 worker 是否在线
poetry run celery -A app.workers.celery_app.celery_app inspect ping

# 查看正在执行的任务
poetry run celery -A app.workers.celery_app.celery_app inspect active

# 查看预留中（已派发但未开始）
poetry run celery -A app.workers.celery_app.celery_app inspect reserved

# 队列长度（celery 自带，不依赖 redis-cli）
poetry run celery -A app.workers.celery_app.celery_app inspect active_queues
```

### 4.3 单任务结果（按 task_id）

```bash
poetry run python - <<'PY'
from app.workers.celery_app import celery_app
r = celery_app.AsyncResult("<task_id>")
print(r.status, r.result)
PY
```

### 4.4 日志位置

| 部署方式 | 路径 |
|---|---|
| systemd | `journalctl -u eacy-celery-ocr -f`（其他 unit 同理） |
| `scripts/daemon-start.sh` | `logs/celery.log` |

关键字检索建议：`ERROR`、`Retry`、`missed heartbeat`、`TooManyConnectionsError`。

## 五、任务卡死处理

### 5.1 现象判断

- `inspect active` 显示同一任务 ID 持续 N 分钟未变化
- 日志卡在某次外部 API 调用（TextIn / LLM）

### 5.2 处理顺序（从轻到重）

```bash
# 1. 优雅停止 worker（等当前任务完成后退出），Celery 会把任务回到 broker
sudo systemctl stop eacy-celery-extraction

# 2. 若仍未退出，强制重启 unit
sudo systemctl restart eacy-celery-extraction

# 3. 极端情况下手动撤销任务（task_id 来自 active）
poetry run celery -A app.workers.celery_app.celery_app control revoke <task_id> --terminate
```

> [!warning] `--terminate` 会发 SIGTERM 给执行该任务的子进程
> 已写入 DB 的中间状态不会自动回滚，请检查相关业务表（如 `extraction_job.status`）是否需要手动改回 `queued`。

### 5.3 队列阻塞清理

> [!warning] 清空队列会丢失未消费任务
> 仅在确认任务可重发或可忽略时使用。

```bash
# 查看队列长度后再决定
redis-cli -n 1 llen ocr
redis-cli -n 1 del ocr   # 谨慎
```

更安全的方式是临时停 API 入队（`DOCUMENT_OCR_AUTO_ENQUEUE=false`），让 worker 消化完积压再恢复。

## 六、重试策略

extraction 任务在代码层已对部分瞬时数据库错误做 3 次指数退避重试（详见 `app/workers/extraction_tasks.py` 与 `DEPLOYMENT_RUNBOOK.md` §12.6）。其他队列默认无显式重试，失败即终态 → 由前端 / 用户重新发起。

## 七、扩容路径

按"瓶颈 → 扩容方向"：

1. **OCR 慢且 TextIn 不限流**：提 `eacy-celery-ocr` 并发到 2
2. **抽取慢且 LLM 配额足**：提 `eacy-celery-extraction` 并发到 4，或加第二台 worker 机
3. **DB 成为瓶颈**：先扩 DB 连接数 + 调 SQLAlchemy 池，再考虑加 worker
4. **多机部署**：在新机上同样安装 systemd unit，连同一 broker / DB 即可水平扩展

## 相关文档

- [[环境变量清单]]
- [[监控与告警]]
- [[常见故障排查]]
- [[首次部署手册]]
- [[升级流程]]
