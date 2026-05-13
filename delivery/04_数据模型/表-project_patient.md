---
type: data-model
module: 科研项目与数据集
status: draft
audience: [tech-lead, integrator, ops]
code_path:
  - backend/app/models/project_patient.py
  - backend/app/repositories/research_project_repository.py
table_name: project_patients
related_tables: [research_project, patient, data_context, extraction_job]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# 表-project_patient

> [!info] 字段定义以 SQLAlchemy model + Alembic migration 为准
> 本文只描述**业务含义、生命周期、典型查询**。

## 用途
**项目-患者入组关系**（M:N 关联表）——记录"某患者在某项目下的入组实例"。每条入组实例有自己的 `enroll_no`、状态与撤回时间，并作为 [[表-data_context]] 中 `project_crf` 类型的锚点。

## 字段业务含义
| 字段 | 业务含义 | 取值约束 / 枚举 |
|---|---|---|
| project_id | 关联项目 | 必填，`uk_project_patient` 与 patient_id 联合唯一 |
| patient_id | 关联患者 | 必填 |
| enroll_no | 入组编号 | 自由字符串，项目内业务编号（不一定全局唯一） |
| status | 入组状态 | `enrolled`（默认） / `withdrawn`（撤回）；其他取值 TBD |
| enrolled_at | 入组时间 | — |
| withdrawn_at | 撤回时间 | `withdraw_by_patient` 写入 |
| extra_json | 业务扩展字段 | 自由 JSON |

## 关键索引
| 索引 | 用途 |
|---|---|
| `uk_project_patient` (unique on project_id+patient_id) | 同一患者在同一项目内只有一条入组记录 |

## 生命周期
- 创建：项目侧"添加入组患者"时写入（`status='enrolled'`、`enrolled_at=now()`）。
- 更新：可改 `enroll_no` / `extra_json`；`status='withdrawn'` 同时写 `withdrawn_at`。
- 删除：不物理删——撤回即可。患者被软删时由 `withdraw_by_patient` 批量改为 `withdrawn`。

## 与其他表的关系
- [[表-research_project]] / [[表-patient]] — 多对一组合表。
- [[表-data_context]] — 1:N（`project_crf` 类型的上下文按 project_patient_id 定位）。
- [[表-extraction_job]] — N:1（项目内抽取任务带 project_patient_id）。

## 典型查询
```sql
-- 业务场景：项目入组列表（未撤回）
SELECT pp.id, pp.patient_id, p.name, pp.enroll_no, pp.enrolled_at
FROM project_patients pp
JOIN patients p ON p.id = pp.patient_id
WHERE pp.project_id = :project_id
  AND pp.status != 'withdrawn'
ORDER BY pp.created_at DESC;
```

```sql
-- 业务场景：某患者参与的所有项目（联表显示项目元信息）
SELECT pp.*, rp.project_name
FROM project_patients pp
JOIN research_projects rp ON rp.id = pp.project_id
WHERE pp.patient_id = :patient_id
  AND pp.status != 'withdrawn'
  AND rp.status != 'deleted'
ORDER BY pp.created_at DESC;
```
