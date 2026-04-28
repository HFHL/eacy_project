---
title: EACY 后端接口文档 - Documents
tags:
  - EACY
  - backend
  - api
---

# EACY 后端接口文档 - Documents

本页覆盖文档上传、列表、详情、元数据更新、删除、归档到患者以及取消归档。

## 数据结构

### DocumentUpdate

| 字段 | 类型 | 必填 | 限制 | 说明 |
|---|---|---|---|---|
| `doc_type` | string/null | 否 | 最长 100 | 文档类型 |
| `doc_subtype` | string/null | 否 | 最长 100 | 文档子类型 |
| `doc_title` | string/null | 否 | 最长 255 | 文档标题 |
| `effective_at` | datetime/null | 否 | - | 文档生效时间 |
| `metadata_json` | object/null | 否 | - | 元数据 |
| `meta_status` | string/null | 否 | 最长 50 | 元数据状态 |
| `ocr_text` | string/null | 否 | - | OCR 文本 |
| `ocr_payload_json` | object/null | 否 | - | OCR 原始或结构化载荷 |
| `ocr_status` | string/null | 否 | 最长 50 | OCR 状态 |

### DocumentArchiveRequest

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `patient_id` | string | 是 | - | 归档目标患者 ID |
| `create_extraction_job` | boolean | 否 | true | 归档后是否创建抽取任务 |

### DocumentPreviewUrlResponse

用于前端文档详情、图片预览、字段溯源预览获取可访问 URL。

| 字段 | 类型 | 说明 |
|---|---|---|
| `document_id` | string | 文档 ID |
| `url` | string | 可访问 URL，优先等于 `temp_url` |
| `temp_url` | string | 临时预览 URL |
| `preview_url` | string | 兼容前端旧字段，等同于 `temp_url` |
| `expires_in` | integer | URL 有效期，单位秒 |
| `storage_provider` | string/null | 存储方式；当前架构固定为 `oss` |
| `mime_type` | string/null | MIME 类型 |
| `file_name` | string | 原始文件名 |

### DocumentResponse

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 文档 ID |
| `patient_id` | string/null | 关联患者 ID |
| `original_filename` | string | 原始文件名 |
| `file_ext` | string/null | 文件扩展名 |
| `mime_type` | string/null | MIME 类型 |
| `file_size` | integer/null | 文件大小 |
| `storage_provider` | string/null | 存储提供方 |
| `storage_path` | string | 存储路径 |
| `file_url` | string/null | 文件访问 URL |
| `status` | string | 文档状态 |
| `ocr_status` | string/null | OCR 状态 |
| `ocr_text` | string/null | OCR 文本 |
| `ocr_payload_json` | object/null | OCR 载荷 |
| `meta_status` | string/null | 元数据状态 |
| `metadata_json` | object/null | 元数据 |
| `doc_type` | string/null | 文档类型 |
| `doc_subtype` | string/null | 文档子类型 |
| `doc_title` | string/null | 文档标题 |
| `effective_at` | datetime/null | 生效时间 |
| `uploaded_by` | string/null | 上传人 |
| `archived_at` | datetime/null | 归档时间 |
| `created_at` | datetime/null | 创建时间 |
| `updated_at` | datetime/null | 更新时间 |

## POST /api/v1/documents

> [!important] OSS-only contract
> 上传后文件只写入 OSS，不保留本地文件。数据库中的 `storage_provider` 必须为 `oss`，`storage_path` 必须为 OSS object key，`file_url` 必须为 OSS URL。后续预览只依赖 `/api/v1/documents/{document_id}/preview-url` 返回的 OSS URL。

接口描述：上传文档文件。可选关联患者；上传人来自当前用户。

请求类型：`multipart/form-data`

请求参数：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `file` | form-data | file | 是 | 上传文件 |
| `patient_id` | form-data | string/null | 否 | 关联患者 ID |

返回状态：`201`

返回格式：`DocumentResponse`

## GET /api/v1/documents/

接口描述：分页查询文档列表。

