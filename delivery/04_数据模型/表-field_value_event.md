---
type: data-model
module: AI抽取
status: draft
audience: [tech-lead, integrator, ops]
code_path:
  - backend/app/models/field_value_event.py
  - backend/app/repositories/field_value_repository.py
  - backend/app/services/structured_value_service.py
table_name: field_value_events
related_tables: [data_context, record_instance, extraction_run, document, field_current_value, field_value_evidence]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# 表-field_value_event

> [!info] 字段定义以 SQLAlchemy model + Alembic migration 为准
> 本文只描述**业务含义、生命周期、典型查询**。

## 用途
**字段值事件流（事实表 / append-only）**——每个字段的每一次"被抽出 / 被人工填入 / 被人工修改"都是一条 event。是审计、冲突检测、证据归因的基础；[[表-field_current_value]] 是从它里挑选出的当前值。

## 字段业务含义
| 字段 | 业务含义 | 取值约束 / 枚举 |
|---|---|---|
| context_id | 所属 data_context | 必填 |
| record_instance_id | 所属记录实例 | 必填 |
| field_key / field_path | 字段标识与完整路径 | 与 [[表-field_current_value]] 一致 |
| field_title | 字段中文标题（快照） | 用于事后展示，避免 schema 演进后失文 |
| event_type | 事件类型 | `ai_extracted`（AI 抽取） / `manual_edit`（人工编辑），见 `structured_value_service.py` L144/L170 |
| value_type | 值类型 | 同 `field_current_value` |
| value_text / number / date / datetime / json / unit | 类型化值 | — |
| normalized_text | 标准化后的文本表示 | 可选，用于对比、去重 |
| confidence | LLM 置信度 | 0–1，Numeric(5,4)，仅 `ai_extracted` 有意义 |
| extraction_run_id | 来源 run | `ai_extracted` 必填；`manual_edit` 为 NULL |
| source_document_id | 来源文档 | `ai_extracted` 一般有值；用于证据回溯 |
| source_event_id | 前序事件 | 修改/链式编辑时指向上一条 event，形成事件链 |
| review_status | 复核状态 | `candidate`（默认） / `accepted` / `rejected` / `conflict`（见 `dashboard_service.py` 引用） |
| created_by | 操作人 | `manual_edit` 必填；`ai_extracted` 通常为 NULL 或系统用户 |
| note | 备注 | 自由文本，常用于人工编辑说明 |

## 关键索引
| 索引 | 用途 |
|---|---|
| `idx_field_events_context` | 按上下文聚合事件 |
| `idx_field_events_instance` | 按记录实例聚合 |
| `idx_field_events_field_path` | 跨上下文按字段维度分析 |
| `idx_field_events_run` | 某次 run 写入的所有事件 |
| `idx_field_events_doc` | 某文档贡献的所有字段事件 |

## 生命周期
- 创建：
  - AI 抽取：每次 run 解析出 (字段, 值) 即写一条 `event_type='ai_extracted', review_status='candidate'`。
  - 人工编辑：`structured_value_service.record_manual_edit` 写 `event_type='manual_edit'`。
- 更新：通常 **append-only**；唯一会被改写的是 `review_status`（`candidate → accepted/rejected`，见 `structured_value_service` L123 `event.review_status = "accepted"`）。
- 删除：
  - 按 (context, field_path) 删：字段移除/重抽时（`delete_by_context_field`）
  - 按 record_instance 删：删除嵌套实例时级联

## 与其他表的关系
- [[表-data_context]] / [[表-record_instance]] — N:1。
- [[表-extraction_run]] — N:1，溯源 LLM 调用。
- [[表-document]] — N:1（`source_document_id`），证据归因起点。
- [[表-field_value_evidence]] — 1:N，每个事件可有多条证据行（不同坐标/页/单元格）。
- [[表-field_value_event]] — 自引用（`source_event_id`），形成编辑链。

## 典型查询
```sql
-- 业务场景：候选事件清单（字段冲突解决面板）
SELECT id, value_text, value_number, value_date, confidence,
       source_document_id, extraction_run_id, review_status, created_at
FROM field_value_events
WHERE context_id = :context_id
  AND field_path = :field_path
  AND review_status IN ('candidate', 'accepted')
ORDER BY created_at DESC;
```

```sql
-- 业务场景：Dashboard "字段冲突待处理"数量
SELECT COUNT(*) FROM field_value_events WHERE review_status = 'conflict';
```
