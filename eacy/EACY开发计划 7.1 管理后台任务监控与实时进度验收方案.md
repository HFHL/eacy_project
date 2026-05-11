---
title: EACY开发计划 7.1 管理后台任务监控与实时进度验收方案
tags:
  - eacy/admin
  - eacy/backend
  - eacy/frontend
  - eacy/progress
  - eacy/acceptance
status: draft
created: 2026-05-11
aliases:
  - Admin 任务监控实施计划
  - 管理后台实时进度验收方案
---

# EACY开发计划 7.1 管理后台任务监控与实时进度验收方案

> [!summary]
> 当前 `/admin` 前端页面已经有任务监控、任务详情、LLM 调用明细和重提入口的 UI 雏形，但后端 `admin` 模块只有状态接口，前端 `src/api/admin.js` 仍是空数据。后端数据层已经具备 `async_task_batches / async_task_items / async_task_events` 三层进度表，以及 `extraction_jobs / extraction_runs` 抽取业务表。实施目标是先用轮询打通全局任务监控闭环，再按需要补 SSE 实时流。

相关文档：

- [[异步任务进度追踪实现方案]]
- [[EACY开发计划 6.3 Celery 后台任务实施路径]]
- [[EACY开发计划 6.3.5 Extraction Worker - 抽取任务与落库实施计划]]
- [[EACY 后端接口文档/EACY 后端接口文档 - Extraction Jobs]]
- [[EACY 后端接口文档/EACY 后端接口文档 - Patients 与 EHR]]
- [[EACY 后端接口文档/EACY 后端接口文档 - Projects 与 CRF]]
- [[Eacy前端开发文档]]
- [[Eacy后端开发文档]]

## 当前结论

### 已具备能力

- 数据库迁移已应用到 `20260507_1200`，包含统一进度表：
  - `async_task_batches`
  - `async_task_items`
  - `async_task_events`
- `extraction_jobs` 和 `extraction_runs` 已有大量历史数据，可用于管理页任务列表的兼容展示。
- `TaskProgressService` 已能创建 batch/item/event、聚合 batch 状态、查询 batch payload 和事件。
- `ExtractionService._process_job()` 已在关键阶段写入进度：
  - `worker_started` 10%
  - `load_context` 20%
  - `load_document` 30%
  - `call_extractor` 45%
  - `validate_output` 65%
  - `persist_values` 90%
  - `completed` 100%
- 已有可轮询接口：
  - `GET /api/v1/task-batches/{batch_id}`
  - `GET /api/v1/task-batches/{batch_id}/events`
- 患者 EHR 批量更新和项目 CRF 批量更新接口已返回 `batch_id`：
  - `POST /api/v1/patients/{patient_id}/ehr/update-folder`
  - `POST /api/v1/research/{project_id}/patients/{project_patient_id}/crf/update-folder`

### 当前缺口

- `/api/v1/admin` 只有 `GET /admin/` 状态接口，缺少真实管理接口。
- `frontend_new/src/api/admin.js` 全部返回 empty mock，管理页不会请求真实后端。
- `frontend_new/src/hooks/useExtractionProgressSSE.js` 是空实现，无法实时接收事件。
- 当前数据库里 `async_task_batches` 有少量记录，但 `async_task_items` 和 `async_task_events` 为空；历史任务主要沉淀在 `extraction_jobs / extraction_runs`。
- 管理页需要同时兼容两类数据源：
  - 新任务：`async_task_batches/items/events`
  - 历史任务：`extraction_jobs/runs`
- 状态枚举不统一：
  - `extraction_jobs`: `pending / running / completed / failed / cancelled`
  - `async_task_items`: `created / queued / running / succeeded / failed / cancelled`
  - `async_task_batches`: `created / queued / running / succeeded / completed_with_errors / failed / cancelled`

## 目标

### 产品目标

1. 管理员进入 `/admin` 后，可以看到全局任务概览、任务列表和任务状态分布。
2. 管理员可以按任务类型、状态、患者、项目、模板、任务 ID 搜索。
3. 管理员可以打开任务详情，查看：
   - 批次摘要
   - 子任务列表
   - 每个 extraction job 的 run 信息
   - 错误信息
   - 抽取字段数与证据摘要
   - 进度事件流
