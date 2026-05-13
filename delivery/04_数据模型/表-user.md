---
type: data-model
module: 用户系统与权限
status: draft
audience: [tech-lead, integrator, ops]
code_path:
  - backend/app/models/user.py
  - backend/app/repositories/user_repository.py
table_name: users
related_tables: [patient, document, research_project, extraction_job]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# 表-user

> [!info] 字段定义以 SQLAlchemy model + Alembic migration 为准
> 本文只描述**业务含义、生命周期、典型查询**。

## 用途
平台账号实体。承载登录凭证、角色、启用状态，被业务表通过 `owner_id` / `uploaded_by` / `created_by` / `requested_by` 等"软外键"引用（未在 DB 层建立 FK，仅在应用层保证）。

## 字段业务含义
| 字段 | 业务含义 | 取值约束 / 枚举 |
|---|---|---|
| email | 登录与通知邮箱 | 全表唯一（`idx_users_email` 唯一索引） |
| username | 登录用户名 | 全表唯一（`idx_users_username` 唯一索引） |
| name | 显示名（中文姓名） | 可空，仅用于展示 |
| password_hash | 密码哈希 | 不存明文；算法见 `core/security` |
| role | 角色 | 至少包含 `user` / `admin`；默认 `user`；具体集合 TBD |
| permissions | 细粒度权限字符串 | 业务上为逗号分隔列表，具体语义参见 [[02_业务域/用户系统与权限/业务概述]] |
| is_active | 是否启用 | `false` 表示被禁用，登录会被拒绝 |
| last_login_at | 上次登录时间 | 登录成功时刷新 |

## 关键索引
| 索引 | 用途 |
|---|---|
| `idx_users_email` (unique) | 邮箱登录、唯一性约束 |
| `idx_users_username` (unique) | 用户名登录、唯一性约束 |

## 生命周期
- 创建：管理员后台新建或自助注册（路径见 [[02_业务域/用户系统与权限/业务概述]]）。
- 更新：登录刷新 `last_login_at`；管理员可改 `role` / `permissions` / `is_active`；用户改密码会重写 `password_hash`。
- 删除/归档：当前**不物理删除**也无 `deleted_at`，禁用账号通过 `is_active=false`。

## 与其他表的关系
- [[表-patient]] — `patient.owner_id` 指向创建该病例的用户。
- [[表-document]] — `document.uploaded_by` 指向上传者。
- [[表-research_project]] — `research_project.owner_id` 指向项目负责人。
- [[表-extraction_job]] — `extraction_job.requested_by` 指向发起抽取的用户。
- [[表-data_context]] / [[表-schema_template]] 等 — `created_by` 同义。

> [!warning] 软外键
> 上述引用列均未在 DB 层声明 FOREIGN KEY（model 中只是 `Uuid` 列），删除/合并账号时需应用层手工处理。

## 典型查询
```sql
-- 业务场景：登录鉴权（按邮箱或用户名 + 启用状态）
SELECT id, password_hash, role, permissions, is_active
FROM users
WHERE (email = :login OR username = :login)
  AND is_active = TRUE;
```

```sql
-- 业务场景：管理后台列出所有活跃管理员
SELECT id, email, name, last_login_at
FROM users
WHERE role = 'admin' AND is_active = TRUE
ORDER BY last_login_at DESC NULLS LAST;
```
