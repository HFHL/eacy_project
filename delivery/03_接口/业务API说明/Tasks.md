---
type: api
module: 接口
status: draft
audience: [integrator]
code_path:
  - backend/app/api/v1/tasks/router.py
  - backend/app/services/task_progress_service.py
api_endpoints:
  - GET /api/v1/task-batches/{batch_id}
  - GET /api/v1/task-batches/{batch_id}/events
related_tables: [async_task]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# Tasks（异步任务进度）

> [!info] 这一组是前端"任务进度面板"的轮询入口
> 不在这里**创建**任务。任务由 [[业务API说明/Extraction|Extraction]]、[[业务API说明/Patients|Patients]] 的 `update-folder`、[[业务API说明/Documents|Documents]] 的 `/ocr` 等端点间接创建，本组只负责**进度查询与事件流**。

## 业务用途

EACY 把异步工作组织成 **batch（批次）→ items（子任务）** 两层：一次"病历夹更新"或"项目批量抽取"对应一个 `batch`，下挂多个子任务（每个文档或每个字段组一个）。前端用本组接口拉批次状态与增量事件流。

## 主要场景与对应端点

### 拉取批次当前快照

- `GET /api/v1/task-batches/{batch_id}` — 一次性返回 batch 元数据 + 各 item 的 `status` / `progress` / `stage` / 错误信息；前端按固定频率（如 1–2s）轮询

### 增量拉事件

- `GET /api/v1/task-batches/{batch_id}/events?after_id=&limit=` — 从上次拉到的 `event.id` 往后拉新事件；用于"实时日志"与精细 stage 切换

## 关键字段语义

| 字段 | 业务含义 | 备注 |
|---|---|---|
| `batch_id` / `id` | 同一个值，重复给两次 | 兼容前端老字段名 |
| `task_type` | 批次类型 | `patient_ehr_folder_update` / `project_crf_folder_update` / `document_ocr` / `document_metadata` 等 |
| `status`（batch） | 聚合状态 | 由所有 item 计算：`pending` / `running` / `succeeded` / `failed` / `partial` |
| `progress`（batch） | 0–100，加权平均 | 前端进度条 |
| `running_items` / `queued_items` / `succeeded_items` / `failed_items` / `cancelled_items` | 子任务分布 | 用于"成功 5/失败 1" 文案 |
| `stage` / `stage_label`（item） | 当前阶段 | 例如 `ocr_running` / `llm_calling` / `merging`；`stage_label` 是给前端展示的中文 |
| `extraction_job_id` / `extraction_run_id`（item） | 反向 hop | 排错时可跳转到任务详情 |
| `event_type` | 事件类型 | `progress` / `stage_changed` / `status_changed` / `error` 等 |
| `after_id` / `limit` | 增量游标 | 不传从头；`limit` 上限 500 |

## 典型样例

> [!example] 轮询批次进度
> ```http
> GET /api/v1/task-batches/{batch_id}
> ```
> 响应包含 `items[]`，前端逐个渲染。当 `status in (succeeded, failed, cancelled)` 且 `running_items + queued_items == 0` 时停止轮询。

> [!example] 增量拉事件
> ```http
> GET /api/v1/task-batches/{batch_id}/events?after_id=evt_123&limit=200
> ```

## 副作用

无（纯查询）。

## 错误码业务含义

| 场景 | HTTP | 业务原因 |
|---|---|---|
| `batch_id` 不存在 / 已过 TTL | 404 | `service.get_batch_payload` 返回 None |

> [!warning] TTL
> `async_task` 表的清理策略与保留时长见 [[关键设计-异步任务进度追踪]] 与 [[表-async_task]]。

## 关联

- [[表-async_task]]
- [[关键设计-异步任务进度追踪]]
- [[关键设计-任务批次与子任务]]
- [[业务流程-异步任务监控]]
