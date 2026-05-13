---
type: data-model
module: AI抽取
status: draft
audience: [tech-lead, integrator, ops]
code_path:
  - backend/app/models/data_context.py
  - backend/app/repositories/data_context_repository.py
table_name: data_contexts
related_tables: [patient, research_project, project_patient, schema_template_version, record_instance, field_current_value, field_value_event]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# 表-data_context

> [!info] 字段定义以 SQLAlchemy model + Alembic migration 为准
> 本文只描述**业务含义、生命周期、典型查询**。

## 用途
**数据上下文**——一个"抽取/填写工作区"的根实体，把 (患者 / 可选项目 / Schema 版本) 三元组绑定成一个容器。所有 `record_instance` / `field_current_value` / `field_value_event` 都挂在某个 `data_context` 下。

可以把它理解为"一份按某个 Schema 版本组织起来的患者电子病历"或"某患者在某项目下的 CRF"。

## 字段业务含义
| 字段 | 业务含义 | 取值约束 / 枚举 |
|---|---|---|
| context_type | 上下文类型 | `patient_ehr`（患者电子病历） / `project_crf`（项目 CRF 表单） |
| patient_id | 关联患者 | 必填 |
| project_id | 关联科研项目 | 仅 `project_crf` 类型需要 |
| project_patient_id | 关联入组记录 | 仅 `project_crf` 类型需要；定位到"该患者在该项目下的入组实例" |
| schema_version_id | 绑定的 Schema 版本 | 必填——上下文的字段结构完全由该版本决定 |
| status | 状态 | `draft`（默认） / 其他取值集合 TBD（看服务层） |
| created_by | 创建者（软外键 → users.id） | — |

## 关键索引
> 该表 model 未声明显式 `Index`；通过外键列与服务层组合查询（`context_type` + `patient_id` + `schema_version_id` 组合）。后续如出现热点可补 `idx_data_contexts_patient_type`、`idx_data_contexts_project_patient` 等。

## 生命周期
- 创建：
  - `patient_ehr`：首次为某患者按某 Schema 版本启动抽取时由 `EhrService` 创建（每患者每 schema 版本至多 1 条）。
  - `project_crf`：患者入组项目后，需要按项目绑定的主 CRF 填写时由 `ResearchProjectService` 创建。
- 更新：通常仅 `status` 变化；schema 版本一旦绑定就不再变（要换版本会新建另一条 context）。
- 删除/归档：当前未实现物理删除；上层通过状态切换 / 软删 patient 间接禁用。

## 与其他表的关系
- [[表-patient]] — N:1。
- [[表-research_project]] / [[表-project_patient]] — N:1（仅 CRF 类型）。
- [[表-schema_template_version]] — N:1，决定字段结构。
- [[表-record_instance]] — 1:N，schema 中的每个 form/repeat 实例都是一条 record。
- [[表-field_current_value]] — 1:N，当前值表。
- [[表-field_value_event]] — 1:N，所有候选事件。

## 典型查询
```sql
-- 业务场景：获取某患者在某 Schema 版本下的 EHR 上下文（不存在则需创建）
SELECT *
FROM data_contexts
WHERE context_type = 'patient_ehr'
  AND patient_id = :patient_id
  AND schema_version_id = :schema_version_id
LIMIT 1;
```

```sql
-- 业务场景：列出某项目下所有入组患者的 CRF 上下文（批量计算完整度）
SELECT *
FROM data_contexts
WHERE context_type = 'project_crf'
  AND project_patient_id = ANY(:project_patient_ids);
```
