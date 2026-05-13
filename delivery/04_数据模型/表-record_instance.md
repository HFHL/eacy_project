---
type: data-model
module: Schema模板与CRF
status: draft
audience: [tech-lead, integrator, ops]
code_path:
  - backend/app/models/record_instance.py
  - backend/app/repositories/data_context_repository.py
table_name: record_instances
related_tables: [data_context, field_current_value, field_value_event, document, extraction_run]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# 表-record_instance

> [!info] 字段定义以 SQLAlchemy model + Alembic migration 为准
> 本文只描述**业务含义、生命周期、典型查询**。

## 用途
**记录实例**——Schema 中可重复表单（form）的一次具体出现。例如"住院记录"是一个 form，患者多次住院就有多条 record_instance（`repeat_index` 区分）。所有字段值（[[表-field_current_value]] / [[表-field_value_event]]）都挂在某个 record_instance 下。

## 字段业务含义
| 字段 | 业务含义 | 取值约束 / 枚举 |
|---|---|---|
| context_id | 所属 data_context | 必填 |
| group_key / group_title | Schema 分组（科室 / 大类）标识与中文 | 可空，用于 UI 分组 |
| form_key | Schema 中的 form 标识 | 必填 |
| form_title | Form 中文标题（快照） | 必填，避免 schema 演进后失文 |
| repeat_index | 重复实例序号 | 从 0 起；单实例 form 固定 0；多次住院类 form 递增 |
| instance_label | 实例显示名 | 如"2025-03-15 第一次住院" |
| anchor_json | 锚点信息 | 业务上用于"该实例对应原文哪段"等，结构 TBD |
| source_document_id | 来源文档 | 由抽取流程写入，标记"这次实例最初来自哪份文档" |
| created_by_run_id | 创建该实例的 extraction_run | 抽取产生的实例必填；手工新增可空 |
| review_status | 复核状态 | `unreviewed`（默认） / 其他取值集合 TBD |

## 关键索引
| 索引 | 用途 |
|---|---|
| `uk_record_instance` (unique on context_id+form_key+repeat_index) | 防止同一上下文同 form 同 repeat_index 重复 |
| `idx_record_instances_context` | 按 context 列出全部 record |

## 生命周期
- 创建：
  - AI 抽取识别出新的可重复实例（如新一次住院记录） → Worker 通过 `next_repeat_index` 取下一个 index 后插入。
  - 用户手工新增一条重复实例（前端"新增"按钮）。
- 更新：`review_status` / `instance_label` 等可改；`form_key` 与 `repeat_index` 一般不改。
- 删除：删除某条重复实例时，同步级联删 [[表-field_current_value]] 与 [[表-field_value_event]]（见 `delete_by_record`）。

## 与其他表的关系
- [[表-data_context]] — N:1。
- [[表-field_current_value]] — 1:N。
- [[表-field_value_event]] — 1:N。
- [[表-document]] — N:1（`source_document_id`）。
- [[表-extraction_run]] — N:1（`created_by_run_id`）。

## 典型查询
```sql
-- 业务场景：渲染某 context 下的所有 form 实例（按创建时间）
SELECT id, form_key, form_title, repeat_index, instance_label, review_status
FROM record_instances
WHERE context_id = :context_id
ORDER BY created_at;
```

```sql
-- 业务场景：取某 form 的下一个 repeat_index（新增实例前）
SELECT COALESCE(MAX(repeat_index), -1) + 1
FROM record_instances
WHERE context_id = :context_id AND form_key = :form_key;
```
