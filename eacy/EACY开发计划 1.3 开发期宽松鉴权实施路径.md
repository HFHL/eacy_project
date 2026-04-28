---
title: EACY开发计划 1.3 开发期宽松鉴权实施路径
tags:
  - eacy
  - backend
  - auth
  - plan
status: done
created: 2026-04-27
---

# EACY开发计划 1.3 开发期宽松鉴权实施路径

> [!summary]
> 目标是在开发期关闭强鉴权时自动注入 `dev_admin`，同时让业务接口提前接入 `Depends(get_current_user)`，后续切换 `ENABLE_AUTH=true` 时只需要配置 JWT，不需要大面积修改接口。

返回：[[EACY开发计划#1.3 开发期宽松鉴权]]

## 已完成变更

- 新增 `backend/app/core/auth.py`：提供 `CurrentUser`、`DEV_ADMIN_USER`、`get_current_user` 和 `require_permissions`。
- 新增 `backend/app/core/security.py`：集中解析 `Authorization: Bearer <token>` 并校验 JWT。
- 在 `backend/core/config.py` 增加 `ENABLE_AUTH: bool = False`，默认开发期宽松鉴权。
- 新增 `/api/v1/auth/me` 验收接口。
- `auth / patients / documents / extraction / ehr / templates / research / admin` 业务路由已接入 `Depends(get_current_user)`。
- 新增 `backend/tests/app/test_auth_dev_mode.py` 覆盖开发期和正式期开关行为。

## 开发期行为

```text
ENABLE_AUTH=false
所有已接入 get_current_user 的接口放行
current_user = dev_admin
role = admin
permissions = ["*"]
```

## 正式期行为

```text
ENABLE_AUTH=true
校验 Authorization: Bearer <token>
无 token 返回 401
无效 token 返回 401
权限不足由 require_permissions 返回 403
```

## 验收命令

```bash
cd backend
python -c "from app.server import app; print(app.title); print([route.path for route in app.routes if route.path.startswith('/api/v1/auth')])"
python -m pytest tests/app/test_api_v1.py tests/app/test_auth_dev_mode.py
```

## 验收结果

- [x] 未登录访问 `/api/v1/auth/me` 返回 `dev_admin`。
- [x] 业务接口已使用 `Depends(get_current_user)`。
- [x] `ENABLE_AUTH=true` 时无 token 返回 401。
- [x] `ENABLE_AUTH=true` 时有效 JWT 返回当前用户。
- [x] 后续开启正式鉴权不需要大面积修改接口。

## 验收备注

> [!success]
> 本机已使用 Memurai 作为 Redis 兼容服务。`Get-Service` 显示 `Memurai` 为 `Running / Automatic`，TCP 连接 `127.0.0.1:6379` 成功，`python -c "import redis; r=redis.Redis(host='127.0.0.1', port=6379, db=0); print(r.ping())"` 返回 `True`。

> [!success]
> `python -m pytest tests/core/helpers/cache/test_redis_backend.py` 当前结果为 `5 passed`。测试已通过 `pytest_asyncio.fixture` 在每个用例后断开 Redis 连接池，避免 Windows/Python 3.13 下 `redis.asyncio` 连接跨 pytest 事件循环复用时触发 `RuntimeError: Event loop is closed`。

> [!warning]
> 既有 SQLAlchemy 中间件测试使用 `httpx.AsyncClient(app=...)`，当前环境的 httpx 版本不再支持该参数，因此该历史用例失败；这不属于 1.3 变更引入的问题。
