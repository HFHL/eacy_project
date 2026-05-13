---
type: index
module: 数据模型
status: reviewed
audience: [tech-lead, integrator, ops]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# 04 数据模型

> 一表一文。**字段类型、约束、长度以 SQLAlchemy model + Alembic migration 为准**，本模块只写**业务含义、生命周期、典型查询、表间关系**。

## 表清单（与 `backend/app/models/` 一一对应）

| 表名 | 文档 | 业务域 |
|---|---|---|
| `user` | 表-user.md | 用户系统 |
| `patient` | 表-patient.md | 病例管理 |
| `document` | 表-document.md | 文档与OCR |
| `data_context` | 表-data_context.md | AI抽取 |
| `extraction_job` | 表-extraction_job.md | AI抽取 |
| `extraction_run` | 表-extraction_run.md | AI抽取 |
| `field_current_value` | 表-field_current_value.md | AI抽取 / EHR |
| `field_value_event` | 表-field_value_event.md | AI抽取 / EHR |
| `field_value_evidence` | 表-field_value_evidence.md | AI抽取 / 证据归因 |
| `record_instance` | 表-record_instance.md | Schema 嵌套 |
| `schema_template` | 表-schema_template.md | Schema模板 |
| `schema_template_version` | 表-schema_template_version.md | Schema模板 |
| `research_project` | 表-research_project.md | 科研项目 |
| `project_patient` | 表-project_patient.md | 科研项目 |
| `project_template_binding` | 表-project_template_binding.md | 科研项目 |
| `async_task` | 表-async_task.md | 异步任务 |

## 计划补充

- **ER全景.canvas** — Canvas 形式 ER 图，按业务域分簇
- 各表文档逐张产出（用 `T-数据表.md` 模板）

## Migration 与代码关系

- Migration：`backend/migrations/`（Alembic）
- ORM 模型：`backend/app/models/*.py`
- 表结构演进**只看 Alembic**，本模块不做 changelog
