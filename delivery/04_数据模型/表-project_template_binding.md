---
type: data-model
module: 科研项目与数据集
status: draft
audience: [tech-lead, integrator, ops]
code_path:
  - backend/app/models/project_template_binding.py
  - backend/app/repositories/research_project_repository.py
table_name: project_template_bindings
related_tables: [research_project, schema_template, schema_template_version]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# 表-project_template_binding

> [!info] 字段定义以 SQLAlchemy model + Alembic migration 为准
> 本文只描述**业务含义、生命周期、典型查询**。

## 用途
**项目 ↔ Schema 模板版本绑定**——指明"某项目在某种角色下使用哪个模板的哪个版本"。其中 `binding_type='primary_crf'` 是 CRF 主表单的绑定。

## 字段业务含义
| 字段 | 业务含义 | 取值约束 / 枚举 |
|---|---|---|
| project_id | 关联项目 | 必填 |
| template_id | 模板（冗余存）| 必填，便于按模板维度查询 |
| schema_version_id | 模板的具体版本 | 必填，与 template_id 一致性由应用层保证 |
| binding_type | 绑定类型 | 已知 `primary_crf`（项目主 CRF）；其他类型 TBD |
| status | 绑定状态 | `active`（默认） / 业务上可能 `inactive`；TBD |
| locked_at | 锁定时间 | 项目数据进入正式阶段后锁定，防止换版本 |

## 关键索引
| 索引 | 用途 |
|---|---|
| `uk_project_template_binding` (unique on project_id+schema_version_id+binding_type) | 同一项目同一类型同一版本不重复 |

## 生命周期
- 创建：项目首次"设置主 CRF 模板"时写入 `binding_type='primary_crf', status='active'`。
- 更新：换版本时一般**新增**新的绑定并把旧记录置为 inactive；或保持唯一约束下替换 schema_version_id（具体策略 TBD）。
- 锁定：达到一定阶段调用业务接口设置 `locked_at`；之后不允许换版本。
- 删除：业务上不物理删；通过 `status` 弃用。

## 与其他表的关系
- [[表-research_project]] — N:1。
- [[表-schema_template]] — N:1（冗余字段）。
- [[表-schema_template_version]] — N:1（核心）。

## 典型查询
```sql
-- 业务场景：取项目当前激活的主 CRF 绑定
SELECT *
FROM project_template_bindings
WHERE project_id = :project_id
  AND binding_type = 'primary_crf'
  AND status = 'active'
LIMIT 1;
```

```sql
-- 业务场景：批量获取多个项目的主 CRF 版本（用于项目列表展示绑定状态）
SELECT *
FROM project_template_bindings
WHERE project_id = ANY(:project_ids)
  AND binding_type = 'primary_crf'
  AND status = 'active';
```
