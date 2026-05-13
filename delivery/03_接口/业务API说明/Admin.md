---
type: api
module: 接口
status: draft
audience: [integrator, ops, tech-lead]
code_path:
  - backend/app/api/v1/admin/router.py
  - backend/app/services/admin_task_service.py
  - backend/app/core/auth.py
api_endpoints:
  - GET /api/v1/admin/stats
  - GET /api/v1/admin/users
  - GET /api/v1/admin/projects
  - GET /api/v1/admin/templates
  - GET /api/v1/admin/documents
  - GET /api/v1/admin/extraction-tasks
  - GET /api/v1/admin/extraction-tasks/{task_id}
  - GET /api/v1/admin/extraction-tasks/{task_id}/events
related_tables: [user, research_project, schema_template, document, extraction_job, async_task]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# Admin（管理后台）

> [!info] 参数表见 [[OpenAPI访问|OpenAPI]]
> 本组全部接口要求 `role == "admin"` 或 `permissions` 含 `"*"`，否则 403。

## 业务用途

给运维 / 平台管理员的全局视图：跨用户的统计、用户列表、模板列表、文档列表，以及**异步任务监控**（按 jobs/tasks 维度，不按 batch 维度）。

## 主要场景与对应端点

### 全局统计与基础列表

- `GET /api/v1/admin/` — 模块探活
- `GET /api/v1/admin/stats` — 全局聚合统计（用户数 / 项目数 / 任务分布等）
- `GET /api/v1/admin/users` — 全量用户列表
- `GET /api/v1/admin/projects` — 全量项目列表
- `GET /api/v1/admin/templates` — 全量模板列表
- `GET /api/v1/admin/documents` — 全量文档列表（带 `page` / `page_size`）

### 抽取任务监控

- `GET /api/v1/admin/extraction-tasks` — 任务列表，支持 `task_type` / `status` / `keyword` 过滤，**用 `limit` + `offset` 分页**（不是 `page`）
- `GET /api/v1/admin/extraction-tasks/{task_id}` — 任务详情（含关联资源 / 最新 run）
- `GET /api/v1/admin/extraction-tasks/{task_id}/events` — 任务事件流，`after_id` + `limit` 增量拉

## 关键字段语义

| 字段 | 业务含义 | 备注 |
|---|---|---|
| `users` / `items` / `projects` / `templates` | 同一份数据，**冗余了多个键** | 前端兼容老命名，调用方挑一个用即可 |
| `keyword` | 模糊搜索关键字 | 一般匹配患者名 / 文档名 / 错误信息 |
| `task_id`（admin scope） | 通常是 `extraction_job.id` | 与 `/api/v1/extraction-jobs/{job_id}` 是同一个对象的"管理视角" |
| `task_type` | 任务种类 | 见 [[业务API说明/Extraction|Extraction]] |

## 典型样例

> [!example] 列出最近失败的抽取任务
> ```http
> GET /api/v1/admin/extraction-tasks?status=failed&limit=50&offset=0
> Authorization: Bearer <admin token>
> ```

> [!example] 拉某任务的事件流
> ```http
> GET /api/v1/admin/extraction-tasks/{task_id}/events?after_id=evt_xxx&limit=200
> ```

## 副作用

全部为查询接口，无写操作。

## 错误码业务含义

| 场景 | HTTP | 业务原因 |
|---|---|---|
| 非 admin 调用 | 403 | `require_admin_user` 拒绝 |
| `task_id` 不存在 | 404 | `AdminTaskNotFoundError` |
| 未带 token（生产） | 401 | 鉴权中间件 |

> [!warning] 开发态注意
> `ENABLE_AUTH=False` 时未带 token 的请求会以 `dev_admin` 身份通过 admin 校验，**生产务必把 `ENABLE_AUTH=True`**。详见 [[接口约定#2.2-enable_auth-开关]]。

## 关联

- [[表-async_task]]、[[表-extraction_job]]、[[表-user]]
- [[业务流程-异步任务监控]]
- [[关键设计-任务批次与子任务]]
- [[业务API说明/Tasks|Tasks]] — 前端面向用户的批次轮询入口（与本组的"按 job 维度"互补）
