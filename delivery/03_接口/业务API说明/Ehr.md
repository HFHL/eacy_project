---
type: api
module: 接口
status: draft
audience: [integrator]
code_path:
  - backend/app/api/v1/ehr/router.py
  - backend/app/api/v1/patients/router.py
api_endpoints:
  - GET /api/v1/ehr/
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# EHR（命名空间占位）

> [!warning] EHR 的字段读写不在这里
> `/api/v1/ehr/` 路由当前**仅含模块探活端点**。EHR 字段值的实际读写（context / records / 字段值 / 候选值 / 证据）全部挂在 `/api/v1/patients/{patient_id}/ehr/*` 下，请直接看 [[业务API说明/Patients|Patients]]。
>
> 项目维度的 CRF 字段读写（同样的语义、不同的 context 类型）则在 [[业务API说明/Research|Research]] 下，路径为 `/api/v1/projects/{project_id}/patients/{project_patient_id}/crf/*`。

## 业务用途

`/api/v1/ehr/` 作为 EHR 模块的命名空间预留，方便未来添加**跨病例的 EHR 操作**（如全局字段值检索、批量审核等）。当前仅一个探活端点。

## 主要场景与对应端点

### 模块探活

- `GET /api/v1/ehr/` — 返回 `{"module": "ehr", "status": "ready"}`，需要鉴权（用于排查鉴权链路是否通）

## 关键设计：EHR 字段值的真正入口分布

| 业务场景 | 路由前缀 | 文档 |
|---|---|---|
| 单病例 EHR（病例级 context） | `/api/v1/patients/{id}/ehr/*` | [[业务API说明/Patients]] |
| 项目内单病例 CRF（项目级 context） | `/api/v1/projects/{pid}/patients/{ppid}/crf/*` | [[业务API说明/Research]] |
| 字段值变更链 / 候选值 / 证据 | 同上两条 | 同上 |

> [!info] 为什么 EHR 与 CRF 接口分两套
> 两套接口的**字段值底层模型完全一致**（`record_instance` + `field_current_value` + `field_value_event` + `field_value_evidence`），区别只在 `data_context.context_type`（`patient_ehr` vs `project_crf`）。前端按页面入口分到两个路由前缀下，避免一组接口同时处理两种 scope。详见 [[关键设计-Schema结构]] 与 [[表-data_context]]。

## 关联

- [[表-data_context]]、[[表-field_current_value]]、[[表-field_value_event]]、[[表-field_value_evidence]]
- [[关键设计-字段值历史与变更链]]
- [[关键设计-证据归因机制]]
- [[关键设计-嵌套字段与RecordInstance]]
