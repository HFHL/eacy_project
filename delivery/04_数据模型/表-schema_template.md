---
type: data-model
module: Schema模板与CRF
status: draft
audience: [tech-lead, integrator, ops]
code_path:
  - backend/app/models/schema_template.py
  - backend/app/repositories/schema_template_repository.py
  - backend/app/services/schema_service.py
table_name: schema_templates
related_tables: [schema_template_version, project_template_binding]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# 表-schema_template

> [!info] 字段定义以 SQLAlchemy model + Alembic migration 为准
> 本文只描述**业务含义、生命周期、典型查询**。

## 用途
**Schema 模板**——CRF / EHR 表单的逻辑容器（"心衰术后随访 CRF" 这一类）。本表只保存**模板元信息**，具体字段结构（schema_json）在 [[表-schema_template_version]]。

## 字段业务含义
| 字段 | 业务含义 | 取值约束 / 枚举 |
|---|---|---|
| template_code | 业务编码 | 全表唯一（`uk_schema_templates_code`） |
| template_name | 中文名 | 用于展示 |
| template_type | 模板类型 | 业务上至少 `patient_ehr` / `project_crf`（用于按类型筛选与定位"最新已发布版本"） |
| description | 描述 | 自由文本 |
| status | 模板状态 | `draft` / `active` / `archived`（见 `schema_service.py` L120/L160） |
| created_by | 创建者（软外键 → users.id） | — |

## 关键索引
| 索引 | 用途 |
|---|---|
| `uk_schema_templates_code` (unique) | 业务编码唯一 |

## 生命周期
- 创建：管理员在 CRF 设计器中新建（`status=draft`）。
- 更新：
  - 元信息（名称/描述）可改。
  - `status` 流转：`draft → active`（启用） / `active → archived`（停用）。
- 删除：业务上**不物理删**，统一走 `archived`。`archived` 后即使再切回 `active` 也被服务层阻止（见 `schema_service.py` L120 的守卫）。

## 与其他表的关系
- [[表-schema_template_version]] — 1:N，模板的多个版本。
- [[表-project_template_binding]] — 1:N，项目绑定到具体某版本时会冗余存储 template_id。

## 典型查询
```sql
-- 业务场景：列出 active 的 CRF 模板
SELECT id, template_code, template_name, description, created_at
FROM schema_templates
WHERE status = 'active' AND template_type = 'project_crf'
ORDER BY created_at DESC;
```

```sql
-- 业务场景：取某模板类型下最新已发布版本（联表）
SELECT v.*
FROM schema_template_versions v
JOIN schema_templates t ON t.id = v.template_id
WHERE t.template_type = :type
  AND t.status = 'active'
  AND v.status = 'published'
ORDER BY v.version_no DESC
LIMIT 1;
```