4. 管理员可以对失败、等待、疑似卡住的任务执行重新提交。
5. 对正在执行的任务，页面能在不刷新浏览器的情况下更新进度。

### 技术目标

1. 第一阶段用轮询实现稳定可用，不依赖长连接。
2. 第二阶段补 SSE，复用 `async_task_events` 作为事件源。
3. 后端提供 admin 专用聚合接口，不让前端直接拼多个业务接口。
4. 统一状态映射，管理页不暴露内部混乱枚举。
5. 兼容历史 `extraction_jobs`，避免管理页只显示新 batch。

## 总体方案

### 数据源策略

管理后台任务列表以 `async_task_batches` 为主，以 `extraction_jobs` 为兼容补充：

```text
admin extraction tasks
  ├── 新批量任务：async_task_batches + async_task_items + async_task_events
  └── 历史/单 job：extraction_jobs + extraction_runs
```

去重规则：

- 如果 `extraction_jobs.id` 已出现在 `async_task_items.extraction_job_id`，列表中归属到 batch，不再作为独立历史 job 展示。
- 没有关联 item 的 `extraction_jobs` 作为 `source_table = extraction_jobs` 的兼容任务展示。

### 状态映射

后端 admin API 对前端统一输出：

| 输出状态 | batch 状态 | item 状态 | job 状态 | 说明 |
|---|---|---|---|---|
| `pending` | `created` | `created` | `pending` | 已创建未执行 |
| `queued` | `queued` | `queued` | `pending` 且有 celery id | 已入队 |
| `running` | `running` | `running` | `running` | 执行中 |
| `completed` | `succeeded` | `succeeded` | `completed` | 全部成功 |
| `completed_with_errors` | `completed_with_errors` | - | - | 部分成功 |
| `failed` | `failed` | `failed` | `failed` | 失败 |
| `cancelled` | `cancelled` | `cancelled` | `cancelled` | 已取消 |
| `stale` | running 但 heartbeat 超时 | running 但 heartbeat 超时 | running 但 updated_at 超时 | 疑似卡住 |

`stale` 不建议直接写回业务表，先作为 admin API 的派生状态输出。

### 实时策略

第一阶段使用轮询：

```text
任务列表：每 5 秒轮询 /api/v1/admin/extraction-tasks
任务详情：每 2 秒轮询 /api/v1/admin/extraction-tasks/{task_id}
事件流：每 2 秒轮询 /api/v1/admin/extraction-tasks/{task_id}/events?after_id=...
```

第二阶段增加 SSE：

```text
GET /api/v1/admin/extraction-tasks/{task_id}/stream
```

实现方式：

- 每 1 秒查询 `async_task_events` 增量。
- 输出 Server-Sent Events。
- 当任务进入终态后发送 `terminal` 事件并关闭连接。
- 如果任务没有 `async_task_events`，返回兼容事件：当前 job 状态快照。

## 实施阶段

## 阶段 1：后端 admin 任务查询接口

### 目标

先让 `/admin` 能看到真实任务列表和任务详情，使用轮询即可。

### 后端接口

新增 `backend/app/api/v1/admin/router.py` 接口：

```text
GET /api/v1/admin/stats
GET /api/v1/admin/extraction-tasks
GET /api/v1/admin/extraction-tasks/{task_id}
GET /api/v1/admin/extraction-tasks/{task_id}/events
POST /api/v1/admin/extraction-tasks/{task_id}/resubmit
```

### `GET /api/v1/admin/stats`

返回管理概览：

```json
{
  "overview": {
    "total_users": 0,
    "total_patients": 0,
    "total_documents": 0,
    "total_projects": 0,
    "total_templates": 0,
    "active_tasks": 0
  },
  "tasks": {
    "pending": 0,
    "queued": 0,
    "running": 0,
    "completed": 0,
    "completed_with_errors": 0,
    "failed": 0,
    "cancelled": 0,
    "stale": 0
  }
}
```

验收重点：

- 不因某个业务表为空而 500。
- 统计口径与列表过滤结果基本一致。

### `GET /api/v1/admin/extraction-tasks`

查询参数：

| 参数 | 说明 |
|---|---|
| `task_type` | `project_crf / patient_ehr / targeted / all` |
| `status` | 统一状态 |
| `keyword` | 模糊搜索任务 ID、患者、项目、模板 |
| `limit` | 默认 100，最大 500 |
| `offset` | 默认 0 |