查询参数：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---:|---|
| `page` | integer | 否 | 1 | 页码 |
| `page_size` | integer | 否 | 20 | 每页数量，最大 100 |
| `patient_id` | string | 否 | - | 按患者过滤 |
| `status` | string | 否 | - | 按文档状态过滤 |

返回状态：`200`

返回格式：分页对象，`items` 为 `DocumentResponse[]`。

## GET /api/v1/documents/{document_id}

接口描述：查询文档详情。

路径参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `document_id` | string | 文档 ID |

返回状态：`200`

返回格式：`DocumentResponse`

错误：文档不存在时返回 `404`。

## GET /api/v1/documents/{document_id}/preview-url

> [!important] OSS-only behavior
> 该接口是前端图片和文档预览的主接口。返回值 `url`、`temp_url`、`preview_url` 都应是 OSS 签名 URL 或公开 OSS URL。后端不读取本地文件；如果文档记录不是 `storage_provider = oss`，返回 `409`。

接口描述：获取文档预览 URL。前端 `getDocumentTempUrl(documentId, expiresIn)` 应调用该接口，用于 JPG/PNG 等图片预览、字段来源预览和普通文件预览。

路径参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `document_id` | string | 文档 ID |

查询参数：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---:|---|
| `expires_in` | integer | 否 | 3600 | OSS 临时签名 URL 有效期，单位秒 |

返回状态：`200`

返回格式：`DocumentPreviewUrlResponse`

返回示例：

```json
{
  "document_id": "document-1",
  "url": "https://bucket.oss-cn-shanghai.aliyuncs.com/documents/2026/04/file.jpg?...",
  "temp_url": "https://bucket.oss-cn-shanghai.aliyuncs.com/documents/2026/04/file.jpg?...",
  "preview_url": "https://bucket.oss-cn-shanghai.aliyuncs.com/documents/2026/04/file.jpg?...",
  "expires_in": 3600,
  "storage_provider": "oss",
  "mime_type": "image/jpeg",
  "file_name": "IMG_20250818_080801.jpg"
}
```

后端行为：

- `storage_provider = oss`：优先生成 OSS 签名 URL；如果对象为公开读，也可以返回 `file_url`。
- 当前架构约定文档只存 OSS；非 OSS 文档不提供预览 URL。
- 文档不存在或已删除时返回 `404`。
- 文档没有可读取的 `storage_path/file_url` 时返回 `404` 或 `409`。

## GET /api/v1/documents/{document_id}/stream

> [!note] Compatibility endpoint
> 该接口只用于兼容旧前端 PDF stream 调用，不再提供本地文件流。实现应调用预览 URL 逻辑并 `302` 跳转到 OSS URL。

接口描述：兼容旧前端 PDF stream 调用。当前架构中文件只存 OSS，因此该接口不读取本地文件，只返回 `302` 跳转到 OSS 预览 URL。

路径参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `document_id` | string | 文档 ID |

查询参数：无。

返回状态：`302`

返回格式：重定向响应。

响应头：

| Header | 说明 |
|---|---|
| Header | 说明 |
|---|---|
| `Location` | OSS 签名 URL 或公开 `file_url` |

后端行为：

- `storage_provider = oss`：返回 `302` 跳转到 OSS 签名 URL 或公开 `file_url`。
- 非 OSS 文档不支持该接口，返回 `409`。
- 文档不存在、已删除或对象不可访问时返回 `404`。

## PATCH /api/v1/documents/{document_id}

接口描述：更新文档元信息、OCR 结果或状态字段。

路径参数：`document_id`

请求体：`DocumentUpdate`

返回状态：`200`

返回格式：`DocumentResponse`

## DELETE /api/v1/documents/{document_id}

接口描述：删除文档。

路径参数：`document_id`

返回状态：`204`

返回格式：无响应体。

## POST /api/v1/documents/{document_id}/archive

接口描述：将文档归档到指定患者。可选择是否同步创建抽取任务。

路径参数：`document_id`

请求体：`DocumentArchiveRequest`

返回状态：`200`

返回格式：`DocumentResponse`

## POST /api/v1/documents/{document_id}/unarchive

接口描述：取消文档归档。

路径参数：`document_id`

请求参数：无。

返回状态：`200`

返回格式：`DocumentResponse`
