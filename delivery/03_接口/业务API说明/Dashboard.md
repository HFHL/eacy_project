---
type: api
module: 接口
status: draft
audience: [integrator]
code_path:
  - backend/app/api/v1/dashboard/router.py
  - backend/app/services/dashboard_service.py
api_endpoints:
  - GET /api/v1/dashboard/stats
  - GET /api/v1/dashboard/active-tasks
related_tables: [patient, document, extraction_job, research_project, async_task]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# Dashboard（仪表板）

> [!info] 参数表见 [[OpenAPI访问|OpenAPI]]
> 这一组是**纯聚合查询**，无副作用，按当前用户的 scope 过滤。

## 业务用途

为前端首页"概览卡片 + 活跃任务列表"提供聚合数据。响应均按 `current_user` 的 scope 过滤（开发态 `dev_admin` 可见全部）。

## 主要场景与对应端点

### 首页统计卡

- `GET /api/v1/dashboard/stats` — 用户名下的病例数、文档数、抽取任务数、项目数等聚合统计

### 活跃任务横幅

- `GET /api/v1/dashboard/active-tasks` — 当前用户名下"正在跑"的异步任务摘要，前端 banner 轮询

## 关键字段语义

> [!info] 形状由 service 返回 dict 决定
> 两个端点的响应都是 `dict[str, Any]`，**不固定 Pydantic schema**，前端按 service 当前实际返回的键消费。具体形状以 OpenAPI 试调结果 / `DashboardService` 源码为准（避免在此重抄易漂移的字段表）。

| 概念 | 业务含义 |
|---|---|
| user scope | 仅统计 `created_by == 当前用户` 的资源；admin / dev 用户可见全部 |
| "活跃任务" | `status in (pending, running)` 的 `extraction_job` 与 `async_task` |

## 典型样例

> [!example] 拉取首页统计
> ```http
> GET /api/v1/dashboard/stats
> Authorization: Bearer ...
> ```

## 副作用

无（纯查询）。

## 错误码业务含义

仅通用 401/500，无业务专属错误。

## 关联

- [[业务流程-异步任务监控]]
- [[业务API说明/Tasks|Tasks]] — 单批次任务进度详情入口