返回结构：

```json
{
  "items": [
    {
      "id": "batch-or-job-id",
      "source_table": "async_task_batches",
      "task_type": "project_crf",
      "status": "running",
      "progress": 45,
      "project_id": "...",
      "project_name": "...",
      "patient_id": "...",
      "patient_name": "...",
      "schema_name": "...",
      "target_section": "...",
      "document_count": 3,
      "completed_count": 1,
      "failed_count": 0,
      "running_count": 1,
      "pending_count": 1,
      "started_at": "...",
      "finished_at": null,
      "updated_at": "...",
      "error_message": null,
      "primary_job_id": "..."
    }
  ],
  "total": 1,
  "type_counts": {
    "all": 1,
    "project_crf": 1,
    "patient_ehr": 0,
    "targeted": 0
  },
  "status_counts": {
    "running": 1
  }
}
```

实现建议：

- 新增 `AdminTaskService`，不要把复杂 SQL 写在 router。
- 对 batch 数据优先输出聚合视角。
- 对历史 job 输出 `document_count = 1`。
- `type_counts/status_counts` 应在过滤 `keyword` 前后明确口径；建议与当前列表同过滤口径一致。

### `GET /api/v1/admin/extraction-tasks/{task_id}`

返回详情：

```json
{
  "summary": {
    "id": "...",
    "source_table": "async_task_batches",
    "task_type": "project_crf",
    "status": "running",
    "progress": 45,
    "completed_count": 1,
    "failed_count": 0,
    "running_count": 1,
    "pending_count": 1,
    "error_message": null
  },
  "jobs": [
    {
      "id": "...",
      "document_id": "...",
      "document_name": "...",
      "patient_id": "...",
      "patient_name": "...",
      "status": "running",
      "progress": 45,
      "stage": "call_extractor",
      "stage_label": "AI 抽取中",
      "attempt_count": 1,
      "max_attempts": 3,
      "last_error": null,
      "extraction_run": {
        "id": "...",
        "status": "running",
        "model_name": "LlmEhrExtractor",
        "prompt_version": "langgraph-ehr-json-v1",
        "target_mode": "targeted_section",
        "target_path": "...",
        "field_candidate_count": 12,
        "field_with_evidence_count": 8,
        "extracted_fields": []
      }
    }
  ],
  "llm_source": "db_or_run",
  "llm_calls": []
}
```

第一阶段不强制实现真实 `llm_calls` 表查询；如果没有 `llm_call_logs`，从 `extraction_runs.raw_output_json / parsed_output_json.validation_log` 提供简化诊断即可。

### `GET /api/v1/admin/extraction-tasks/{task_id}/events`

查询参数：

| 参数 | 说明 |
|---|---|
| `after_id` | 增量拉取 |
| `limit` | 默认 200 |

返回结构：

```json
[
  {
    "id": "...",
    "task_id": "...",
    "item_id": "...",
    "type": "progress",
    "status": "running",
    "progress": 45,
    "node": "call_extractor",
    "message": "正在执行结构化抽取",
    "ts": "2026-05-11T10:00:00"
  }
]
```

兼容规则：

- batch 任务：读取 `async_task_events`。
- 历史 job：从 `extraction_jobs` 和最新 `extraction_runs` 生成一个 synthetic event。

### `POST /api/v1/admin/extraction-tasks/{task_id}/resubmit`

请求：

```json
{
  "source": "batch|job|auto",
  "only_failed": true
}
```

行为：

- 如果是单个 job：
  - `failed` 调 `ExtractionService.retry_job(job_id)` 或重置后入队。
  - `pending/stale` 重新 `_enqueue_extraction_task(job_id)`。
- 如果是 batch：
  - 默认只重提 `failed / queued 超时 / running 超时 / pending` 的 item。
  - 不重复提交 `succeeded/completed`。

返回：

```json
{
  "task_id": "...",
  "resubmitted_job_ids": ["..."],
  "skipped_job_ids": ["..."],
  "message": "已重新提交 2 个任务"
}
```

## 阶段 2：前端接入真实 admin API

### 目标

把 `frontend_new/src/api/admin.js` 从 empty mock 改为真实请求，保持现有 `/admin` 页面结构不大改。

### 改造点

