---
type: data-model
module: 异步任务
status: draft
audience: [tech-lead, integrator, ops]
code_path:
  - backend/app/models/async_task.py
  - backend/app/repositories/async_task_repository.py
  - backend/app/services/task_progress_service.py
table_name: async_task_batches / async_task_items / async_task_events
related_tables: [extraction_job, extraction_run, document, patient, research_project, project_patient, data_context]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# 表-async_task

> [!info] 字段定义以 SQLAlchemy model + Alembic migration 为准
> 本文只描述**业务含义、生命周期、典型查询**。
> **注意**：本文档实际覆盖 3 张物理表（`async_task_batches` / `async_task_items` / `async_task_events`），它们组成一套异步任务进度跟踪模型。

## 用途
**统一异步任务进度跟踪**——前端通过这套表（而非直接读 Celery）轮询任务状态。`batch` 是"批次/聚合"，`item` 是"单项任务"（一般对应一次 [[表-extraction_job]] 或一份文档的 OCR），`event` 是"过程事件流"（心跳/阶段切换/完成）。

## async_task_batches — 字段业务含义
| 字段 | 业务含义 | 取值约束 / 枚举 |
|---|---|---|
| task_type | 任务类型 | 例如 `extraction_batch` / `ocr_batch`；具体集合 TBD |
| status | 批次状态 | `created`（默认） / `running` / `succeeded` / `failed` / `cancelled`（业务上）；具体取值集合 TBD |
| progress | 总进度 0–100 | 由后端聚合 item 状态计算 |
| title | 展示名 | 用于前端进度条 |
| scope_type | 范围类型 | 业务上标识"按患者/按项目/按文档"，集合 TBD |
| patient_id / document_id / project_id / project_patient_id | 范围锚点 | 软外键（model 中无 FK），用于按业务对象过滤进度 |
| total_items / succeeded_items / failed_items / cancelled_items | 项数计数器 | 由服务层维护 |
| message / error_message | 展示信息 | 用户可见消息 / 错误详情 |
| requested_by | 发起人 | — |
| started_at / finished_at / heartbeat_at | 时间窗口 | heartbeat_at 用于检测"卡住"的批次 |

## async_task_items — 字段业务含义
| 字段 | 业务含义 | 取值约束 / 枚举 |
|---|---|---|
| batch_id | 所属批次 | 单独提交的 item 可为 NULL |
| task_type | 任务类型 | 与 batch 同维度 |
| status | 单项状态 | 同 batch 状态机 |
| stage / stage_label | 阶段编码与中文标签 | 用于"已完成 OCR，正在抽取" 这种细粒度展示 |
| celery_task_id | Celery 任务 id | 用于运维端定位 |
| extraction_job_id / extraction_run_id | 关联抽取 | 抽取类 item 必填 |
| document_id / patient_id / project_id / project_patient_id / context_id / target_form_key | 业务锚点 | 软/硬外键混合 |
| current_step / total_steps | 步骤进度（自由含义） | 由具体任务自描述 |
| error_message | 错误详情 | failed 时使用 |
| started_at / finished_at / heartbeat_at | 时间窗口 | — |

## async_task_events — 字段业务含义
| 字段 | 业务含义 | 取值约束 / 枚举 |
|---|---|---|
| batch_id / item_id | 关联 batch 或 item | 至少其一非空 |
| event_type | 事件类型 | 例如 `start` / `progress` / `stage` / `succeeded` / `failed`；具体取值 TBD |
| status / progress / stage / message | 事件携带的状态快照 | 直接展示在前端时间线上 |
| payload_json | 额外结构化数据 | 自由 JSON |

## 关键索引
| 索引 | 用途 |
|---|---|
| `idx_async_task_batches_status` (status, updated_at) | 列出"近期活跃"批次 |
| `idx_async_task_batches_patient` | 患者维度全局轮询 |
| `idx_async_task_batches_project_patient` (project_id, project_patient_id) | 项目维度轮询 |
| `idx_async_task_items_batch` (batch_id, status) | 批次内分状态聚合 |
| `idx_async_task_items_extraction_job` | 从 extraction_job 反查进度 |
| `idx_async_task_items_document` (document_id, task_type) | 文档维度 OCR/抽取进度 |
| `idx_async_task_items_patient` | 患者维度活跃 item |
| `idx_async_task_events_item` (item_id, created_at) | item 详情时间线 |
| `idx_async_task_events_batch` (batch_id, created_at) | batch 详情时间线 |

## 生命周期
- 创建：业务方（如 `ExtractionService` / `DocumentService`）创建 batch 与 item，状态 `created`。
- 更新：Celery worker 通过 `TaskProgressService` 推进 stage 与 progress；每次推进同时 append 一条 event。
- 终态：写 `finished_at`、清零或保留计数器。
- 清理策略：当前文档未见显式归档；event 可考虑按时间分区/清理（TBD）。

## 与其他表的关系
- [[表-extraction_job]] / [[表-extraction_run]] — `async_task_items` 通过 FK 关联（**硬外键**）。
- [[表-document]] / [[表-patient]] / [[表-research_project]] / [[表-project_patient]] / [[表-data_context]] — item 上的硬外键；batch 上对应字段为软外键（model 未声明 FK）。

## 典型查询
```sql
-- 业务场景：前端全局轮询当前用户的活跃批次
SELECT id, task_type, status, progress, title, updated_at
FROM async_task_batches
WHERE requested_by = :user_id
  AND status IN ('created', 'running')
ORDER BY updated_at DESC;
```

```sql
-- 业务场景：详情页时间线（增量拉取，after_id 之后的事件）
SELECT id, event_type, status, progress, stage, message, created_at
FROM async_task_events
WHERE batch_id = :batch_id
  AND id > :after_id
ORDER BY created_at, id
LIMIT 200;
```
