---
type: data-model
module: 文档与OCR
status: draft
audience: [tech-lead, integrator, ops]
code_path:
  - backend/app/models/document.py
  - backend/app/repositories/document_repository.py
table_name: documents
related_tables: [patient, extraction_job, field_value_event, field_value_evidence, user]
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# 表-document

> [!info] 字段定义以 SQLAlchemy model + Alembic migration 为准
> 本文只描述**业务含义、生命周期、典型查询**。

## 用途
原始文档（PDF / 图片 / 病历文件等）的元数据与处理状态。OCR 结果、文档元数据识别结果都缓存于此。**与对象存储分离**：实际文件在 OSS，本表只存路径与签名 URL。

## 字段业务含义
| 字段 | 业务含义 | 取值约束 / 枚举 |
|---|---|---|
| original_filename | 上传时原始文件名 | 必填，用于展示 |
| file_name / file_path / file_type | 兼容旧字段 | 与 `storage_*` 双轨；新逻辑用 `storage_*` |
| file_hash | 内容 SHA | 用于查重；可空 |
| storage_provider | 存储后端标识 | 通常 `oss`；本地开发可能 `local` |
| storage_path | 在存储后端中的相对路径 | 必填，配合 `storage_provider` 解析 |
| file_url | 临时签名 URL 缓存 | 过期后由业务层重签 |
| status | 文档总体状态 | `uploaded` / `ocr_pending` / `ocr_completed` / `archived` / `failed` / `deleted`（软删）等 |
| ocr_status | OCR 子状态 | `queued` / `running` / `completed` / `failed` |
| ocr_text | OCR 纯文本结果 | 大文本，按需 `load_only` 加载 |
| ocr_payload_json | OCR 原始结构（含坐标/布局） | 用于证据回溯到页与坐标，见 [[表-field_value_evidence]] |
| meta_status | 文档元数据识别状态 | 与 OCR 独立的子状态机；具体取值集合 TBD（看 `DocumentMetadataService`） |
| metadata_json | LLM 识别出的文档元数据 | 自由 JSON，含归档候选患者等 |
| doc_type / doc_subtype | 业务文档类型（识别后） | 例如 `出院小结` / `检查报告`；自由字符串 |
| document_type / document_sub_type | 早期字段 | 与 `doc_type` 重复，新代码用 `doc_type` |
| doc_title | 文档标题（识别后） | 用于列表展示 |
| effective_at | 业务生效时间（如检查日期） | 来自识别结果；用于时间线排序 |
| patient_id | 归档到的患者 | `NULL` 表示未归档（"未归档区") |
| uploaded_by | 上传者（软外键 → users.id） | 列表默认按该字段做权限过滤 |
| archived_at | 归档时间 | 文档进入患者池的时间 |

## 关键索引
| 索引 | 用途 |
|---|---|
| `idx_documents_patient_id` | 病例详情下的文档列表 |
| `idx_documents_status` | 列表按 status 过滤、状态机扫描 |
| `idx_documents_doc_type` | 按文档类型筛选 |
| `idx_documents_effective_at` | 时间线排序 |

## 生命周期
- 创建：`POST /api/v1/documents/upload` → 写表（`status=uploaded`）并入 OSS。
- 更新：
  - OCR worker 写回 `ocr_status` / `ocr_text` / `ocr_payload_json`，并把 `status` 推进到 `ocr_pending → ocr_completed`。
  - Metadata worker 写回 `meta_status` / `metadata_json` / `doc_type` / `doc_title` / `effective_at` 等。
  - 归档流程把 `patient_id` 与 `archived_at` 写入。
- 删除/归档：**软删**——`status='deleted'`（不是物理 DELETE）。`patient` 软删时通过 `soft_delete_by_patient` 级联。
- 文档作为字段证据被引用时（[[表-field_value_evidence]]），删除前需提示影响范围（`has_evidence` / `summarize_by_document_id`）。

## 与其他表的关系
- [[表-patient]] — N:1，`patient_id`。
- [[表-extraction_job]] — 1:N，一份文档可对应多次抽取任务。
- [[表-field_value_event]] — 1:N，`source_document_id`，字段值的来源文档。
- [[表-field_value_evidence]] — 1:N，证据行直接指向 `document_id`。
- [[表-user]] — N:1，`uploaded_by`。

## 典型查询
```sql
-- 业务场景：病例详情 → 文档列表（按时间倒序，排除已删除）
SELECT id, original_filename, doc_type, doc_title, effective_at, status, ocr_status
FROM documents
WHERE patient_id = :patient_id
  AND status != 'deleted'
ORDER BY created_at DESC
LIMIT 100;
```

```sql
-- 业务场景：未归档区（patient_id IS NULL 且未删除）
SELECT id, original_filename, doc_type, meta_status, created_at
FROM documents
WHERE patient_id IS NULL
  AND status != 'deleted'
  AND uploaded_by = :current_user_id
ORDER BY created_at DESC;
```