- `getAdminStats()` -> `GET /admin/stats`
- `getAdminExtractionTasks(params)` -> `GET /admin/extraction-tasks`
- `getAdminExtractionTaskDetail(taskId)` -> `GET /admin/extraction-tasks/{taskId}`
- `resubmitAdminExtractionTask(taskId, payload)` -> `POST /admin/extraction-tasks/{taskId}/resubmit`
- `getAdminUsers()`、`getAdminProjects()`、`getAdminTemplates()`、`getAdminDocuments()` 可先复用已有业务接口或接 admin 聚合接口。

### 页面行为

- 列表默认加载最近 200 条任务。
- 存在 `running / queued / pending / stale` 任务时，每 5 秒刷新列表。
- 打开详情弹窗时，每 2 秒刷新详情。
- 详情事件流使用 `after_id` 增量轮询。
- 终态后停止详情轮询。
- 重新提交成功后立即刷新列表和详情。

## 阶段 3：SSE 实时流增强

### 目标

把详情弹窗中的事件流从轮询增强为 SSE，降低延迟和无效请求。

### 后端接口

```text
GET /api/v1/admin/extraction-tasks/{task_id}/stream
```

输出事件类型：

| event | 说明 |
|---|---|
| `meta` | 连接建立，返回当前状态 |
| `progress` | 新进度事件 |
| `state_changed` | 状态变化 |
| `error` | 错误 |
| `terminal` | 任务终态 |
| `heartbeat` | 没有新事件时保持连接 |

### 前端 hook

改造 `frontend_new/src/hooks/useExtractionProgressSSE.js`：

- 接收 `taskId` 和 `{ enabled }`。
- 使用 `EventSource` 连接 stream。
- `Authorization` 问题：
  - 如果使用 Cookie/session，可直接 EventSource。
  - 如果只用 Bearer token，需要改为 fetch stream 或在短期内保留轮询。
- 断线后指数退避重连。
- 收到 `terminal` 后关闭连接并触发详情刷新。

> [!warning]
> 如果当前鉴权只依赖 `Authorization: Bearer` header，浏览器原生 `EventSource` 不能直接加 header。此时不要强行上 SSE，先使用轮询，或改用 `fetch()` 读取 `text/event-stream`。

## 阶段 4：历史任务与数据修复

### 目标

让管理页能展示历史 `extraction_jobs`，同时逐步让新任务都进入 `async_task_*`。

### 任务

- 给无 `async_task_items` 的历史 `extraction_jobs` 做只读兼容展示。
- 可选：提供一次性 backfill 脚本，为最近 N 天的 `extraction_jobs` 创建 synthetic batch/item。
- 修复普通单 job 创建流程：如果异步入队，应创建对应 `async_task_item`，避免 `TaskProgressService.update_job_progress()` 找不到 item 后直接返回。
- 对 `cancel_job()`、`retry_job()`、`delete_job()` 同步写 progress item/event。

### 不建议

- 不建议一次性把所有历史 job 强行迁移为 batch；容易制造不准确的事件时间线。
- 不建议前端直接拼 `extraction_jobs` 和 `task-batches`，聚合逻辑应在后端。

## 阶段 5：权限、安全与审计

### 目标

管理后台只能管理员访问，任务重提有审计记录。

### 后端

- admin router 使用 `is_admin_user()` 或新增 `require_admin` dependency。
- 非管理员访问 `/api/v1/admin/*` 返回 403。
- `resubmit` 记录操作者、时间、source task、resubmitted job ids。
- 对错误详情和 LLM prompt/response 做敏感信息处理策略：
  - 默认管理页可看摘要。
  - 原始 prompt/response 需要更高权限或脱敏后展示。

### 前端

- `/admin` 路由增加角色判断。
- 非管理员不显示顶部“管理”导航。
- 直接访问 `/admin` 时显示无权限页或跳回 dashboard。

## 验收方案

## A. 数据库验收

### A1. 迁移状态

命令：

```bash
cd backend
PYTHONPATH=. .venv/bin/alembic current
```

通过标准：

- 输出包含 `20260507_1200` 或更新 head。

### A2. 表结构存在

