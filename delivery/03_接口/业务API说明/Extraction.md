---
type: api
module: 接口
status: draft
audience: [integrator, tech-lead]
code_path:
  - backend/app/api/v1/extraction/router.py
  - backend/app/services/extraction_service.py
api_endpoints:
  - POST /api/v1/extraction-jobs
  - POST /api/v1/extraction-jobs/plan
  - GET /api/v1/extraction-jobs/{job_id}
  - GET /api/v1/extraction-jobs/{job_id}/runs
  - POST /api/v1/extraction-jobs/{job_id}/cancel
  - POST /api/v1/extraction-jobs/{job_id}/retry
  - DELETE /api/v1/extraction-jobs/{job_id}
related_tables: [extraction_job, extraction_run, field_value_event, data_context]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# Extraction（抽取任务）

> [!info] 参数表见 [[OpenAPI访问|OpenAPI]]
> "病历夹更新"等业务级触发不走这里，见 [[业务API说明/Patients|Patients]] 与 [[业务API说明/Research|Research]] 的 `update-folder` 端点；本组是**任务对象本身**的管理接口。

## 业务用途

`extraction_job` 是一次 LLM 抽取的工作单元。本组接口让前端 / 管理后台可以**手动创建、查询、重试、取消、删除**任务，以及查看任务下的 `extraction_run`（每次 LLM 调用快照）。

## 主要场景与对应端点

### 创建任务

- `POST /api/v1/extraction-jobs` — 创建一个 job 并**立即提交**到 Celery（202）
- `POST /api/v1/extraction-jobs/plan` — 创建一组计划任务（按 schema 字段规划拆分），`process=true` 时立即提交，否则只入库（202）

### 任务查询

- `GET /api/v1/extraction-jobs/{job_id}` — 任务当前状态、progress、错误信息
- `GET /api/v1/extraction-jobs/{job_id}/runs` — 列出该任务的所有 run（含 LLM 输入/输出快照、validation_status）

### 控制流

- `POST /api/v1/extraction-jobs/{job_id}/retry` — 失败任务重试（创建新 run）
- `POST /api/v1/extraction-jobs/{job_id}/cancel` — 取消 pending/running 任务
- `DELETE /api/v1/extraction-jobs/{job_id}` — 删除任务记录（仅在终态可删）

## 关键字段语义

| 字段 | 业务含义 | 备注 |
|---|---|---|
| `job_type` | 任务种类 | 主要枚举：`patient_ehr`（病例级 EHR）、`project_crf`（项目 CRF）、`document_ehr`、`metadata` 等 |
| `target_form_key` | 限定某个表单 | 仅抽取该 form 下的字段，用于增量更新 |
| `context_id` | 关联 `data_context` | 写入字段值时绑定的上下文（病例或项目病例） |
| `schema_version_id` | 使用的 schema 版本 | 不传时由 service 根据 context 推断 |
| `input_json` | LLM 输入参数覆盖 | 高级场景，普通业务不传 |
| `priority` | 队列优先级 | 数值越大越优先 |
| `progress` | 0–100 | 由 worker 上报，前端轮询展示 |
| `parsed_output_json`（在 run 上） | LLM 结构化输出 | 实际写入字段值的来源 |
| `validation_status`（在 run 上） | 输出是否通过 schema 校验 | `passed` / `failed` / `partial` |

## 典型样例

> [!example] 手动创建一个文档级抽取
> ```http
> POST /api/v1/extraction-jobs
> {
>   "job_type": "document_ehr",
>   "patient_id": "...",
>   "document_id": "...",
>   "schema_version_id": "..."
> }
> ```
> 响应 202 含 `id`、`status=pending`。

> [!example] 查看一次 run 的 LLM 输出
> ```http
> GET /api/v1/extraction-jobs/{job_id}/runs
> ```

## 副作用

- 创建 / plan：写入 `extraction_job` 与（异步地）`extraction_run`；提交 Celery 任务；产生对应 `async_task` 批次记录。
- retry：写入新一行 `extraction_run`（`run_no+1`），job 状态回到 `pending`。
- cancel：仅在 `status in (pending, running)` 时生效；终态任务返回 409。
- delete：要求 `status in (succeeded, failed, cancelled)`。

## 错误码业务含义

| 场景 | HTTP | 业务原因 | 调用方建议 |
|---|---|---|---|
| 找不到 job / 关联资源 | 404 | `ExtractionNotFoundError` | 前端提示"任务已删除" |
| 终态再 cancel / pending 状态再 retry | 409 | `ExtractionConflictError` | 按状态禁用按钮 |
| schema_version 与 context_id 类型不匹配 | 409 | 同上 | 校验 binding |

## 关联

- [[表-extraction_job]]、[[表-extraction_run]]、[[表-field_value_event]]
- [[业务流程-抽取任务生命周期]]
- [[业务流程-Schema字段规划]]
- [[关键设计-异步任务进度追踪]]
- [[业务API说明/Tasks|Tasks]] — 进度轮询入口
