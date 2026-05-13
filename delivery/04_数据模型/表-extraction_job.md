---
type: data-model
module: AI抽取
status: draft
audience: [tech-lead, integrator, ops]
code_path:
  - backend/app/models/extraction_job.py
  - backend/app/repositories/extraction_job_repository.py
  - backend/app/services/extraction_service.py
table_name: extraction_jobs
related_tables: [extraction_run, patient, document, data_context, schema_template_version, research_project, project_patient, async_task, field_value_event]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# 表-extraction_job

> [!info] 字段定义以 SQLAlchemy model + Alembic migration 为准
> 本文只描述**业务含义、生命周期、典型查询**。

## 用途
一次 **AI 抽取任务的逻辑作业单**——描述"对哪个文档/患者在哪个 Schema 版本下抽什么字段"。一个 job 可对应多次 LLM 调用（重试/重跑），每次是一条 [[表-extraction_run]]。Celery 异步执行，进度由 [[表-async_task]] 镜像。

## 字段业务含义
| 字段 | 业务含义 | 取值约束 / 枚举 |
|---|---|---|
| job_type | 任务类型 | 业务上见 `patient_ehr` / `targeted_schema` / `project_crf` 等；新代码以 `job_type.in_(...)` 形式判定，集合 TBD |
| status | 任务状态 | `pending` / `running` / `completed` / `succeeded` / `failed` / `cancelled`（见 repo 的 `_EXTRACT_PRIORITY` 顺序） |
| priority | 调度优先级 | 整数，默认 0；具体调度策略 TBD |
| patient_id | 任务目标患者 | EHR / CRF 类任务必填 |
| document_id | 单文档抽取的目标文档 | 文档级任务必填；患者级聚合任务可空 |
| project_id / project_patient_id | 仅项目 CRF 类任务 | 与 `context_id` 一致地标识"项目内"作业 |
| context_id | 写入哪个 data_context | 与 schema_version_id 配合定位字段结构 |
| schema_version_id | Schema 版本 | 决定 prompt 与字段集合 |
| target_form_key | 只抽某个 form | 用于"补充字段"场景（targeted_schema） |
| input_json | 入参快照 | 含 `wait_for_document_ready` 等控制标志 |
| progress | 进度百分比 | 0–100，Worker 心跳更新 |
| error_message | 失败原因 | 仅 failed 状态有意义 |
| requested_by | 发起人（软外键 → users.id） | — |
| started_at / finished_at | 时间窗口 | Worker 写入 |

## 关键索引
| 索引 | 用途 |
|---|---|
| `idx_jobs_status` | 调度器扫待执行 / 监控失败 |
| `idx_jobs_type` | 按 job_type 聚合统计 |
| `idx_jobs_document` | 文档详情 → 抽取记录 |
| `idx_jobs_document_type_status` | "某文档某类型任务的最新状态"组合查询（见 `list_latest_extract_status_by_document_ids`） |
| `idx_jobs_context` | 上下文级别的作业列表 |

## 生命周期
- 创建：用户在前端"发起抽取"或归档流程自动触发；`ExtractionService` 写 `status=pending` 并入 Celery 队列 `extraction`。
- 更新：Worker 写 `status=running` + `started_at` → 写 `progress` → 写 `finished_at` 与终态。失败时写 `error_message`，自动重试 ×3。
- 删除/归档：不物理删除；`cancelled` 表示用户主动取消。

## 与其他表的关系
- [[表-extraction_run]] — 1:N，每次 LLM 调用一条 run（`uk_job_run_no` 保证 run_no 在 job 内唯一）。
- [[表-patient]] / [[表-document]] / [[表-data_context]] / [[表-schema_template_version]] — N:1。
- [[表-async_task]] — 1:1（通过 `async_task_items.extraction_job_id` 镜像进度）。
- [[表-field_value_event]] — 间接：run 抽出的字段写到 events。

## 典型查询
```sql
-- 业务场景：文档详情页 → 该文档的所有抽取记录（最新优先）
SELECT id, job_type, status, progress, started_at, finished_at, error_message
FROM extraction_jobs
WHERE document_id = :doc_id
ORDER BY created_at DESC;
```

```sql
-- 业务场景：批量探测"这些患者的 EHR 是否正在更新"
SELECT id, patient_id, status
FROM extraction_jobs
WHERE patient_id = ANY(:patient_ids)
  AND job_type = 'patient_ehr'
  AND status IN ('pending', 'running');
```
