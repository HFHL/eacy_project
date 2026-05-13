---
type: data-model
module: 病例管理
status: draft
audience: [tech-lead, integrator, ops]
code_path:
  - backend/app/models/patient.py
  - backend/app/repositories/patient_repository.py
table_name: patients
related_tables: [document, data_context, extraction_job, project_patient, user]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# 表-patient

> [!info] 字段定义以 SQLAlchemy model + Alembic migration 为准
> 本文只描述**业务含义、生命周期、典型查询**。

## 用途
平台核心实体——**患者/病例**。所有文档、抽取结果、CRF 数据都挂在这张表下。支持软删除（`deleted_at`）。

## 字段业务含义
| 字段 | 业务含义 | 取值约束 / 枚举 |
|---|---|---|
| name | 患者姓名 | 必填 |
| gender | 性别 | 业务上常见 `男` / `女` / `未知`，无 DB 枚举约束 |
| birth_date | 出生日期 | 与 `age` 任一可填，二者不强制一致 |
| age | 年龄（采集时） | 直接取自原始文档；与 `birth_date` 并存，不自动推导 |
| department | 科室 | 自由文本；有 `idx_patients_department` 单列索引 |
| main_diagnosis | 主诊断 | 自由文本 |
| doctor_name | 主管医生姓名 | 自由文本 |
| owner_id | 归属用户（软外键 → users.id） | 数据隔离：列表/详情默认按当前用户的 owner_id 过滤 |
| extra_json | 业务扩展字段 | 自由 JSON，结构由 [[02_业务域/病例管理/业务概述]] 描述 |
| deleted_at | 软删除时间 | `NULL` 表示可见；非空表示已软删，列表/详情接口默认过滤掉 |

## 关键索引
| 索引 | 用途 |
|---|---|
| `idx_patients_name` | 姓名模糊检索（`ilike`） |
| `idx_patients_department` | 按科室筛选 |
| `idx_patients_owner_id` | 按归属用户过滤（多租户数据隔离主路径） |

## 生命周期
- 创建：手动新建，或由文档上传后的"病例归档"流程自动创建（见 [[02_业务域/病例管理/业务概述]]）。
- 更新：用户编辑基本信息；`extra_json` 也可被业务流程写入。
- 删除/归档：**仅软删**——`PatientRepository.soft_delete` 设置 `deleted_at = now()`。删除前 `has_business_data` 检查是否有 `document` / `project_patient` 关联（业务流程决定是否阻止）。

## 与其他表的关系
- [[表-document]] — 1:N，`document.patient_id` 指向本表；软删除患者时其文档由业务流程级联软删。
- [[表-data_context]] — 1:N，`data_context.patient_id`；每个患者每个 schema 版本最多一条 `patient_ehr` 上下文。
- [[表-extraction_job]] — 1:N，AI 抽取任务绑定到 patient。
- [[表-project_patient]] — 1:N（实际中 M:N 通过 `project_patient`），患者入组到多个科研项目。
- [[表-user]] — N:1，通过 `owner_id`（软外键）。

## 典型查询
```sql
-- 业务场景：列出当前用户名下可见（未软删）的病例
SELECT id, name, gender, age, department, main_diagnosis
FROM patients
WHERE deleted_at IS NULL
  AND owner_id = :current_user_id
ORDER BY created_at DESC
LIMIT 20 OFFSET :offset;
```

```sql
-- 业务场景：按姓名模糊搜索（前缀关键词由前端传入）
SELECT id, name, department
FROM patients
WHERE deleted_at IS NULL
  AND owner_id = :current_user_id
  AND (name ILIKE :kw OR main_diagnosis ILIKE :kw OR doctor_name ILIKE :kw)
ORDER BY created_at DESC
LIMIT 20;
```
