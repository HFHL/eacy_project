---
type: index
module: 用户系统与权限
status: draft
audience: [tech-lead, integrator, reviewer]
code_path:
  - backend/app/api/v1/auth/router.py
  - backend/app/services/auth_service.py
  - backend/app/core/auth.py
  - backend/app/core/security.py
  - backend/app/models/user.py
  - backend/core/fastapi/middlewares/authentication.py
  - backend/core/fastapi/dependencies/permission.py
  - frontend_new/src/pages/UserSystem/Login.jsx
  - frontend_new/src/api/auth.js
  - frontend_new/src/api/request.js
  - frontend_new/src/store/slices/userSlice.js
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# 用户系统与权限

> EACY 的**最小可用**身份层：邮箱 + 密码注册登录，JWT 双 token，所有业务接口已接入 `Depends(get_current_user)`。当前权限模型基本上是"登录即可用 + admin 区分"，**没有完整 RBAC**。

## 在端到端链路中的位置

```text
登录 → 拿到 access_token → 调用所有业务接口（携带 Bearer）
                          ↓
                  仓储层按 owner_id / uploaded_by
                  做"用户作用域"过滤
```

详细业务链路见 [[端到端数据流]]。

## 文档清单

| 文档 | 内容 |
|---|---|
| [[业务概述]] | User 模型、JWT 机制、当前权限策略实测 |
| [[业务流程-登录与会话]] | 硬登录 / 软登录 / Token 刷新 / 401 拦截 / 用户活动心跳 |
| [[关键设计-鉴权与作用域]] | 仓储层用户作用域；`ENABLE_AUTH=false` 开发期宽松鉴权 |
| [[验收要点]] | 4~6 条可执行验收用例 |

## 与其他业务域的关系

| 关系方向 | 对方域 | 关联点 |
|---|---|---|
| 横切 | 所有业务域 | 接口统一依赖 `Depends(get_current_user)` 注入 `CurrentUser` |
| 数据 | [[病例管理/README]] | `patient.owner_id` 接收 `uuid_user_id_or_none(current_user)` |
| 数据 | [[文档与OCR/README]] | `document.uploaded_by` 接收同一 ID |
| 数据 | [[科研项目与数据集/README]] | `research_project.owner_id` 同上 |
| 控制 | [[管理后台/README]] | `/admin/*` 通过 `is_admin_user` 守门 |

## 关键代码锚点

- 路由：`backend/app/api/v1/auth/router.py`
- 服务：`backend/app/services/auth_service.py`
- 通用依赖：`backend/app/core/auth.py`（`CurrentUser` / `get_current_user` / `require_permissions` / `is_admin_user` / `uuid_user_id_or_none`）
- JWT 解码：`backend/app/core/security.py`
- 模型：`backend/app/models/user.py`（见 [[表-user]]）
- 前端登录页：`frontend_new/src/pages/UserSystem/Login.jsx`
- 前端拦截器：`frontend_new/src/api/request.js`
