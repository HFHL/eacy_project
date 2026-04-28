---
title: EACY开发计划 6.3.4 Metadata Worker - Agent Prompt 与入库设计
tags:
  - eacy
  - metadata
  - worker
  - agent
status: draft
---

# EACY开发计划 6.3.4 Metadata Worker - Agent Prompt 与入库设计

父页面：[[EACY开发计划#6.3.4 Metadata Worker]]

## 目标

Metadata Worker 的职责是从 `documents.ocr_text` / `documents.ocr_payload_json` 中抽取文档级索引元数据，并把结果写入 `documents.metadata_json` 以及少量顶层索引字段。

本阶段不做字段级溯源，不输出 `audit`，不写 `field_value_evidence`，不参与 EHR / CRF 字段合并。metadata 的结果只作为文档分类、检索、归档、患者匹配和后续抽取路由的前置索引。

## Agent 职责

建议新增 `MetadataExtractionAgent`，它是一个受控 JSON 抽取器，不直接操作数据库。

输入：

```json
{
  "document_id": "uuid",
  "original_filename": "report.pdf",
  "mime_type": "application/pdf",
  "ocr_text": "OCR markdown or text",
  "ocr_payload_json": {},
  "schema": "meta_data.json"
}
```

输出只保留业务结果：

```json
{
  "result": {
    "唯一标识符": [],
    "机构名称": null,
    "科室信息": null,
    "患者姓名": null,
    "患者性别": null,
    "患者年龄": null,
    "出生日期": null,
    "联系电话": null,
    "诊断": null,
    "文档类型": null,
    "文档子类型": null,
    "文档标题": null,
    "文档生效日期": null
  }
}
```

约束：

- 必须返回合法 JSON。
- 顶层只允许 `result`，不允许 `audit`、`evidence`、解释文本或 Markdown 代码块。
- `result` 必须包含 `meta_data.json` 中定义的所有 required 字段。
- 抽不到的单值字段填 `null`，`唯一标识符` 抽不到填 `[]`。
- `文档类型` 必须来自 schema 枚举。
- `文档子类型` 必须与 `文档类型` 的条件枚举匹配；无法判断时填 `null`。
- 日期统一标准化：`出生日期` 为 `YYYY-MM-DD`，`文档生效日期` 为 `YYYY-MM-DDT00:00:00` 或更精确时间。

## 推荐模块划分

```text
backend/app/services/document_metadata_service.py
  DocumentMetadataService
    queue_document_metadata(document_id)
    process_document_metadata(document_id)
    persist_metadata_result(document, agent_output)

backend/app/services/metadata_agent.py
  MetadataExtractionAgent
    extract(input) -> dict

backend/app/services/metadata_prompt_builder.py
  MetadataPromptBuilder
    build_system_prompt(schema)
    build_user_prompt(document, ocr_text, rule_hints)

backend/app/services/metadata_normalizer.py
  MetadataNormalizer
    normalize(agent_output)
    validate(agent_output)
    to_document_update(result)
```

`metadata_tasks.py` 只负责 Celery 包装和 session 生命周期，实际逻辑下沉到 `DocumentMetadataService.process_document_metadata()`。

## Prompt 组装

Prompt 不直接复用 `meta_data.json` 里的 `system` 字段，因为当前实现不需要 audit。应由后端根据 schema 动态组装一个更窄的 prompt。

### System Prompt

```text
你是医疗文档元数据抽取器。

任务：从 OCR 文本中抽取文档级元数据，只输出 JSON。

输出格式必须严格为：
{
  "result": {
    "唯一标识符": [],
    "机构名称": null,
    "科室信息": null,
    "患者姓名": null,
    "患者性别": null,
    "患者年龄": null,
    "出生日期": null,
    "联系电话": null,
    "诊断": null,
    "文档类型": null,
    "文档子类型": null,
    "文档标题": null,
    "文档生效日期": null
  }
}

规则：
1. 不要输出 audit、evidence、解释、Markdown 或代码块。
2. 找不到信息时，单值字段填 null，唯一标识符填 []。
3. 不要编造患者信息、机构、诊断、日期或编号。
4. 文档类型必须从给定枚举中选择。
5. 文档子类型必须从对应文档类型的子类型枚举中选择。
6. 出生日期格式为 YYYY-MM-DD。
7. 文档生效日期格式为 YYYY-MM-DDT00:00:00；无法确定日期则填 null。
8. 唯一标识符必须拆成数组，每项包含 标识符类型 和 标识符编号。
```

### Schema Context

从 `meta_data.json` 中提取最小必要上下文注入 prompt：

```json
{
  "document_type_enum": [
    "专科检查",
    "其他材料",
    "内镜检查",
    "基因检测",
    "实验室检查",
    "影像检查",
    "治疗记录",
    "生理功能检查",
    "病历记录",
    "病理报告"
  ],
  "identifier_type_enum": [
    "住院号",
    "门诊号",
    "急诊号",
    "MRN",
    "医保号",
    "社保号",
    "病案号",
    "健康卡号",
    "身份证号",
    "ID号",
    "其他"
  ],
  "document_subtype_by_type": {
    "实验室检查": ["血常规", "尿常规", "生化检查", "肿瘤标志物", "凝血功能", "综合检验报告"],
    "影像检查": ["CT检查", "MRI检查", "超声检查", "X光检查", "PET-CT检查"],
    "病历记录": ["门诊病历", "入院记录", "病程记录", "出院小结_记录", "病案首页"],
    "病理报告": ["手术病理", "冰冻病理", "穿刺病理", "细胞学检查"]
  }
}
```

实际注入时应包含完整子类型枚举，但只注入字段名、类型、枚举和日期格式，不注入 audit 配置。

### User Prompt

```text
请从下面文档中抽取元数据。

document_id: {document_id}
filename: {original_filename}
mime_type: {mime_type}

规则预判：
{rule_hints_json}

OCR 文本：
{ocr_text}
```

`rule_hints_json` 来自轻量规则预处理，可包含：

```json
{
  "candidate_titles": [],
  "candidate_dates": [],
  "candidate_identifier_lines": [],
  "candidate_patient_lines": [],
  "candidate_organization_lines": []
}
```

规则预判只作为提示，不能直接覆盖模型输出。最终仍需经过 normalizer 校验。

## 文本裁剪策略

Metadata 抽取不需要全量长文本。推荐构造 agent 输入时保留：

- 文档前 3000 到 5000 字。
- OCR Markdown 的一级/二级标题行。
- 包含姓名、性别、年龄、出生日期、住院号、门诊号、病案号、身份证、科室、医院、诊断、报告日期、检查日期、出院日期的行。
- 文档末尾 1000 到 2000 字，用于捕捉报告日期、签发日期、出院日期。

去重后拼接，控制在模型上下文预算内。原始 OCR 仍保留在 `documents.ocr_text`，metadata 只存结构化结果。

## 校验与归一化

Agent 输出后必须做后处理：

```text
raw JSON
  -> 去除 Markdown fence
  -> JSON parse
  -> JSON Schema 校验
  -> 补齐缺失 required key
  -> 类型归一化
  -> 枚举归一化
  -> 日期归一化
  -> 生成 documents 更新字段
```

归一化规则：

- `患者年龄`：字符串数字转 integer；负数或明显异常值转 null。
- `患者性别`：只允许 `男`、`女`、`不详`、`null`。
- `出生日期`：只允许 `YYYY-MM-DD`。
- `文档生效日期`：日期转 `YYYY-MM-DDT00:00:00`。
- `唯一标识符`：过滤空编号，去重，保留不同类型的同一编号。
- `文档类型`：无法映射到枚举时转 null。
- `文档子类型`：不属于当前 `文档类型` 的条件枚举时转 null。

## 入库逻辑

成功时：

```python
document.metadata_json = {
    "schema_version": "doc_metadata.v1",
    "result": normalized_result,
}
document.doc_type = normalized_result.get("文档类型")
document.doc_subtype = normalized_result.get("文档子类型")
document.doc_title = normalized_result.get("文档标题")
document.effective_at = parse_datetime(normalized_result.get("文档生效日期"))
document.meta_status = "completed"
```

失败时：

```python
document.meta_status = "failed"
document.metadata_json = {
    "schema_version": "doc_metadata.v1",
    "result": previous_result_or_empty_result,
    "error": {
        "type": exc.__class__.__name__,
        "message": str(exc)
    }
}
```

不建议把 `documents.status` 改成 `metadata_completed`，因为当前 `status` 同时承担上传、归档、删除等文档生命周期含义。metadata 状态应独立使用 `documents.meta_status` 表达。

## Worker 状态流转

```text
pending
  -> queued
  -> running
  -> completed
```

失败：

```text
queued/running -> failed
```

跳过：

```text
pending -> skipped
```

跳过条件：

- 文档不存在。
- 文档已删除。
- `ocr_status != completed` 且 `ocr_text` 为空。
- 文件类型暂不支持，且没有可用文本。

## API 与自动触发

建议新增：

```text
POST /api/v1/documents/{document_id}/metadata
```

行为：

- 校验文档存在。
- 如果 `meta_status = running`，返回 409。
- 写入 `meta_status = queued`。
- 投递 `METADATA_TASK_NAME`。
- 返回最新 `DocumentResponse`，HTTP 202。

OCR 成功后可以自动触发 metadata：

```text
process_document_ocr(document_id)
  -> ocr_status = completed
  -> send_task(METADATA_TASK_NAME, args=[document_id])
```

自动触发失败不能影响 OCR 成功状态。

## 第一版验收标准

- `POST /documents/{id}/metadata` 可以把文档状态推进到 `meta_status=queued`。
- metadata worker 执行后 `meta_status=completed` 或 `failed`。
- `documents.metadata_json.result` 严格符合 `meta_data.json` 的 result 字段结构。
- `documents.doc_type`、`doc_subtype`、`doc_title`、`effective_at` 能从 result 同步。
- 不生成 `audit`，不写 evidence 表。
- metadata 失败不清空 OCR 结果，不影响文档归档状态。
