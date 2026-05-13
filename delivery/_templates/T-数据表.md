---
type: data-model
module: 
status: draft
audience: [tech-lead, integrator, ops]
code_path:
  - backend/app/models/xxx.py
table_name: 
related_tables: []
last_verified_commit: 
last_verified_date: 
owner: 后端
---

# 表-{{table_name}}

> [!info] 字段定义以 SQLAlchemy model + Alembic migration 为准
> 本文只描述**业务含义、生命周期、典型查询**。

## 用途
这张表承载什么业务概念。

## 字段业务含义
| 字段 | 业务含义 | 取值约束 / 枚举 |
|---|---|---|
| id |  |  |
|  |  |  |

## 关键索引
| 索引 | 用途 |
|---|---|
|  |  |

## 生命周期
- 创建：何时由谁创建
- 更新：哪些操作会修改
- 删除/归档：策略

## 与其他表的关系
- [[表-xxx]] — 关系说明

## 典型查询
```sql
-- 业务场景：xxx
SELECT ... FROM ... WHERE ...;
```