检查表：

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_name IN (
  'async_task_batches',
  'async_task_items',
  'async_task_events',
  'extraction_jobs',
  'extraction_runs'
);
```

通过标准：

- 五张表都存在。
- `async_task_items.extraction_job_id` 有索引。
- `async_task_events.batch_id, created_at` 有索引。

### A3. 新任务产生 item/event

操作：

1. 找一个有可抽取文档的患者或项目患者。
2. 调用 update-folder 接口。
3. 查询 batch 关联数据。

SQL：

```sql
SELECT COUNT(*) FROM async_task_items WHERE batch_id = '<batch_id>';
SELECT COUNT(*) FROM async_task_events WHERE batch_id = '<batch_id>';
```

通过标准：

- 有可抽取任务时，`async_task_items > 0`。
- worker 执行后，`async_task_events > 0`。
- 任务完成后 batch 状态为 `succeeded` 或 `completed_with_errors`。

## B. 后端接口验收

### B1. admin stats

请求：

```bash
curl -s http://localhost:8000/api/v1/admin/stats
```

通过标准：

- HTTP 200。
- 返回 `overview` 和 `tasks`。
- `active_tasks` 等于 `pending + queued + running + stale` 的合理聚合。

### B2. admin extraction task list

请求：

```bash
curl -s 'http://localhost:8000/api/v1/admin/extraction-tasks?limit=20&offset=0'
```

通过标准：

- HTTP 200。
- 返回 `items / total / type_counts / status_counts`。
- 每条 item 至少包含：
  - `id`
  - `source_table`
  - `task_type`
  - `status`
  - `progress`
  - `document_count`
  - `completed_count`
  - `failed_count`
  - `updated_at`
- 历史 `extraction_jobs` 在没有 async item 时仍能出现。

### B3. 过滤与搜索

请求：

```bash
curl -s 'http://localhost:8000/api/v1/admin/extraction-tasks?task_type=project_crf&status=failed&limit=20'
curl -s 'http://localhost:8000/api/v1/admin/extraction-tasks?keyword=<job_id_or_patient_name>&limit=20'
```

通过标准：

- `task_type` 过滤不混入其他类型。
- `status` 过滤使用统一状态。
- `keyword` 能命中任务 ID、患者名、项目名、模板名中的至少一种。

### B4. 任务详情

请求：

```bash
curl -s http://localhost:8000/api/v1/admin/extraction-tasks/<task_id>
```

通过标准：

- HTTP 200。
- 返回 `summary` 和 `jobs`。
- batch 任务能展开多个 jobs。
- 历史单 job 也能返回一个 jobs 项。
- 如果有 run，返回最新 run 的状态、模型、prompt version、字段候选数量。
- 失败任务有 `error_message` 或 `last_error`。

### B5. 事件增量

请求：

```bash
curl -s 'http://localhost:8000/api/v1/admin/extraction-tasks/<task_id>/events?limit=20'
curl -s 'http://localhost:8000/api/v1/admin/extraction-tasks/<task_id>/events?after_id=<event_id>&limit=20'
```

通过标准：

- 有 `async_task_events` 的任务返回真实事件。
- `after_id` 不重复返回 marker 事件。
- 没有事件的历史 job 返回 synthetic 当前状态事件，或返回空数组但详情仍可展示状态；二选一，需在接口文档中明确。

### B6. 重新提交

请求：

```bash
curl -X POST http://localhost:8000/api/v1/admin/extraction-tasks/<task_id>/resubmit \
  -H 'Content-Type: application/json' \
  -d '{"source":"auto","only_failed":true}'
