---
title: EACY开发计划 6.3 Celery 后台任务实施路径
tags:
  - eacy
  - backend
  - celery
  - extraction
status: draft
created: 2026-04-28
---

# EACY 开发计划 6.3 Celery 后台任务实施路径

> [!summary]
> 当前后端已经具备 Celery / Redis 依赖和 `extraction_jobs` / `extraction_runs` 数据模型，但业务处理仍在 FastAPI 请求内同步完成。下一步应把耗时、可重试、需要进度追踪的流程迁移到 Celery；普通 CRUD、短事务和用户立即需要结果的查询不进入 Celery。

关联文档：

- [[EACY开发计划]]
- [[Eacy后端开发文档]]
- [[EACY架构总览]]
- [[异步任务进度追踪实现方案]]

## 当前代码结论

当前项目状态：

- `backend/pyproject.toml` 已包含 `celery = "^5.3.6"`、`redis = "^5.0.1"`。
- `backend/core/config.py` 已有 `CELERY_BROKER_URL`、`CELERY_BACKEND_URL`、`REDIS_HOST`、`REDIS_PORT`。
- `backend/docker/docker-compose.yml` 只启动 MySQL 和 Redis，没有 RabbitMQ；默认 `CELERY_BROKER_URL` 却是 `amqp://user:bitnami@localhost:5672/`，当前本地服务与默认 broker 配置不一致。
- `backend/app/workers/` 目前只有空包，尚未实现 Celery app、task、worker 入口。
- `backend/app/services/extraction_service.py` 的 `create_and_process_job()` 会在 HTTP 请求内同步完成：创建 job、创建 run、调用 `MockExtractor`、写入结构化字段、把 job 置为 `completed`。
- `backend/app/api/v1/extraction/router.py` 的 `POST /api/v1/extraction-jobs` 返回 `202`，但实际已经同步处理完成，不是真异步。
- `backend/app/services/document_service.py` 在文档归档时会创建 `pending` 的 `extraction_jobs`，但没有 worker 消费这些 pending job。
- Redis 当前已经被缓存层使用，也可以作为 Celery broker/result backend；本地文档里已经记录 Memurai 兼容 Redis 可用。

## fastapi-boilerplate-master 可参考内容

`fastapi-boilerplate-master` 只有最小 Celery 初始化示例：

```text
fastapi-boilerplate-master/celery_task/__init__.py
fastapi-boilerplate-master/celery_task/tasks/__init__.py
```

可直接参考的点：

- 用 `Celery("worker", broker=config.CELERY_BROKER_URL, backend=config.CELERY_BACKEND_URL)` 统一创建 Celery app。
- 从 `core.config import config` 读取 broker/backend 配置。
- 打开 `task_track_started=True`，让任务能进入 started 状态。

不建议直接照搬的点：

- 示例 task route 是 `worker.celery_worker.test_celery`，与当前 EACY 包结构不匹配。
- boilerplate 没有处理异步 SQLAlchemy session、事务、业务 job 状态流转、幂等、重试、取消。
- boilerplate 默认 broker 是 RabbitMQ，但当前 EACY 本地 docker 只有 Redis；除非明确引入 RabbitMQ，否则阶段 6.3 应统一用 Redis broker。

结论：boilerplate 只能作为 Celery app 初始化参考，业务 task 需要按 EACY 的 `app/workers/`、`app/services/`、`extraction_jobs` 模型重新设计。

## Celery 应该负责什么

进入 Celery 的判断标准：

- 单次执行可能超过 1-2 秒。
- 依赖 OCR、LLM、外部 API、文件解析、批量数据库写入。
- 需要失败重试、错误记录、任务进度、后台排队。
- 用户只需要拿到 `job_id`，后续通过轮询、SSE 或 WebSocket 看状态。

当前最应该迁移到 Celery 的功能：

