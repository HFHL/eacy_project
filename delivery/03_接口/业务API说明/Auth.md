---
type: api
module: 接口
status: draft
audience: [integrator, tech-lead]
code_path:
  - backend/app/api/v1/auth/router.py
  - backend/app/services/auth_service.py
  - backend/app/core/auth.py
  - backend/app/core/security.py
api_endpoints:
  - POST /api/v1/auth/register
  - POST /api/v1/auth/login
  - POST /api/v1/auth/refresh
  - POST /api/v1/auth/logout
  - GET /api/v1/auth/me
related_tables: [user]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# Auth（鉴权）

> [!info] 参数表见 [[OpenAPI访问|OpenAPI]]
> 本文只描述业务语义、调用注意事项与业务错误码。

## 业务用途

负责 EACY 平台的账号注册、登录、token 刷新与"当前会话身份"探测。所有其他接口都以这里发的 JWT 作为 `Authorization: Bearer ...` 入场票。

## 主要场景与对应端点

### 注册账号

- `POST /api/v1/auth/register` — 邮箱 + 密码注册，**注册即登录**，直接返回 token

### 登录

- `POST /api/v1/auth/login` — 邮箱 + 密码换 token

### 续期会话

- `POST /api/v1/auth/refresh` — 用 refresh_token 换一对新的 access/refresh token

### 退出与身份探测

- `POST /api/v1/auth/logout` — 当前实现为**前端清 token 即可**，后端仅返回 204（未维护服务端黑名单）
- `GET /api/v1/auth/me` — 返回当前 token 解出的 `CurrentUser`，用于前端启动时确认会话有效
- `GET /api/v1/auth/` — 模块探活，返回 `{"module": "auth", "status": "ready"}`

## 关键字段语义

| 字段 | 业务含义 | 备注 |
|---|---|---|
| `email` | 登录标识 | 注册时唯一；正则 `^[^@\s]+@[^@\s]+\.[^@\s]+$` |
| `username` | 可选展示名 | 注册时未传则后端按邮箱前缀生成 |
| `expires_in` | access token 有效期（秒） | 续期参考值 |
| `permissions` | 权限码列表 | 含 `"*"` 表示超级权限（admin 与 dev 默认用户） |
| `role` | 角色枚举 | 当前主要使用 `user` / `admin`，详见 [[关键设计-鉴权与作用域]] |

## 典型样例

> [!example] 登录
> ```http
> POST /api/v1/auth/login
> Content-Type: application/json
>
> {"email": "alice@example.com", "password": "******"}
> ```
> 响应（200）：
> ```json
> {
>   "access_token": "eyJ...",
>   "refresh_token": "eyJ...",
>   "token_type": "bearer",
>   "expires_in": 3600,
>   "user": { "id": "...", "username": "alice", "role": "user", "permissions": [] }
> }
> ```

> [!example] 刷新
> ```http
> POST /api/v1/auth/refresh
> { "refresh_token": "eyJ..." }
> ```

## 副作用

- `register` 在 `user` 表写入一行；密码以哈希存储（见 `auth_service` / `security`）。
- `login` / `refresh` 不写库，只签发 token。
- `logout` 不做服务端清理。

## 错误码业务含义

| 场景 | HTTP | 业务原因 | 调用方建议 |
|---|---|---|---|
| 注册邮箱已存在 | 409 / 400 | `auth_service` 抛 `UserAlreadyExistsError`（具体形态以 OpenAPI 为准） | 提示"邮箱已注册，请直接登录" |
| 登录密码错误 / 用户不存在 | 401 | 不区分两种原因（防枚举） | 统一文案 |
| `refresh_token` 失效 / 被签名拒绝 | 401 | token 过期或密钥不匹配 | 跳转到登录页 |

> [!warning] 开发态行为
> 当 `ENABLE_AUTH=False` 且请求未带 token，会被注入 `dev_admin` 身份；此时 `/auth/me` 返回该虚拟用户，**仅用于本地联调**。详见 [[接口约定#二、鉴权机制]]。

## 关联

- [[表-user]] — 用户表结构
- [[业务流程-登录与会话]] — 完整登录/续期时序
- [[关键设计-鉴权与作用域]] — 用户 scope 如何下沉到 repository
- [[接口约定]] — 通用 token / 错误格式
