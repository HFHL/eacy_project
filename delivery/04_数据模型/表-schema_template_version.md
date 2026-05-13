---
type: data-model
module: Schema模板与CRF
status: draft
audience: [tech-lead, integrator, ops]
code_path:
  - backend/app/models/schema_template_version.py
  - backend/app/repositories/schema_template_repository.py
  - backend/app/services/schema_service.py
  - backend/app/services/schema_field_planner.py
table_name: schema_template_versions
related_tables: [schema_template, data_context, project_template_binding, extraction_job]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# 表-schema_template_version

> [!info] 字段定义以 SQLAlchemy model + Alembic migration 为准
> 本文只描述**业务含义、生命周期、典型查询**。

## 用途
**Schema 模板的具体版本**——保存完整的字段结构 JSON。所有抽取与表单填写都**绑定到具体版本**而不是模板本身，保证 schema 演进时已有数据不漂移。

## 字段业务含义
| 字段 | 业务含义 | 取值约束 / 枚举 |
|---|---|---|
| template_id | 所属模板 | 必填 |
| version_no | 版本号 | 模板内单调递增；`uk_template_version` 唯一 |
| version_name | 版本展示名 | 可空，如 "v2-加心电图字段" |
| schema_json | 完整 schema 定义 | 嵌套结构：group → form → field；由 `SchemaFieldPlanner` 解析 |
| status | 版本状态 | `draft` / `published` / `deprecated`（见 `schema_service.py` L169-L190） |
| published_at | 发布时间 | `draft → published` 时写入 |
| created_by | 创建者（软外键 → users.id） | — |

## 关键索引
| 索引 | 用途 |
|---|---|
| `uk_template_version` (unique on template_id+version_no) | 防止版本号冲突 |

## 生命周期
- 创建：在 CRF 设计器中保存新版本时插入（`status=draft`）。
- 更新：
  - `draft` 期间 `schema_json` 可改。
  - 状态流转：`draft → published`（发布，写 `published_at`） → `deprecated`（弃用）。
- 删除：业务上不删除。已被 [[表-data_context]] 或 [[表-project_template_binding]] 引用的版本，删除会被 `has_references` 守卫阻止。

## 与其他表的关系
- [[表-schema_template]] — N:1。
- [[表-data_context]] — 1:N，上下文绑定到该版本。
- [[表-project_template_binding]] — 1:N，项目绑定到该版本。
- [[表-extraction_job]] — N:1（`schema_version_id`）。

## 典型查询
```sql
-- 业务场景：列出某模板的所有版本（最新在前）
SELECT id, version_no, version_name, status, published_at
FROM schema_template_versions
WHERE template_id = :template_id
ORDER BY version_no DESC;
```

```sql
-- 业务场景：判断版本是否仍被引用（删除/弃用前置检查）
SELECT
  (SELECT COUNT(*) FROM data_contexts WHERE schema_version_id = :v) AS ctx_refs,
  (SELECT COUNT(*) FROM project_template_bindings WHERE schema_version_id = :v) AS binding_refs;
```
