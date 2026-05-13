---
type: api
module: 接口
status: draft
audience: [integrator, tech-lead]
code_path:
  - backend/app/api/v1/documents/router.py
  - backend/app/services/document_service.py
  - backend/app/services/document_metadata_service.py
api_endpoints:
  - POST /api/v1/documents
  - GET /api/v1/documents
  - GET /api/v1/documents/{document_id}
  - GET /api/v1/documents/{document_id}/preview-url
  - GET /api/v1/documents/{document_id}/stream
  - POST /api/v1/documents/{document_id}/archive
  - POST /api/v1/documents/batch-archive
  - DELETE /api/v1/documents/{document_id}
related_tables: [document, patient, extraction_job, extraction_run, field_value_evidence]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# Documents（文档与文件流）

> [!info] 参数表见 [[OpenAPI访问|OpenAPI]]
> 这一组承担**上传 → OCR → 元数据 → 归档到病例 → 删除前确认**的完整生命周期。

## 业务用途

文档是 EACY 的原始资料载体。上传后经 OCR 与元数据识别，未归档进入"待归档池"，归档后绑定到 `patient` 并可触发抽取任务。

## 主要场景与对应端点

### 上传与列表

- `POST /api/v1/documents` — multipart 上传文件，可选直接传 `patient_id`
- `GET /api/v1/documents` — 列表，可按 `patient_id` / `status` 过滤
- `GET /api/v1/documents/{document_id}` — 详情（含 `linked_patients`、`extraction_records`、`parsed_data`、`content_list`）
- `PATCH /api/v1/documents/{document_id}` — 修改文档元数据（doc_type、标题、OCR 结果回写等）

### 状态批量探测

- `POST /api/v1/documents/statuses` — 一次拿一批文档的 `ocr_status` / `meta_status` / `extract_status` 与绑定患者摘要，用于列表轮询

### 预览与流式

- `GET /api/v1/documents/{id}/preview-url` — 取 OSS 临时签名 URL（`expires_in` 默认 3600s，最大 86400s）
- `GET /api/v1/documents/{id}/stream` — 后端代理流式返回，**支持 `?access_token=` 查询参数**（用于 `<iframe>` 无法带头的场景）
- `GET /api/v1/documents/{id}/pdf-stream` — 与 `/stream` 等价，语义上专给 PDF 预览

### 触发后台处理

- `POST /api/v1/documents/{id}/ocr` — 重新入队 OCR（202）
- `POST /api/v1/documents/{id}/metadata` — 重新入队元数据识别（202）

### 待归档池视图

- `GET /api/v1/documents/v2/tree` — 待归档池的分组树（按元数据聚合）
- `GET /api/v1/documents/v2/groups/{group_id}/documents` — 某组下的文档列表
- `POST /api/v1/documents/v2/groups/{group_id}/confirm-archive` — 整组归档到指定病例

### 归档与反归档

- `POST /api/v1/documents/{id}/archive` — 单文档归档（`create_extraction_job=true` 时同时触发抽取）
- `POST /api/v1/documents/batch-archive` — 多文档一次性归档
- `POST /api/v1/documents/{id}/unarchive` — 解除绑定

### 删除前确认

- `GET /api/v1/documents/{id}/evidence-impact` — 查询该文档被多少字段引用为证据
- `DELETE /api/v1/documents/{id}` — 删除文档（字段值保留、来源标记为"已删除文档"）

## 关键字段语义

| 字段 | 业务含义 | 备注 |
|---|---|---|
| `status` | 文档生命周期状态 | `uploaded` / `archived` / `deleted` 等 |
| `ocr_status` | OCR 子状态 | `pending` / `running` / `succeeded` / `failed` |
| `meta_status` | 元数据识别子状态 | 同上 |
| `extract_status` | 由最新 extraction job 反算 | 只在列表 `summary` 接口出现 |
| `parsed_content` | OCR JSON 序列化字符串 | 详情页用 |
| `content_list` | OCR `blocks` 归一化后的展示列表 | 每条带 `bbox` / `page_idx`，前端高亮用 |
| `linked_patients` | 当前绑定的病例摘要 | 列表至多 1 条（保留为数组便于多绑定演进） |
| `extraction_records` | 该文档上的抽取记录 | `is_merged` 表示已合并到 EHR |
| `DocumentEvidenceImpactResponse.evidence_count` | 被字段引用次数 | `>0` 时删除弹窗需提示影响范围 |

## 典型样例

> [!example] 上传文档
> ```http
> POST /api/v1/documents
> Content-Type: multipart/form-data
>
> file=@/path/to/scan.pdf
> patient_id=（可选）
> ```
> 后端立即返回 `DocumentResponse`（`status=uploaded`），并按 `DOCUMENT_OCR_AUTO_ENQUEUE` 配置自动入队 OCR。

> [!example] 归档并自动抽取
> ```http
> POST /api/v1/documents/{id}/archive
> { "patient_id": "...", "create_extraction_job": true }
> ```

## 副作用

- 上传：写 OSS、写 `document` 表；按 `DOCUMENT_OCR_AUTO_ENQUEUE` 配置自动触发 OCR。
- 归档：把 `document.patient_id` 设为目标病例；`create_extraction_job=true` 时入队 `extraction_job`。
- 反归档：清 `patient_id`，回到待归档池。
- 删除：软删 `document`，**不级联删** `field_value_evidence`，但前端按"已删除文档"渲染。

## 错误码业务含义

| 场景 | HTTP | 业务原因 |
|---|---|---|
| 文档不存在 / 软删后访问 | 404 | `service.get_document` 返回 `None` |
| 流式接口 token 无效 | 401 | `?access_token=` 解码失败或缺 `user_id` |
| 文件大小 / 类型不支持 | 400 | upload service 抛参数错（OpenAPI 中体现） |
| OSS 临时 URL 上游失败 | 5xx | `httpx` 上游错误，可重试 |

## 关联

- [[表-document]]、[[表-field_value_evidence]]、[[表-extraction_job]]
- [[业务流程-文档上传与存储]]
- [[业务流程-OCR处理]]
- [[业务流程-Metadata识别]]
- [[关键设计-未归档池与归档]]
- [[关键设计-OCR坐标归一化]]
