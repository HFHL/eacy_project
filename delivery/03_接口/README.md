---
type: index
module: 接口
status: reviewed
audience: [integrator]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# 03 接口

> 本模块面向**对接开发**。**参数表、类型、状态码不在这里写**，那是 FastAPI 生成的 OpenAPI 的职责。本模块只写**业务侧解释**。

## 阅读顺序

1. **接口约定**（待写）— 鉴权方式、错误码规范、分页规范、ID 规范、时区规范
2. **OpenAPI 访问**（待写）— 如何访问 `/docs` 与 `/redoc`，开发/测试环境差异
3. **业务API说明/** — 按业务域分组的业务侧 API 说明
4. **Webhook 与回调**（如有）

## 业务 API 说明计划覆盖

对应后端 `app/api/v1/` 下注册的路由分组（见 [`server.py`](../../backend/app/server.py) 与 `app/api/v1/__init__.py`）：

- `auth` — 鉴权
- `patients` — 病例
- `documents` — 文档
- `dashboard` — 仪表板
- `extraction` — 抽取任务
- `ehr` — EHR 字段值
- `templates` — Schema 模板
- `research` — 科研项目与数据集
- `tasks` — 异步任务进度
- `admin` — 管理后台

## 写作约定

- 每个分组对应 `业务API说明/<分组>.md` 一篇
- 同一分组下的所有端点写在一篇里，按"业务场景"组织小节，**不是按"路由列表"机械罗列**
- 字段含义只挑**业务上有歧义或有约束**的写，类型/必填以 OpenAPI 为准
