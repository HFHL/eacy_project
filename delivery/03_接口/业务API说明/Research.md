---
type: api
module: 接口
status: draft
audience: [integrator, tech-lead]
code_path:
  - backend/app/api/v1/research/router.py
  - backend/app/services/research_project_service.py
  - backend/app/services/research_project_export_service.py
  - backend/app/services/extraction_service.py
api_endpoints:
  - GET /api/v1/projects
  - POST /api/v1/projects
  - GET /api/v1/projects/{project_id}
  - POST /api/v1/projects/{project_id}/template-bindings
  - POST /api/v1/projects/{project_id}/patients
  - GET /api/v1/projects/{project_id}/patients/{project_patient_id}/crf
  - POST /api/v1/projects/{project_id}/export
related_tables: [research_project, project_template_binding, project_patient, data_context, record_instance, field_current_value, field_value_event]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# Research（科研项目与 CRF）

> [!info] 参数表见 [[OpenAPI访问|OpenAPI]]
> 这一组是 EACY 最庞大的路由组。本文按"项目-绑定-纳入-数据-导出"五个业务阶段组织。

## 业务用途

科研项目是 EACY 的**数据集组织单元**：每个项目绑定一个 schema 版本作为 CRF 口径，纳入一组病例（`project_patient`），从这些病例的文档抽取项目特定字段值，最终导出 Excel 数据集。

## 主要场景与对应端点

### 项目 CRUD

- `GET /api/v1/projects` — 项目列表，可按 `status` 过滤；响应附带统计（病例数、完成度等）
- `POST /api/v1/projects` — 新建项目（`project_code` 必填且唯一）
- `GET /api/v1/projects/{project_id}` — 项目详情
- `PATCH /api/v1/projects/{project_id}` — 部分更新
- `DELETE /api/v1/projects/{project_id}` — 归档（**响应体为项目对象，不是 204**）

### 绑定 CRF 模板

- `GET /api/v1/projects/{project_id}/template-bindings` — 列出当前绑定
- `POST /api/v1/projects/{project_id}/template-bindings` — 绑定一个 `schema_version_id` 作为 CRF
- `DELETE /api/v1/projects/{project_id}/template-bindings/{binding_id}` — 禁用绑定（响应是 binding 对象）

### 纳入与移除病例

- `GET /api/v1/projects/{project_id}/patients` — 列出 `project_patient`
- `POST /api/v1/projects/{project_id}/patients` — 把一个 `patient_id` 纳入项目（产生 `project_patient` 行）
- `DELETE /api/v1/projects/{project_id}/patients/{project_patient_id}` — 退出项目（不是删病例）

### 项目 CRF 字段读写（项目 scope）

> 与病例 EHR 的 endpoint 形状镜像，区别在于挂在 `project_patient` 维度上。

- `GET /api/v1/projects/{pid}/patients/{ppid}/crf` — CRF 首屏（context + schema + records + current_values）
- `PATCH .../crf/fields/{field_path}` — 人工填写字段
- `GET .../crf/fields/{field_path}/events` — 字段值历史
- `GET .../crf/fields/{field_path}/candidates` — 候选值（多文档聚合）
- `POST .../crf/fields/{field_path}/select-event` — 选定 event
- `POST .../crf/fields/{field_path}/select-candidate` — 选定候选
- `DELETE .../crf/fields/{field_path}` — 清空当前值
- `GET .../crf/fields/{field_path}/evidence` — 字段证据列表
- `POST .../crf/records` — 新增 record 实例
- `DELETE .../crf/records/{record_instance_id}` — 删除 record 实例

### 批量更新 CRF（触发抽取）

- `POST /api/v1/projects/{pid}/patients/{ppid}/crf/update-folder` — 单病例 CRF 病历夹更新（202）
- `POST /api/v1/projects/{pid}/crf/update-folder` — **整个项目批量**触发 CRF 抽取，可选传 `project_patient_ids` 缩小范围（202）

### 数据集导出

- `POST /api/v1/projects/{project_id}/export` — 导出 xlsx（直接返回文件流，`Content-Disposition: attachment`）

## 关键字段语义

| 字段 | 业务含义 | 备注 |
|---|---|---|
| `project_code` | 业务编码 | 全局唯一 |
| `binding_type` | 绑定用途 | 默认 `primary_crf`，未来可扩展 |
| `project_patient.status` | 纳入状态 | `active` / `withdrawn` 等 |
| `enroll_no` | 业务侧入组号 | 仅在项目内唯一，由调用方自行控制 |
| `expected_patient_count` | 预期病例数 | 来自项目 `extra_json` |
| `avg_completeness` | 项目 CRF 平均完成度 | 后端聚合 |
| `principal_investigator_name` | PI 姓名 | 后端从 `extra_json` 或用户表聚合 |
| `format`（导出） | 仅支持 `excel` / `xlsx` | 其他值 400 |
| `scope`（导出） | `all` 全部纳入病例 / `selected` 指定 `patient_ids` | `selected` 时必须传 `patient_ids` |
| `expand_repeatable_rows` | 可重复表单是否展开为多行 | 默认 `true` |

## 典型样例

> [!example] 创建项目并绑定 CRF 版本
> ```http
> POST /api/v1/projects
> { "project_code": "STUDY-2025-A", "project_name": "示例研究" }
>
> POST /api/v1/projects/{id}/template-bindings
> { "template_id": "...", "schema_version_id": "...", "binding_type": "primary_crf" }
> ```

> [!example] 项目批量"病历夹更新"
> ```http
> POST /api/v1/projects/{project_id}/crf/update-folder
> { "project_patient_ids": ["...", "..."] }
> ```
> 响应 202，含 `batch_id`、`job_ids[]`、`skipped_patients[]` / `skipped_documents[]`；前端用 `batch_id` 去 [[业务API说明/Tasks|Tasks]] 轮询进度。

## 副作用

- 创建项目：写 `research_project`，`owner_id` 落当前用户 UUID。
- 绑定模板：写 `project_template_binding`；当 schema 版本不是 `published` 时拒绝（409）。
- 纳入病例：写 `project_patient`；同时按需创建项目 `data_context`。
- 字段读写：与 EHR 完全一致的事件链（见 [[关键设计-字段值历史与变更链]]）。
- `crf/update-folder` / `crf/update-folder` 批量版：创建若干 `extraction_job(job_type=project_crf)` + `async_task` 批次。
- 导出：纯查询，无写操作；遇大项目可能耗时较长。

## 错误码业务含义

| 场景 | HTTP | 业务原因 |
|---|---|---|
| 项目 / 绑定 / project_patient 不存在 | 404 | `ResearchProjectNotFoundError` |
| `project_code` 冲突、版本未发布、病例重复纳入等 | 409 | `ResearchProjectConflictError` |
| 导出参数非法（format / scope / 缺 patient_ids） | 400 | router 显式校验 |
| 批量 update-folder 无可抽取文档 | 200/202 但 `created_jobs=0` | 看响应字段，非错误 |

## 关联

- [[表-research_project]]、[[表-project_template_binding]]、[[表-project_patient]]、[[表-data_context]]
- [[业务流程-创建项目与绑定模板]]
- [[业务流程-病例纳入]]
- [[业务流程-数据集查看与编辑]]
- [[业务流程-数据导出]]
- [[关键设计-模板版本化]]
- [[业务API说明/Tasks|Tasks]] — 异步任务轮询
