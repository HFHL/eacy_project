---
title: issue fix + 文档上传 500 Internal Server Error
tags:
  - eacy
  - frontend
  - backend
  - api
  - issue-fix
status: done
created: 2026-04-28
---

# issue fix + 文档上传 500 Internal Server Error

返回：[[EACY开发计划 5.1 第一批前端真实接入实施路径#5.1.5 接入文档上传与文档列表]]

## 现象

前端文件列表页上传 `IMG_20250818_080801.jpg` 时失败，上传管理器提示：

```text
Internal Server Error
需要重新选择文件
POST http://localhost:5173/api/v1/documents 500
```

请求已经正确命中 Vite 代理下的 `/api/v1/documents`，因此问题不在前端 request 层或 multipart/form-data 构造，而是在后端上传接口处理链路。

## 排查过程

1. 用后端 `TestClient` 直接调用 `POST /api/v1/documents`，开启 `raise_server_exceptions=True` 获取真实 traceback。
2. 第一处异常来自数据库写入：

```text
invalid UUID 'dev_admin'
```

开发态鉴权关闭时，`get_current_user()` 返回的当前用户 ID 是 `dev_admin`。但真实数据库 `documents.uploaded_by` 列是 UUID 类型，直接写入字符串会触发 asyncpg UUID 编码失败。

3. 修复 `uploaded_by` 后再次复现，出现第二处真实库兼容异常：

```text
null value in column "file_name" of relation "documents" violates not-null constraint
```

当前代码按新最小模型写入 `original_filename/storage_path/file_ext` 等字段，但现有数据库表仍保留旧字段 `file_name/file_path/file_type/file_hash`，其中部分字段是 NOT NULL。迁移只补了新列，没有移除或放宽旧列，因此上传必须同时写新旧两套兼容字段。

## 修复内容

### 后端用户 ID 兼容

修改文件：`backend/app/services/document_service.py`

- 新增 `_normalize_optional_uuid()`。
- 上传时仅当 `uploaded_by` 是合法 UUID 才写入数据库。
- 开发态 `dev_admin` 会被规范化为 `None`，避免 UUID 列写入失败。

### 旧 documents 表字段兼容

修改文件：`backend/app/models/document.py`

- 补齐旧表字段 ORM 映射：
  - `file_name`
  - `file_path`
  - `file_type`
  - `file_hash`
  - `document_type`
  - `document_sub_type`
  - `is_parsed`
  - `parsed_content`
  - `parsed_data`

修改文件：`backend/app/services/document_service.py`

- 上传时同步写入旧字段：
  - `file_name = original_filename`
  - `file_path = storage_path`
  - `file_type = file_ext`
  - `file_hash = sha256(file bytes)`
  - `is_parsed = False`
  - `parsed_data = {}`

这保持了 5.1.5 新 API 模型和既有数据库结构之间的兼容，不需要在本次 issue fix 中改真实库约束。

### 归档响应序列化兼容

修改文件：`backend/app/repositories/document_repository.py`

- 移除 `DocumentRepository.save()` 中 flush 后立即 `refresh()` 的实现。
- 原因：当前 SQLAlchemy 路由会把普通 SELECT 分配到 reader，在同一事务内 refresh 可能读到旧值，导致归档接口响应仍显示 `status = uploaded`、`patient_id = null`。

修改文件：`backend/app/services/document_service.py`

- 在 `update_document()`、`archive_to_patient()`、`unarchive_document()`、`delete_document()` 中显式设置 `updated_at = datetime.utcnow()`。
- 原因：避免 Pydantic 响应模型读取 `updated_at` 时触发 SQLAlchemy async lazy load，导致 `MissingGreenlet`。

## 验证结果

后端直接验证：

```bash
cd backend
python -m pytest tests/app/test_document_api.py tests/app/test_auth_dev_mode.py
```

结果：

```text
5 passed
```

真实上传链路验证：

```bash
curl -F "file=@<temp-file>;filename=proxy-debug.txt;type=text/plain" \
  http://localhost:5173/api/v1/documents
```

结果：

```text
HTTP_STATUS:201
```

列表接口验证：

```text
GET http://localhost:5173/api/v1/documents?page=1&page_size=5
```

结果：可以返回真实 documents 列表。

5.1.5 完整验收：

```text
document_id = 3b9b51a0-ecce-4255-9b20-253e510ad715
patient_id = 12e68f62-8c11-4fe4-894f-859de270580d
upload_real_file_ok = true
backend_upload_file_exists = true
documents_table_record_created = true
document_file_list_reads_real_document = true
document_detail_reads_backend_record = true
archive_to_patient_ok = true
patient_detail_document_visible = true
delete_hides_document = true
network_hits_api_v1_documents = true
```

## 结论

这次 500 的根因是后端与真实数据库 schema 的兼容问题：

- 开发态用户 ID 不是 UUID，但 `uploaded_by` 是 UUID 列。
- 真实 `documents` 表仍有旧版必填列，而新上传服务只写新版字段。

修复后，前端页面需要对失败任务重新选择文件再上传，因为浏览器不会在失败任务里保留可重试的 File 对象。
