---
title: EACY 后端接口文档 - Auth 与基础状态
tags:
  - EACY
  - backend
  - api
---

# EACY 后端接口文档 - Auth 与基础状态

## GET /api/v1/health

接口描述：健康检查。用于确认 FastAPI 应用路由可用。

认证：不依赖当前用户。

请求参数：无。

返回状态：`200`

返回格式：

| 字段 | 类型 | 说明 |
|---|---|---|
| `status` | string | 固定返回 `ok` |

## GET /api/v1/auth/

接口描述：Auth 模块状态检查。

认证：需要当前用户。

请求参数：无。

返回状态：`200`

返回格式：

| 字段 | 类型 | 说明 |
|---|---|---|
| `module` | string | 固定返回 `auth` |
| `status` | string | 固定返回 `ready` |

## GET /api/v1/auth/me

接口描述：获取当前登录用户信息。

认证：需要当前用户。

请求参数：无。

返回状态：`200`

返回格式：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 当前用户 ID |
| `username` | string | 当前用户名 |
| `role` | string | 当前用户角色 |
| `permissions` | string[] | 当前用户权限列表 |

## GET /api/v1/ehr/

接口描述：EHR 模块状态检查。真实患者 EHR 数据接口在 [[EACY 后端接口文档 - Patients 与 EHR]] 中。

认证：需要当前用户。

请求参数：无。

返回状态：`200`

返回格式：

| 字段 | 类型 | 说明 |
|---|---|---|
| `module` | string | 固定返回 `ehr` |
| `status` | string | 固定返回 `ready` |

## GET /api/v1/admin/

接口描述：Admin 模块状态检查。

认证：需要当前用户。

请求参数：无。

返回状态：`200`

返回格式：

| 字段 | 类型 | 说明 |
|---|---|---|
| `module` | string | 固定返回 `admin` |
| `status` | string | 固定返回 `ready` |