| 功能 | 当前状态 | Celery 任务 |
|---|---|---|
| 文档 OCR | `documents.ocr_status` 已有字段，但未实现真实处理 | `process_document_ocr(document_id)` |
| 文档元数据抽取 | `documents.meta_status` 已有字段 | `extract_document_metadata(document_id)` |
| 患者 EHR 抽取 | `ExtractionService.create_and_process_job()` 当前同步执行 | `process_extraction_job(job_id)` |
| 项目 CRF 抽取 | 已有 `project_id/project_patient_id/context_id/schema_version_id` 字段支撑 | `process_extraction_job(job_id)` 按 job_type 分派 |
| 抽取任务重试 | 当前 `retry_job()` 同步重跑 | `retry_extraction_job(job_id)` 或重新入队同一 task |
| pending job 扫描补偿 | `DocumentService.archive_to_patient()` 会创建 pending job，但无人消费 | `scan_pending_extraction_jobs()`，后续可用 Celery Beat |
| 批量导入患者/文档 | 前端已有批量导入模板资源 | `import_patients_from_file(import_job_id)` |
| 数据集导出 | 当前暂不实现，但后续会耗时 | `export_project_dataset(export_job_id)` |
| LLM 调用日志和失败诊断 | 阶段 6.3 待办 | 在 Celery task 内落 `extraction_runs.error_message/raw_output_json` |

暂时不需要 Celery 的功能：

- 患者、文档、模板、科研项目的普通 CRUD。
- EHR/CRF 单字段人工编辑、选择候选值、查看证据。
- 登录、鉴权、健康检查、后台状态查询。
- 小规模列表查询和详情查询。
- 只做数据库短事务、没有外部调用的状态转换。

## 推荐实现形态

目标目录：

```text
backend/app/workers/
├── __init__.py
├── celery_app.py
├── extraction_tasks.py
├── document_tasks.py
└── maintenance_tasks.py
```

Celery app：

```python
from celery import Celery
from core.config import config

celery_app = Celery(
    "eacy_worker",
    broker=config.CELERY_BROKER_URL,
    backend=config.CELERY_BACKEND_URL,
    include=[
        "app.workers.extraction_tasks",
        "app.workers.document_tasks",
        "app.workers.maintenance_tasks",
    ],
)

celery_app.conf.update(
    task_track_started=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Shanghai",
)
```

阶段 6.3 建议先统一使用 Redis：

```env
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_BACKEND_URL=redis://localhost:6379/2
```

原因：

- 当前本地已有 Redis/Memurai 验证记录。
- docker-compose 已有 Redis，没有 RabbitMQ。
- 早期任务量不大，Redis broker 足够降低接入成本。
- 后续如果需要更强消息可靠性，再切 RabbitMQ，业务 task 入口不需要大改。

## 抽取任务流转

`POST /api/v1/extraction-jobs` 应改为只创建任务并入队：

```text
API 请求
  -> ExtractionService.create_job(status=pending, progress=0)
  -> process_extraction_job.delay(job.id)
  -> 返回 202 + job_id
```

Celery worker 执行：

```text
process_extraction_job(job_id)
  -> 读取 job
  -> 如果 job.status in completed/cancelled，直接跳过
  -> job.status = running, progress = 5, started_at = now()
  -> 创建 extraction_run
  -> 根据 job_type 分派 OCR / EHR / CRF / metadata adapter
  -> 写 raw_output_json / parsed_output_json
  -> 写 field_value_events / field_value_evidence / field_current_values
  -> run.status = completed
  -> job.status = completed, progress = 100, finished_at = now()
```

失败处理：

```text
异常
  -> run.status = failed
  -> run.error_message = str(error)
  -> job.status = failed
  -> job.error_message = str(error)
  -> Celery 按配置 retry，超过次数后保持 failed
```

取消处理：

- `POST /extraction-jobs/{job_id}/cancel` 先把 DB 状态改为 `cancelled`。
- worker 每个关键阶段读取一次 job 状态；发现 `cancelled` 后停止后续写入。
- 第一阶段不强求 revoke 正在执行的外部 OCR/LLM 请求，先保证不会继续落结构化结果。

幂等规则：

