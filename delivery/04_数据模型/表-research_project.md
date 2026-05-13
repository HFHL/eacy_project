---
type: data-model
module: 科研项目与数据集
status: draft
audience: [tech-lead, integrator, ops]
code_path:
  - backend/app/models/research_project.py
  - backend/app/repositories/research_project_repository.py
  - backend/app/services/research_project_service.py
table_name: research_projects
related_tables: [project_patient, project_template_binding, data_context, user]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# 表-research_project

> [!info] 字段定义以 SQLAlchemy model + Alembic migration 为准
> 本文只描述**业务含义、生命周期、典型查询**。

## 用途
**科研项目实体**——一个带 Schema 绑定 + 入组患者集合的研究单元。负责人通过 `owner_id` 标识。

## 字段业务含义
| 字段 | 业务含义 | 取值约束 / 枚举 |
|---|---|---|
| project_code | 项目编码 | 全表唯一（`uk_project_code`） |
| project_name | 项目名称 | 必填 |
| description | 描述 | 自由文本 |
| status | 项目状态 | `draft`（默认） / 其他取值业务上至少包含 `deleted`（软删，列表自动过滤，见 repo L35/L47） |
| owner_id | 项目负责人（软外键 → users.id） | 数据隔离主键 |
| start_date / end_date | 项目周期 | 仅展示 |
| extra_json | 业务扩展字段 | 自由 JSON |

## 关键索引
| 索引 | 用途 |
|---|---|
| `uk_project_code` (unique) | 编码唯一 |

> model 未声明其他显式索引；列表查询主要通过 `owner_id` + `status` 走全表扫或主键，量级小可接受。

## 生命周期
- 创建：管理员/研究员创建项目（`status=draft`）。
- 更新：基本元信息可改；通过 `ProjectTemplateBindingRepository` 绑定主 CRF 模板版本。
- 删除：软删——`status='deleted'`（不物理删）。

## 与其他表的关系
- [[表-project_patient]] — 1:N，项目下的入组患者。
- [[表-project_template_binding]] — 1:N，项目绑定的 CRF 模板版本。
- [[表-data_context]] — 通过 project_id（仅 `project_crf` 类型）。
- [[表-user]] — N:1（`owner_id`）。

## 典型查询
```sql
-- 业务场景：列出当前用户的项目（排除已删除）
SELECT id, project_code, project_name, status, start_date, end_date
FROM research_projects
WHERE owner_id = :current_user_id
  AND status != 'deleted'
ORDER BY created_at DESC
LIMIT 100;
```

```sql
-- 业务场景：项目列表附入组人数（批量聚合）
SELECT p.id, p.project_name, COUNT(pp.id) AS active_enrolled
FROM research_projects p
LEFT JOIN project_patients pp
  ON pp.project_id = p.id AND pp.status != 'withdrawn'
WHERE p.status != 'deleted'
GROUP BY p.id, p.project_name;
```
