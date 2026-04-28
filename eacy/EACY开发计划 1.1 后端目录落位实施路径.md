---
title: EACY开发计划 1.1 后端目录落位实施路径
tags:
  - eacy
  - backend
  - plan
status: done
created: 2026-04-27
---

# EACY开发计划 1.1 后端目录落位实施路径

> [!summary]
> 目标是把 `fastapi-boilerplate-master` 裁剪成长期使用的 `backend/` 基座。此步骤只做后端基础设施落位，不引入患者、文档、抽取等业务实现。

返回：[[EACY开发计划#1.1 后端目录落位]]

## 实施路径

1. 新建 `backend/`，从 `fastapi-boilerplate-master/` 复制后端基础文件和基础设施目录。
2. 保留 `main.py`、`app/server.py`、`core/`、`migrations/`、`tests/`、`docker/`、`alembic.ini`、`pyproject.toml`。
3. 清理模板示例业务目录 `app/user`、`app/auth`，以及对应示例测试。
4. 将 `pyproject.toml` 的项目名改为 `eacy-backend`。
5. 重建 EACY 目标业务骨架：`app/api/v1/`、`app/models/`、`app/schemas/`、`app/repositories/`、`app/services/`、`app/workers/`、`app/integrations/`、`app/storage/`、`app/utils/`。
6. 修改 `app/server.py`，取消模板 `user/auth` 路由注册，保留 FastAPI 应用、CORS、中间件、异常、缓存初始化。
7. 修改权限依赖，移除对模板 `app.user` 的引用，保留 `current_user` 注入入口。
8. 清理初始 Alembic migration 中的示例 `user` 表，保留空的初始 migration。
9. 执行导入、测试和 `/docs` 验收。

## 已完成变更

- 新增 `backend/` 后端目录。
- `backend/pyproject.toml` 项目名已改为 `eacy-backend`。
- `backend/app/server.py` 已改为 EACY 后端标题，并注册空的 `api_router`。
- 删除模板示例业务 `backend/app/user`、`backend/app/auth`。
- 新增 EACY 后端目标目录骨架。
- 清理 `backend/migrations/versions/59628dea39ff_init.py` 中的示例用户表。
- 修正测试中对模板用户服务的依赖。

## 验收命令

```bash
cd backend
python -c "from app.server import app; print(app.title); print(app.docs_url)"
python -m pytest tests/core/fastapi/middlewares/test_authentication.py tests/core/fastapi/dependencies/test_permission.py
python main.py --env local --debug
```

## 验收标准

- [x] `backend/` 存在，且原始模板目录仍可作为参照保留。
- [x] `app/user` 和 `app/auth` 示例 DDD 业务目录已移除。
- [x] FastAPI 应用可导入，无模板业务 import error。
- [x] `/docs` 可打开。
- [x] EACY 目标业务目录骨架已建立。

## 后续衔接

下一步进入 [[EACY开发计划#1.2 建立统一 API 路由]]，在当前 `app/api/v1/__init__.py` 的基础上补齐 `health` 和各业务模块 router。
