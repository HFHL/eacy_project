---
title: EACY 后端接口文档 - 通用约定
tags:
  - EACY
  - backend
  - api
---

# EACY 后端接口文档 - 通用约定

## 基础地址

- API 统一前缀：`/api/v1`
- 非生产环境调试文档：`/docs`、`/redoc`
- 响应数据格式：JSON，文档上传接口除外，该接口请求体为 `multipart/form-data`。

## 认证

除 `/api/v1/health` 外，当前业务接口均依赖当前用户。

| 场景 | 行为 |
|---|---|
| `ENABLE_AUTH=false` | 使用开发期默认用户 `dev_admin`，无需真实 JWT |
| `ENABLE_AUTH=true` | 必须提供 Bearer Token |
| Token 缺失、格式错误或解析失败 | 返回 `401` |
| 权限不足 | 返回 `403` |

当前用户返回格式：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 用户 ID |
| `username` | string | 用户名 |
| `role` | string | 用户角色 |
| `permissions` | string[] | 权限列表，包含 `*` 表示管理员权限 |

## 通用分页

列表接口通常使用以下查询参数：

| 参数 | 类型 | 默认值 | 限制 | 说明 |
|---|---|---:|---|---|
| `page` | integer | 1 | `>=1` | 页码 |
| `page_size` | integer | 20 | `1-100` | 每页数量 |

分页返回格式：

| 字段 | 类型 | 说明 |
|---|---|---|
| `items` | array | 当前页数据 |
| `total` | integer | 总数量 |
| `page` | integer | 当前页码 |
| `page_size` | integer | 每页数量 |

## 通用状态码

| 状态码 | 说明 |
|---:|---|
| `200` | 查询、更新、状态类接口成功 |
| `201` | 创建成功 |
| `202` | 请求已接受，当前用于抽取任务创建 |
| `204` | 删除成功，无响应体 |
| `401` | 缺少认证或认证无效 |
| `403` | 当前用户权限不足 |
| `404` | 目标资源不存在 |
| `409` | 当前操作与资源状态冲突 |
| `422` | 请求参数或请求体不符合 Pydantic 校验规则 |

## 通用错误格式

自定义异常处理器返回：

| 字段 | 类型 | 说明 |
|---|---|---|
| `error_code` | string/null | 业务错误码，部分错误为空 |
| `message` | string | 错误说明 |

FastAPI 内置 `HTTPException` 与参数校验错误使用 FastAPI 默认错误结构，常见字段为 `detail`。

## 字段类型约定

| 类型 | 说明 |
|---|---|
| `string` | 普通字符串，部分字段有最大长度限制 |
| `integer` | 整数 |
| `number` | 浮点数 |
| `boolean` | 布尔值 |
| `date` | 日期，格式通常为 `YYYY-MM-DD` |
| `datetime` | 日期时间，ISO 8601 字符串 |
| `object` | JSON 对象 |
| `array` | JSON 数组 |
| `null` | 可为空字段可能返回 null |

## 字段值模型

EHR 与 CRF 字段值使用同一组值槽位表达多类型值：

| 字段 | 类型 | 说明 |
|---|---|---|
| `value_text` | string/null | 文本值 |
| `value_number` | number/null | 数值 |
| `value_date` | date/null | 日期 |
| `value_datetime` | datetime/null | 日期时间 |
| `value_json` | object/array/null | 复杂结构值 |
| `unit` | string/null | 单位 |

更新字段时通过 `value_type` 表示当前值类型，默认是 `text`。
