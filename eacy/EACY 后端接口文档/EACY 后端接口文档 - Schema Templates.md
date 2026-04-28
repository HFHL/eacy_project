---
title: EACY 后端接口文档 - Schema Templates
tags:
  - EACY
  - backend
  - api
---

# EACY 后端接口文档 - Schema Templates

本页覆盖结构化模板和模板版本接口。模板用于定义 EHR 或 CRF 的表单结构，版本记录具体 `schema_json`。

## 数据结构

### SchemaTemplateCreate

| 字段 | 类型 | 必填 | 默认值 | 限制 | 说明 |
|---|---|---|---|---|---|
| `template_code` | string | 是 | - | `1-100` 字符 | 模板编码 |
| `template_name` | string | 是 | - | `1-200` 字符 | 模板名称 |
| `template_type` | string | 是 | - | `1-50` 字符 | 模板类型 |
| `description` | string/null | 否 | - | - | 描述 |
| `status` | string | 否 | `active` | 最长 50 | 模板状态 |

### SchemaTemplateVersionCreate

| 字段 | 类型 | 必填 | 默认值 | 限制 | 说明 |
|---|---|---|---|---|---|
| `version_no` | integer | 是 | - | `>=1` | 版本号 |
| `version_name` | string/null | 否 | - | 最长 100 | 版本名称 |
| `schema_json` | object | 是 | - | - | schema 内容 |
| `status` | string | 否 | `draft` | 最长 50 | 版本状态 |

### SchemaTemplateResponse

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 模板 ID |
| `template_code` | string | 模板编码 |
| `template_name` | string | 模板名称 |
| `template_type` | string | 模板类型 |
| `description` | string/null | 描述 |
| `status` | string | 模板状态 |
| `created_by` | string/null | 创建人 |
| `created_at` | datetime/null | 创建时间 |
| `updated_at` | datetime/null | 更新时间 |

### SchemaTemplateVersionResponse

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 版本 ID |
| `template_id` | string | 所属模板 ID |
| `version_no` | integer | 版本号 |
| `version_name` | string/null | 版本名称 |
| `schema_json` | object | schema 内容 |
| `status` | string | 版本状态 |
| `published_at` | datetime/null | 发布时间 |
| `created_by` | string/null | 创建人 |
| `created_at` | datetime/null | 创建时间 |
| `updated_at` | datetime/null | 更新时间 |

### SchemaTemplateDetailResponse

在 `SchemaTemplateResponse` 基础上增加：

| 字段 | 类型 | 说明 |
|---|---|---|
| `versions` | SchemaTemplateVersionResponse[] | 模板版本列表 |

## GET /api/v1/schema-templates

接口描述：分页查询 schema 模板列表。

查询参数：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---:|---|
| `page` | integer | 否 | 1 | 页码 |
| `page_size` | integer | 否 | 20 | 每页数量，最大 100 |
| `template_type` | string | 否 | - | 模板类型过滤 |
| `status` | string | 否 | - | 模板状态过滤 |

返回状态：`200`

返回格式：分页对象，`items` 为 `SchemaTemplateResponse[]`。

## POST /api/v1/schema-templates

接口描述：创建 schema 模板。

请求体：`SchemaTemplateCreate`

返回状态：`201`

返回格式：`SchemaTemplateResponse`

错误：资源冲突返回 `409`。

## GET /api/v1/schema-templates/{template_id}

接口描述：查询 schema 模板详情及其版本列表。

路径参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `template_id` | string | 模板 ID |

返回状态：`200`

返回格式：`SchemaTemplateDetailResponse`

错误：模板不存在返回 `404`。

## DELETE /api/v1/schema-templates/{template_id}

接口描述：归档 schema 模板。该接口语义是归档，不是物理删除。

路径参数：`template_id`

返回状态：`200`

返回格式：`SchemaTemplateResponse`

错误：模板不存在返回 `404`；状态冲突返回 `409`。

## POST /api/v1/schema-templates/{template_id}/versions

接口描述：为指定模板创建一个新版本。

路径参数：`template_id`

请求体：`SchemaTemplateVersionCreate`

返回状态：`201`

返回格式：`SchemaTemplateVersionResponse`

错误：模板不存在返回 `404`；版本冲突返回 `409`。

## POST /api/v1/schema-template-versions/{version_id}/publish

接口描述：发布指定模板版本。

路径参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `version_id` | string | 模板版本 ID |

返回状态：`200`

返回格式：`SchemaTemplateVersionResponse`

错误：版本不存在返回 `404`；状态冲突返回 `409`。

## DELETE /api/v1/schema-template-versions/{version_id}

接口描述：删除模板版本。

路径参数：`version_id`

返回状态：`204`

返回格式：无响应体。

错误：版本不存在返回 `404`；状态冲突返回 `409`。
