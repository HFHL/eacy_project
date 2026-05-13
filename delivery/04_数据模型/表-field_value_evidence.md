---
type: data-model
module: AI抽取
status: draft
audience: [tech-lead, integrator, ops]
code_path:
  - backend/app/models/field_value_evidence.py
  - backend/app/repositories/field_value_repository.py
  - backend/app/services/evidence_location_resolver.py
table_name: field_value_evidence
related_tables: [field_value_event, document]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# 表-field_value_evidence

> [!info] 字段定义以 SQLAlchemy model + Alembic migration 为准
> 本文只描述**业务含义、生命周期、典型查询**。

## 用途
**证据行**——把某个 [[表-field_value_event]] 的值锚定到具体文档的具体位置（页码、坐标、表格单元格、文本偏移）。用于前端"原文回溯/高亮"功能与可追溯性。

## 字段业务含义
| 字段 | 业务含义 | 取值约束 / 枚举 |
|---|---|---|
| value_event_id | 关联的字段值事件 | 必填 |
| document_id | 证据所在文档 | 必填 |
| page_no | 页码 | 1-based |
| bbox_json | 边界框坐标 | OCR 坐标系，结构由 `evidence_location_resolver` 写入 |
| quote_text | 原文引用片段 | 用于人工核对 |
| evidence_type | 证据来源类型 | TBD：业务上至少包含"自由文本片段"与"表格单元格"两类；具体取值集合看 `EvidenceLocationResolver` |
| row_key / cell_key | 表格定位 | `evidence_type` 为表格类时使用，配合 `idx_evidence_row_cell` 索引 |
| start_offset / end_offset | 在 OCR 文本中的字符偏移 | 用于纯文本类证据 |
| evidence_score | 证据匹配置信度 | 0–1 |

## 关键索引
| 索引 | 用途 |
|---|---|
| `idx_evidence_event` | 字段详情 → 证据列表 |
| `idx_evidence_document` | 删除文档前评估影响范围 |
| `idx_evidence_row_cell` | 表格类证据按行/列定位 |

## 生命周期
- 创建：抽取流程在写入 `field_value_event` 后，由 `EvidenceLocationResolver` 解析 LLM 输出与 OCR 布局，生成 0..N 条 evidence。
- 更新：基本不更新，append-only。
- 删除：
  - 字段被移除/重抽：先按 event_id 批量删（`delete_by_event_ids` / `delete_by_context_field`）。
  - 文档删除前先用 `summarize_by_document_id` 提示影响的字段清单。

## 与其他表的关系
- [[表-field_value_event]] — N:1。
- [[表-document]] — N:1。

## 典型查询
```sql
-- 业务场景：字段详情侧栏列出所有证据
SELECT id, document_id, page_no, bbox_json, quote_text, evidence_score
FROM field_value_evidence
WHERE value_event_id = :event_id
ORDER BY created_at DESC;
```

```sql
-- 业务场景：删除文档前列出受影响的字段（带去重）
SELECT DISTINCT e.field_key, e.field_title
FROM field_value_evidence v
JOIN field_value_events e ON e.id = v.value_event_id
WHERE v.document_id = :doc_id;
```