```

通过标准：

- 对 `failed / pending / stale` 任务返回 HTTP 200。
- 返回 `resubmitted_job_ids`。
- 不重提已完成 job。
- 重提交后对应 job 状态进入 `pending / queued / running` 之一。
- Celery task id 能写入 `async_task_items.celery_task_id`。

### B7. 权限

通过标准：

- 非登录用户返回 401。
- 非管理员返回 403。
- 管理员返回 200。
- 开发模式 `ENABLE_AUTH=false` 时可使用 `DEV_ADMIN_USER`，但生产模式必须校验管理员。

## C. 前端验收

### C1. 管理页基础加载

操作：

1. 登录管理员账号。
2. 打开 `/admin`。

通过标准：

- 顶部统计卡片显示真实数值，不再全是 `-`。
- “抽取任务”tab 有真实列表。
- 刷新按钮能重新请求后端。
- Network 中不再出现 `src/api/admin.js` empty mock 行为。

### C2. 列表筛选

操作：

1. 切换任务类型：全部、科研 CRF、病历夹、靶向。
2. 切换状态：运行中、等待中、已完成、失败。
3. 输入患者名、项目名或任务 ID 搜索。

通过标准：

- UI 显示数量与接口返回一致。
- 切换筛选后列表内容变化正确。
- 空结果展示空状态，不报错。

### C3. 详情弹窗

操作：

1. 点击任务“详情”。
2. 查看摘要、文档级 jobs、run 信息、抽取字段、错误信息。

通过标准：

- 弹窗能打开。
- 任务 ID 可复制。
- 有 run 的 job 可展开字段表。
- 没有 LLM 调用日志时显示明确空提示。
- 失败任务错误信息可见。

### C4. 轮询进度

操作：

1. 发起一个新的 EHR 或 CRF update-folder。
2. 保持 `/admin` 打开。

通过标准：

- 列表在 5 秒内出现新任务或状态变化。
- 详情弹窗在 2 秒内看到阶段进度变化。
- 任务终态后轮询停止或降频。
- 页面不需要手动刷新即可从 `queued/running` 变为 `completed/failed`。

### C5. 重新提交

操作：

1. 找一个失败或 pending 任务。
2. 点击“重新提交”。
3. 确认弹窗。

通过标准：

- 成功后有明确提示。
- 列表状态更新。
- 已完成任务的“重新提交”按钮禁用。
- 重复点击不会重复提交同一个正在运行的 job。

## D. SSE 验收

> [!info]
> SSE 是第二阶段增强项。如果第一阶段选择轮询，D 类验收可以暂缓，但前端 hook 不应假装已经实时。

### D1. stream 连接

请求：

```bash
curl -N http://localhost:8000/api/v1/admin/extraction-tasks/<task_id>/stream
```

通过标准：

- HTTP 200。
- `Content-Type: text/event-stream`。
- 首条事件为 `meta` 或当前状态。

### D2. 事件推送

操作：

1. stream 打开。
2. 触发任务进度变化。

通过标准：

- 1-2 秒内收到新事件。
- 事件包含 `id / status / progress / node / message / ts`。
- 终态时收到 `terminal` 并关闭或提示前端停止。

### D3. 断线恢复

通过标准：

- 断网或服务重启后，前端能回退到轮询或自动重连。
- 不重复渲染已有事件。
- `after_id` 或 `Last-Event-ID` 生效。

## E. 自动化测试验收

### 后端单元测试

新增测试文件建议：

```text
backend/tests/app/test_admin_task_api.py
backend/tests/services/test_admin_task_service.py
backend/tests/services/test_task_progress_service.py
```

覆盖：

- batch 列表聚合。
- 历史 job 兼容展示。
- 状态映射。
- stale 派生状态。
- task detail jobs/runs 聚合。
- events 增量查询。
- resubmit 只提交失败/等待任务。
- 非管理员 403。

通过命令：

```bash
cd backend
.venv/bin/pytest tests/app/test_admin_task_api.py tests/services/test_admin_task_service.py tests/services/test_task_progress_service.py -q
```

### 前端测试

建议覆盖：

- `src/api/admin.js` 请求路径。
- `/admin` 抽取任务列表渲染。
- 筛选参数变化。
- 详情弹窗加载和错误空状态。
- resubmit 按钮状态。

通过命令：

```bash
cd frontend_new
npm run test
npm run build
```

如果当前项目没有前端测试框架，最低验收为：

```bash
cd frontend_new
npm run build
```

并进行浏览器手工验收。

## F. 端到端验收场景

### 场景 1：患者 EHR 批量抽取成功

前置条件：

- 患者存在。
- 患者至少有 1 份已 OCR 完成且可抽取的文档。

步骤：

1. 调用 `POST /api/v1/patients/{patient_id}/ehr/update-folder`。
2. 获取 `batch_id`。
3. 打开 `/admin` 抽取任务 tab。
4. 搜索 `batch_id`。
5. 打开详情。

通过标准：

- 任务显示为 `patient_ehr` 或 `targeted`。
- 状态从 `queued/running` 变为 `completed`。
- 详情 jobs 数等于创建的 job 数。
- `async_task_events` 有多条阶段事件。
- 患者 EHR 当前值出现新增候选或当前值。

### 场景 2：项目 CRF 批量抽取部分失败

前置条件：

- 项目患者存在。
- 至少一个文档可抽取，至少一个 job 可通过构造异常失败。

步骤：

1. 调用 `POST /api/v1/research/{project_id}/patients/{project_patient_id}/crf/update-folder`。
2. 在 `/admin` 查看任务。

通过标准：

- batch 最终为 `completed_with_errors` 或 `failed`。
- 失败 job 有 `last_error`。
- 成功 job 的字段候选仍落库。
- 管理页能重提失败 job，不重复重提成功 job。

### 场景 3：历史 job 兼容展示

前置条件：

- 数据库中存在没有 `async_task_items` 关联的 `extraction_jobs`。

步骤：

1. 打开 `/admin` 抽取任务列表。
2. 搜索历史 job id。
3. 打开详情。

通过标准：

- 列表能看到历史 job。
- `source_table = extraction_jobs`。
- 详情能展示 job 和 run。
- 没有 async events 时页面不报错。

### 场景 4：疑似卡住任务

前置条件：

- 构造一个 `running` 且 `heartbeat_at` 超过阈值的 item，或一个 `running` 且 `updated_at` 超过阈值的 job。

通过标准：

- admin API 派生状态为 `stale`。
- 前端用 warning 状态展示。
- 可点击重新提交。
- 重提交后状态变化为 `queued/running`。

## 完成定义

### 第一阶段完成定义

- [ ] `GET /admin/stats` 可用。
- [ ] `GET /admin/extraction-tasks` 可用，兼容 batch 和历史 job。
- [ ] `GET /admin/extraction-tasks/{task_id}` 可用。
- [ ] `GET /admin/extraction-tasks/{task_id}/events` 可用。
- [ ] `POST /admin/extraction-tasks/{task_id}/resubmit` 可用。
- [ ] `/admin` 抽取任务 tab 使用真实 API。
- [ ] 轮询可跟踪新任务状态变化。
- [ ] 后端测试覆盖核心聚合逻辑。
- [ ] 前端 build 通过。

### 第二阶段完成定义

- [ ] SSE stream 接口可用。
- [ ] `useExtractionProgressSSE` 不再是空实现。
- [ ] 详情弹窗优先使用 SSE，失败回退轮询。
- [ ] 断线重连和终态关闭通过验收。

### 上线前阻断项

- [ ] admin API 无权限保护。
- [ ] 任务重提可能重复提交已完成 job。
- [ ] 详情接口对缺失 run/job 抛 500。
- [ ] `/admin` 打开后仍显示全空 mock 数据。
- [ ] 新发起的 update-folder 有 jobs 但不产生任何 item/event。

## 推荐优先级

1. **P0：后端 admin 任务列表和详情聚合。**
2. **P0：前端 `src/api/admin.js` 接真实接口。**
3. **P0：轮询跟踪任务进度。**
4. **P1：重新提交失败/pending/stale 任务。**
5. **P1：权限保护与导航隐藏。**
6. **P2：SSE 实时流。**
7. **P2：LLM 调用日志精准关联。**
8. **P3：历史 job backfill。**

## 风险与处理

| 风险 | 影响 | 处理 |
|---|---|---|
| 历史 job 没有 events | 详情时间线为空 | 后端生成 synthetic event 或明确空状态 |
| 新 batch 没有 item | 任务无法细分 | 修复创建流程，确保有 job 时必建 item |
| 原生 EventSource 不能带 Bearer token | SSE 鉴权困难 | 第一阶段用轮询；第二阶段用 fetch stream 或 cookie |
| 任务状态枚举不一致 | 前端判断复杂 | 后端统一映射 |
| running 任务实际 worker 已死 | 管理页误判运行中 | 用 `heartbeat_at/updated_at` 派生 stale |
| 重提导致重复写候选 | 数据重复 | retry 新 run，current 不覆盖已有值；只重提失败/等待 |

## 后续文档更新

实施完成后需要同步更新：

- [[EACY 后端接口文档/EACY 后端接口文档.md]]
- [[EACY 后端接口文档/EACY 后端接口文档 - Extraction Jobs]]
- 新增或更新 Admin 接口文档页
- [[Eacy前端开发文档]]
- [[异步任务进度追踪实现方案]]
