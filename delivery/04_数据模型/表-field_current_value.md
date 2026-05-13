---
type: data-model
module: AI抽取
status: draft
audience: [tech-lead, integrator, ops]
code_path:
  - backend/app/models/field_current_value.py
  - backend/app/repositories/field_value_repository.py
  - backend/app/services/structured_value_service.py
table_name: field_current_values
related_tables: [data_context, record_instance, field_value_event, schema_template_version]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# 表-field_current_value

> [!info] 字段定义以 SQLAlchemy model + Alembic migration 为准
> 本文只描述**业务含义、生命周期、典型查询**。

## 用途
**字段当前值表**——每个 (上下文 + 记录实例 + 字段路径) 唯一一条，记录"该字段当前展示给用户的值"。它是 [[表-field_value_event]] 的物化视图：从众多候选事件里选出一条（`selected_event_id`），其内容快照到本表，配合 EHR / CRF 前端直接渲染。

## 字段业务含义
| 字段 | 业务含义 | 取值约束 / 枚举 |
|---|---|---|
| context_id | 所属 data_context | 必填 |
| record_instance_id | 所属记录实例 | 必填（嵌套/重复表单的某一行） |
| field_key | 字段标识（schema 内的 key） | 与 schema 定义一致 |
| field_path | 字段完整路径 | 形如 `form.subform[0].field`；与 `(context_id, record_instance_id)` 一起唯一（`uk_current_field`） |
| selected_event_id | 选中的事件 | 指向 [[表-field_value_event]]；手工录入时可为 NULL |
| value_type | 值类型 | `string` / `number` / `date` / `datetime` / `json`（见 `simple_ehr_extractor.py`） |
| value_text / value_number / value_date / value_datetime / value_json | 类型化值列 | 按 value_type 取对应列；非对应列保持 NULL |
| unit | 单位 | 数值字段常用（如 `mg/dL`） |
| selected_by | 选定人（软外键 → users.id） | 可空（自动接受时为 NULL） |
| selected_at | 选定时间 | — |
| review_status | 复核状态 | `unreviewed`（默认） / `accepted` / `rejected` 等；与事件的同名字段对齐 |
| updated_at | 更新时间 | 由本表自维护（注意：本表无 TimestampMixin，只有 `updated_at` 显式列） |

## 关键索引
| 索引 | 用途 |
|---|---|
| `uk_current_field` (unique on context_id+record_instance_id+field_path) | 保证字段唯一；用于 PostgreSQL `ON CONFLICT` upsert |

## 生命周期
- 创建/更新：通过 `FieldCurrentValueRepository.upsert_selected_value` 走 `INSERT ... ON CONFLICT DO UPDATE`。两个触发场景：
  1. 用户在 EHR/CRF UI 选定某个候选事件
  2. 抽取流程自动接受 (`auto-accept`) 单一候选时
- 删除：
  - 按 (context_id, field_path) 删除：字段被从 schema 移除或重抽时清理（`delete_by_context_field`）
  - 按 record_instance 删除：删除整个嵌套实例时级联（`delete_by_record`）

## 与其他表的关系
- [[表-data_context]] — N:1。
- [[表-record_instance]] — N:1。
- [[表-field_value_event]] — N:1，`selected_event_id`。
- [[表-schema_template_version]] — 间接通过 data_context.schema_version_id 决定 field_path 的语义。

## 典型查询
```sql
-- 业务场景：渲染某 context 下的所有当前值（前端 EHR 表单回填）
SELECT field_path, value_type, value_text, value_number, value_date,
       value_datetime, value_json, unit, review_status
FROM field_current_values
WHERE context_id = :context_id;
```

```sql
-- 业务场景：项目完整度统计 —— 多个 context 一次查
SELECT context_id, field_path, review_status
FROM field_current_values
WHERE context_id = ANY(:context_ids);
```
