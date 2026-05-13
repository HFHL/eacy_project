---
type: reference
module: 集成与外部依赖
status: draft
audience: [integrator, ops, tech-lead]
code_path:
  - backend/app/integrations/textin_ocr.py
  - backend/app/services/document_service.py
  - backend/app/workers/ocr_tasks.py
  - backend/core/config.py
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# TextIn OCR

> 合合信息 TextIn 文档解析服务。EACY 用它把 PDF / 扫描件转为**带坐标**的结构化文本，是字段抽取与"原文红框"证据回溯的上游数据源。

## 一、用途与触发场景

| 用途 | 触发点 |
|---|---|
| 上传文档后**自动 OCR** | `document_service.upload_document` → 若 `DOCUMENT_OCR_AUTO_ENQUEUE=true`，立即入 `ocr` 队列 |
| 手工**重跑 OCR** | 管理后台 / 文档详情页"重新解析"按钮 → `requeue_document_ocr` |
| 病例归档前的**强制 OCR** | 上传时带 `patient_id` 且未解析过的文档 |

> 详见 [[端到端数据流]] 阶段 [2]、[[文档与OCR/业务概述]]。

OCR 产物的下游消费者：
- **Metadata 识别**（doc_type / doc_subtype，见 [[LLM-Provider]]）
- **字段抽取**（`llm_ehr_extractor.py`，把 OCR `lines[].position` 作为证据单元喂给 LLM）
- **前端原文红框**（`PatientDetail/.../DocumentDetailModal`）

---

## 二、接入方式

- **协议**：HTTPS `POST`，请求体为文档原始字节（`Content-Type: application/octet-stream`）
- **客户端**：[`backend/app/integrations/textin_ocr.py::TextInOcrClient`](../../backend/app/integrations/textin_ocr.py)，基于 `httpx.AsyncClient`
- **鉴权**：请求头双因子
  - `x-ti-app-id`
  - `x-ti-secret-code`
- **可选请求头**：`x-ti-filename`（中文需 URL encode，并加 `x-ti-filename-encoding: url`）
- **两条调用入口**：
  - `parse_document_bytes(content, ...)`  直接传字节
  - `parse_document_url(document_url, ...)`  先 GET 下载，再走 `parse_document_bytes`（EACY 实际走这条：OSS 签名 URL → TextIn）

> [!info] 端点形态
> 具体 endpoint 由 `TEXTIN_API_URL` 注入，**不在代码中硬编码**。返回字段约定见内部参考文档 `eacy/textin文档.md`，本文不重复 schema。

---

## 三、关键配置项（环境变量）

| 环境变量 | 含义 | 默认 |
|---|---|---|
| `TEXTIN_APP_ID` | TextIn 应用 ID | 无 |
| `TEXTIN_SECRET_CODE` | TextIn 应用密钥 | 无 |
| `TEXTIN_API_URL` | TextIn 文档解析 endpoint | 无 |
| `TEXTIN_TIMEOUT_SECONDS` | 单次请求超时（秒） | `120.0` |
| `DOCUMENT_OCR_AUTO_ENQUEUE` | 上传后是否自动入 OCR 队列 | `true` |

> [!warning] 实际值
> API key 不写在文档中，部署方在 `.env` 中维护。参考 [[环境变量清单]]（待写）。

---

## 四、配额与限速

- TextIn 侧的 QPS / 月配额：**TBD**（合同侧约定，代码里没有体现）
- EACY 侧并发上限取决于 Celery `ocr` 队列的 worker concurrency，详见 [[Celery任务运维]]（待写）
- 单文档大小由 TextIn 服务端校验，**EACY 不在上传时按页数限制**

---

## 五、降级 / 重试策略

| 层级 | 行为 |
|---|---|
| **HTTP 网络错误**（`ConnectError` / `ReadTimeout` / `WriteTimeout` / `RemoteProtocolError` 等） | `TextInOcrClient._post_document_bytes` **自动重试 3 次**，间隔 `1.5 / 3.0` 秒线性退避 |
| **HTTP 非 2xx** | **不**重试，直接抛 `TextInOcrError` |
| **业务 code 非 200** | **不**重试，抛 `TextInOcrError`，错误消息回写到 `document.ocr_payload_json.errors[]` |
| **Worker 层** | 失败时 `document.ocr_status = failed`，前端列表标红；用户可手动 requeue |

**不做自动降级**：OCR 失败不会切换到其它 OCR 服务，也不会跳过直接进入 metadata / 抽取链路——因为后续阶段强依赖 OCR 文本与坐标。

---

## 六、常见错误码与处理

| 触发 | 现象 | 处理 |
|---|---|---|
| 缺 `TEXTIN_APP_ID` / `TEXTIN_SECRET_CODE` | `TextInOcrError: Missing TextIn credentials` | 配置环境变量后重启 worker |
| 缺 `TEXTIN_API_URL` | `TextInOcrError: Missing TextIn API URL` | 同上 |
| 文档下载失败（预签名 URL 过期 / OSS 异常） | `TextInOcrError: Document download failed before OCR` | 检查 [[对象存储]] 与时钟漂移；签名 URL 默认 1h |
| TextIn 返回非 JSON | `TextInOcrError: TextIn returned a non-JSON response` | 多为对端 5xx 错误页；查看 worker 日志 |
| TextIn `code != 200` | `TextInOcrError: TextIn OCR failed: code=..., message=...` | 按 TextIn 官方错误码文档处理；常见为余额 / 配额 / 文档格式 |
| 持续网络抖动 | 三次重试后抛错 | 检查出站网络、DNS、白名单 |

排查路径：
1. 查 `document.ocr_payload_json.errors[]` 看最近一次的失败信息
2. 查 `async_task` 表对应 OCR 任务记录
3. 查 worker stdout

---

## 七、离线替代方案

**目前没有正式的离线替代**。研发期可用的临时手段：
- 直接构造一份符合 EACY 标准 payload（`ocr_payload_json`：`markdown / pages / lines / blocks`）的固定 fixture 写入 `document.parsed_data`，跳过 TextIn 调用
- 单测里 mock `TextInOcrClient.parse_document_url`

未来若引入第二家 OCR：在 `app/integrations/` 平行新增 client，并在 `document_service.process_document_ocr` 选择具体 client（**当前未实现**，TBD）。

---

## 相关文档

- [[端到端数据流]] — OCR 在整体链路中的位置
- [[文档与OCR/业务概述]]（待写）
- [[文档与OCR/OCR-payload结构]]（待写）
- [[AI抽取/证据归因机制]]（待写）
- [[对象存储]] — TextIn 通过 OSS 签名 URL 读取文档
- [[LLM-Provider]] — OCR 产物的下游消费者