- `process_extraction_job(job_id)` 必须按 `job_id` 幂等。
- 已完成 job 不重复写字段事件。
- retry 创建新的 `extraction_runs.run_no`，但要能区分同一 job 的多次 run。
- 对字段值写入，继续沿用 `field_value_events.extraction_run_id` 追踪来源。

## 文档 OCR 与抽取拆分

建议把文档处理拆成两层，不要把所有逻辑塞进一个大 task：

```text
process_document_ocr(document_id)
  -> 更新 documents.ocr_status
  -> 写 documents.ocr_text / ocr_payload_json
  -> 成功后可按需要触发 extract_document_metadata

process_extraction_job(job_id)
  -> 消费 extraction_jobs
  -> 从 document.ocr_text / ocr_payload_json 和 schema 生成结构化候选值
```

这样可以支持：

- 文档先 OCR，后续多次按不同 schema 抽取。
- 同一 OCR 结果复用到患者 EHR 和科研 CRF。
- OCR 失败不污染字段抽取 run。

## API 与前端状态约定

`POST /api/v1/extraction-jobs`：

- 返回 `202 Accepted`。
- 响应体中的 `status` 通常是 `pending` 或 `queued`，不应立即变成 `completed`。

`GET /api/v1/extraction-jobs/{job_id}`：

- 前端轮询该接口获取状态。
- 阶段 6.3 可先轮询；SSE/WebSocket 放到后续阶段。

状态建议：

```text
pending
queued
running
completed
failed
cancelled
```

进度建议：

```text
0   created
5   worker started
20  document loaded / OCR started
50  OCR or LLM finished
80  parsed and validated
95  values persisted
100 completed
```

## 本阶段实施步骤

1. 统一 Celery broker/backend 配置为 Redis，并更新 `.env.example` 或 README。
2. 新建 `app/workers/celery_app.py`，不要沿用 boilerplate 的 `celery_task/` 顶层目录。
3. 新建 `app/workers/extraction_tasks.py`，实现 `process_extraction_job(job_id)`。
4. 把 `ExtractionService.create_and_process_job()` 拆成：
   - `create_job()`：API 内使用，只建 pending job。
   - `process_job(job_id)`：worker 内使用，包含原同步处理逻辑。
5. 修改 `POST /api/v1/extraction-jobs`：创建 job 后调用 Celery delay，返回 202。
6. 修改 `retry_job()`：只重置状态并重新入队，不在 API 请求内同步重跑。
7. 让 `DocumentService.archive_to_patient()` 创建 pending job 后也入队，或先只创建 pending，由补偿扫描 task 入队。
8. 增加 worker 启动命令文档：

```bash
cd backend
celery -A app.workers.celery_app.celery_app worker --loglevel=info -Q extraction,documents
```

9. 增加测试：
   - task eager 模式下验证 `process_extraction_job()` 能把 job 从 pending 改为 completed。
   - 失败时 job/run 写入 `failed` 和 `error_message`。
   - completed/cancelled job 重复执行不会重复写结构化字段。

## 验收标准

- `POST /api/v1/extraction-jobs` 不再阻塞等待抽取完成。
- 新建 job 后可通过 worker 从 `pending/queued` 进入 `running/completed`。
- worker 停止时，新 job 保持 pending/queued，不影响 FastAPI 可用性。
- worker 恢复后，可以继续消费 pending/queued job。
- 失败任务能记录 `job.error_message` 和 `run.error_message`。
- retry 会生成新的 run，并最终更新同一个 job 的状态。
- 文档归档创建的 pending extraction job 有明确消费路径。

## 后续增强

- 引入 Celery Beat 做 pending job 扫描、超时任务修复、定期清理。
- 根据任务类型拆队列：`ocr`、`llm`、`extraction`、`exports`。
- 对 LLM/OCR 外部调用增加超时、限流、熔断。
- 增加任务事件表或审计日志，记录更细粒度步骤。
- 前端从轮询升级到 SSE/WebSocket 进度推送。
