---
type: index
module: 文档与OCR
status: draft
audience: [tech-lead, integrator, reviewer]
code_path:
  - backend/app/api/v1/documents/router.py
  - backend/app/services/document_service.py
  - backend/app/services/document_metadata_service.py
  - backend/app/services/ocr_payload_normalizer.py
  - backend/app/services/archive_grouping_service.py
  - backend/app/repositories/document_repository.py
  - backend/app/models/document.py
  - backend/app/workers/ocr_tasks.py
  - backend/app/workers/metadata_tasks.py
  - backend/app/integrations/textin_ocr.py
  - backend/app/storage/document_storage.py
  - frontend_new/src/pages/DocumentUpload/index.jsx
  - frontend_new/src/pages/FileList/index.jsx
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# 文档与OCR

> 文档与 OCR 域负责把用户上传的原始 PDF / 图片，**安全落到对象存储**，再经过 OCR、Metadata 识别两道异步流水线，把文件变成**可被 AI 抽取消费的结构化原料**（含坐标定位的版面信息 + 文档类型识别）。本域对应 [[端到端数据流]] 的 `[1] 文档上传` `[2] OCR` `[3] Metadata 识别` 三个阶段。

## 在端到端链路中的位置

```text
[用户上传] → [文档与OCR ⭐] → [病例管理(归档)] → [AI抽取] → [字段落库与证据归因]
```

详细链路见 [[端到端数据流]]。

## 文档清单

| 文档 | 内容 |
|---|---|
| [[业务概述]] | 文档生命周期、对象存储、与上下游协作 |
| [[业务流程-文档上传与存储]] | 上传 + 落 OSS + 入 OCR 队列的完整时序 |
| [[业务流程-OCR处理]] | OCR Worker / TextIn 调用 / parsed_data 落库 / 状态机 |
| [[业务流程-Metadata识别]] | 文档类型与子类型识别，喂给抽取规划 |
| [[关键设计-OCR坐标归一化]] | ocr_payload_normalizer 把 TextIn 原始格式映射到统一坐标结构 |
| [[关键设计-未归档池与归档]] | ArchiveGroupingService 与"待归档 / 已归档"视图 |
| [[验收要点]] | 5~8 条可执行验收用例 |

## 与其他业务域的关系

| 关系方向 | 对方域 | 关联点 |
|---|---|---|
| 下游 | [[病例管理/README]] | 通过 `document.patient_id` 归档到病例；未归档进入"未归档池" |
| 下游 | [[AI抽取/README]] | OCR + Metadata 完成后触发 `enqueue_ready_extraction_jobs`，喂给抽取流水线 |
| 平行 | [[管理后台/异步任务进度追踪]] | OCR / Metadata 任务统一登记进 `async_task` |
| 外部 | [[TextIn-OCR]] | 唯一 OCR 服务提供方，HTTP 同步调用 |

## 关键代码锚点

- 路由：`backend/app/api/v1/documents/router.py`
- 文档服务：`backend/app/services/document_service.py`
- Metadata 服务：`backend/app/services/document_metadata_service.py`
- OCR 归一化：`backend/app/services/ocr_payload_normalizer.py`
- 未归档分组：`backend/app/services/archive_grouping_service.py`
- 仓库：`backend/app/repositories/document_repository.py`
- 模型：`backend/app/models/document.py`（见 [[表-document]]）
- Worker：`backend/app/workers/ocr_tasks.py` / `backend/app/workers/metadata_tasks.py`
- 外部集成：`backend/app/integrations/textin_ocr.py`
- 存储后端：`backend/app/storage/document_storage.py`
- 前端上传：`frontend_new/src/pages/DocumentUpload/index.jsx`
- 前端文件列表：`frontend_new/src/pages/FileList/index.jsx`
