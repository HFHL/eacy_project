---
type: api
module: 接口
status: draft
audience: [integrator, tech-lead]
code_path:
  - backend/app/api/v1/patients/router.py
  - backend/app/services/patient_service.py
  - backend/app/services/ehr_service.py
  - backend/app/services/extraction_service.py
api_endpoints:
  - GET /api/v1/patients
  - POST /api/v1/patients
  - GET /api/v1/patients/{patient_id}
  - PATCH /api/v1/patients/{patient_id}
  - DELETE /api/v1/patients/{patient_id}
  - POST /api/v1/patients/ehr-extraction-status
related_tables: [patient, project_patient, document, data_context, record_instance, field_current_value, field_value_event]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# Patients（病例与 EHR）

> [!info] 参数表见 [[OpenAPI访问|OpenAPI]]
> 本文按"业务场景"组织。EHR 字段读写虽然挂在 `/patients/{id}/ehr/*` 路径下，但语义独立，单列一节。

## 业务用途

承担**病例池**（病例的 CRUD 与列表筛选）以及**单病例 EHR 视图**（字段当前值、候选值、字段值历史、证据）的所有接口。

## 主要场景与对应端点

### 病例 CRUD

- `GET /api/v1/patients` — 病例池列表，支持关键字 / 科室过滤、分页
- `POST /api/v1/patients` — 新建病例
- `GET /api/v1/patients/{patient_id}` — 病例详情（含 `projects[]`、`document_count`、`data_completeness`）
- `PATCH /api/v1/patients/{patient_id}` — 部分更新
- `DELETE /api/v1/patients/{patient_id}` — 软删（`deleted_at`）

### 病例池统计探测

- `POST /api/v1/patients/ehr-extraction-status` — 批量查若干 `patient_id` 当前是否有 **活跃** （pending/running）的 `patient_ehr` 抽取任务。前端患者 rail 用作"病历夹更新中"指示器，**定期轮询**

### 单病例 EHR 视图

- `GET /api/v1/patients/{id}/ehr` — 一次性返回 context + schema + records + current_values，供 EHR Tab 首屏渲染
- `POST /api/v1/patients/{id}/ehr/update-folder` — 触发"病历夹更新"，按文档批量创建 patient_ehr 抽取任务（202）

### EHR 字段值读写

- `PATCH /api/v1/patients/{id}/ehr/fields/{field_path}` — 人工填写/覆写字段值（产生一条 `manual` event）
- `GET /api/v1/patients/{id}/ehr/fields/{field_path}/events` — 该字段完整变更链
- `GET /api/v1/patients/{id}/ehr/fields/{field_path}/candidates` — 多文档抽取出的候选值聚合
- `POST /api/v1/patients/{id}/ehr/fields/{field_path}/select-event` — 选定某个 event 作为当前值
- `POST /api/v1/patients/{id}/ehr/fields/{field_path}/select-candidate` — 选定某个候选（等价于 select-event，前端语义不同）
- `DELETE /api/v1/patients/{id}/ehr/fields/{field_path}` — 清空字段当前值（不删 events）
- `GET /api/v1/patients/{id}/ehr/fields/{field_path}/evidence` — 列出该字段所有证据片段

### EHR 记录实例（可重复表单）

- `POST /api/v1/patients/{id}/ehr/records` — 新增一个 `record_instance`（用于"住院记录"等可重复 form）
- `DELETE /api/v1/patients/{id}/ehr/records/{record_instance_id}` — 删除一个记录实例

## 关键字段语义

| 字段 | 业务含义 | 备注 |
|---|---|---|
| `patient_id` | UUID 字符串 | 软删病例查询返回 404 |
| `gender` | 字符串而非枚举 | 业务约定通常 `男`/`女`/`未知`，**无后端校验** |
| `data_completeness` | EHR 完成度 `0.0–1.0` | 由 `patient_service.get_patient_stats` 计算 |
| `projects[]` | 该病例被纳入的科研项目摘要 | 见 [[业务API说明/Research|Research]] |
| `extra_json` | 业务自定义元数据 | 不做 schema 校验，前端约定字段 |
| `field_path` | 形如 `form_key.field_key` 或 `group.form.field` 的点分路径 | URL 中需 URL-encode |
| `record_instance_id` | 可重复表单的实例 ID | 写字段值时若 schema 标记为 repeatable，必须传此 ID |
| `EhrExtractionStatusItem.active` | 该病例当前是否有 pending/running 的 `patient_ehr` 任务 | true 时前端展示 spinner |

## 典型样例

> [!example] 病例池查询
> ```http
> GET /api/v1/patients?page=1&page_size=20&keyword=张&department=心内科
> ```
> 响应附带 `statistics` 块（当前页聚合）：`total_documents`、`average_completeness`、`recently_added_today`。

> [!example] 触发病历夹更新（异步）
> ```http
> POST /api/v1/patients/{patient_id}/ehr/update-folder
> ```
> 响应 202，含 `batch_id` 与 `job_ids[]`；前端拿 `batch_id` 去 [[业务API说明/Tasks|Tasks]] 轮询进度。

## 副作用

- `POST /patients` 创建一行 `patient`，`created_by` 落 UUID 形式的当前用户。
- `update-folder` 会创建若干 `extraction_job`（数量见响应 `created_jobs`）并提交 Celery；同时产生一个 `async_task` batch。
- `PATCH /ehr/fields/...` 写一条 `field_value_event(event_type='manual')` 并更新 `field_current_value`。
- `DELETE /ehr/fields/...` 仅清当前值，历史 events 保留。
- `DELETE /patients/{id}` 软删，关联 documents 不级联删除。

## 错误码业务含义

| 场景 | HTTP | 业务原因 |
|---|---|---|
| 病例不存在 / 已软删 | 404 | `service.get_patient(...) is None` |
| `update-folder` 找不到病例 | 404 | `ExtractionNotFoundError` |
| `update-folder` 已有运行中的同类任务 | 409 | `ExtractionConflictError`（避免重复触发） |
| 病例 scope 不匹配 | 404 | 非创建者访问他人病例时按"不存在"处理，**不暴露存在性** |

## 关联

- [[表-patient]]、[[表-data_context]]、[[表-record_instance]]、[[表-field_current_value]]、[[表-field_value_event]]
- [[业务流程-新建病例]]
- [[业务流程-病例EHR批量更新]]
- [[关键设计-字段值历史与变更链]]
- [[关键设计-证据归因机制]]
