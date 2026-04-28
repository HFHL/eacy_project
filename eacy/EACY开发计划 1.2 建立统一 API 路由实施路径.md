---
title: EACY开发计划 1.2 建立统一 API 路由实施路径
tags:
  - eacy
  - backend
  - plan
status: done
created: 2026-04-27
---

# EACY开发计划 1.2 建立统一 API 路由实施路径

> [!summary]
> 目标是在 `backend/app/api/v1/` 下建立统一 API 聚合入口，让 `app/server.py` 只注册一个 `api_router`，后续业务模块只需要维护自己的 `router.py` 并在聚合入口注册。

返回：[[EACY开发计划#1.2 建立统一 API 路由]]

## 实施路径

1. 保留 `app/server.py` 当前的单入口注册方式：`app_.include_router(api_router)`。
2. 在 `app/api/v1/__init__.py` 中创建带 `/api/v1` 前缀的聚合 `APIRouter`。
3. 在聚合入口新增 `/health` 健康检查接口，用于最小 API 验收。
4. 为 `auth / patients / documents / extraction / ehr / templates / research / admin` 创建独立 `router.py`。
5. 每个业务 router 先提供轻量状态端点，确保 Swagger 能显示模块化 tags。
6. 在 `app/api/v1/__init__.py` 中统一 `include_router` 各业务模块。
7. 新增 `tests/app/test_api_v1.py`，验证健康检查和 OpenAPI 路由注册。

## 已完成变更

- `backend/app/api/v1/__init__.py` 已成为 `/api/v1` 聚合入口。
- 新增 `/api/v1/health`，返回 `{"status": "ok"}`。
- 新增以下模块路由文件：

```text
backend/app/api/v1/auth/router.py
backend/app/api/v1/patients/router.py
backend/app/api/v1/documents/router.py
backend/app/api/v1/extraction/router.py
backend/app/api/v1/ehr/router.py
backend/app/api/v1/templates/router.py
backend/app/api/v1/research/router.py
backend/app/api/v1/admin/router.py
```

- `app/server.py` 继续只注册 `api_router`，未引入多处路由注册。
- 新增 API 路由测试 `backend/tests/app/test_api_v1.py`。

## 验收命令

```bash
cd backend
python -c "from app.server import app; print(app.title); print([route.path for route in app.routes if route.path.startswith('/api/v1')])"
python -m pytest tests/app/test_api_v1.py
curl http://localhost:8000/api/v1/health
```

## 验收标准

- [x] `/api/v1/health` 返回正常。
- [x] Swagger 中能看到 `health / auth / patients / documents / extraction / ehr / templates / research / admin` 模块化 tags。
- [x] 新增业务模块只需要新增模块 `router.py`，再在 `app/api/v1/__init__.py` 注册。
- [x] `app/server.py` 只注册一个 `api_router`。

## 后续衔接

下一步进入 [[EACY开发计划#1.3 开发期宽松鉴权]]，在当前模块路由骨架基础上补齐 `get_current_user`、开发期 `dev_admin` 注入和 `auth/me` 验收接口。
