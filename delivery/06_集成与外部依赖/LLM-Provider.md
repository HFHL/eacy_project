---
type: reference
module: 集成与外部依赖
status: draft
audience: [integrator, ops, tech-lead]
code_path:
  - backend/app/services/llm_ehr_extractor.py
  - backend/app/services/metadata_agent.py
  - backend/app/services/document_metadata_service.py
  - backend/app/workers/extraction_tasks.py
  - backend/app/workers/metadata_tasks.py
  - backend/core/config.py
last_verified_commit: 132a529
last_verified_date: 2026-05-13
owner: 后端
---

# LLM Provider

> EACY 通过**单一 OpenAI 兼容 endpoint**调用大模型，承担两类工作：**文档 Metadata 识别**与**EHR/CRF 字段抽取**。无 vendor SDK 依赖，仅用 `httpx` + Chat Completions API。

## 一、用途与触发场景

| 场景 | 入口代码 | 触发时机 |
|---|---|---|
| **Metadata 识别** — 推断 `doc_type / doc_subtype / doc_title / effective_at` | `metadata_agent.py::MetadataExtractionAgent.extract` | OCR 完成后自动入 `metadata` 队列；或后台手工触发 |
| **EHR / CRF 字段抽取** — 按 Schema 模板版本抽字段值 + 证据 | `llm_ehr_extractor.py::LlmEhrExtractor.extract` | 用户在 PatientDetail 触发 / metadata 完成自动入 `extraction` 队列 |

> 全链路位置见 [[端到端数据流]] 阶段 [3]、[5]。

---

## 二、接入方式

- **协议**：OpenAI 兼容的 `POST {base_url}/chat/completions`
- **传输**：`httpx`（metadata 同步 client；extractor 内部 LangGraph 节点中也用同步 client）
- **鉴权**：`Authorization: Bearer ${OPENAI_API_KEY}`（任何 OpenAI 兼容 Provider 都用同一字段名，含 DeepSeek / 阿里百炼 / 本地 vLLM 等）
- **请求形态**（两处统一）：
  - `model = config.OPENAI_MODEL`
  - `messages = [system, user]`
  - `temperature = METADATA_LLM_TEMPERATURE` / `EXTRACTION_LLM_TEMPERATURE`
  - `response_format = {"type": "json_object"}`（**请求若被 endpoint 以 4xx 拒绝，则自动剥离该字段重试一次**——对仍不支持 JSON mode 的 provider 的兼容）

> [!info] 真正的"切换 Provider"只是改 base URL + model
> EACY 不依赖 OpenAI SDK，更换 Provider 只需改 `OPENAI_API_BASE_URL` 与 `OPENAI_MODEL`，键名固定为 `OPENAI_*`。

### LangGraph 编排（仅抽取链路）

`LlmEhrExtractor` 使用 [LangGraph](https://github.com/langchain-ai/langgraph) `StateGraph` 编排为五节点流水：

```text
START → prepare → call_llm → validate ─┬─(invalid + 剩余尝试)→ call_llm
                                       └─(valid / 用尽尝试)→ normalize → resolve_merge → END
```

| 节点 | 职责 |
|---|---|
| `prepare` | 组装 `field_specs` / system prompt / user prompt（含 OCR 文本 + 证据单元 `lines[]`） |
| `call_llm` | 调一次 chat completions；解析 JSON；失败保留 `parse_error` |
| `validate` | 校验 `field_path` / 枚举 / 日期格式 / `quote_text` 是否为 OCR 原文子串 |
| 路由 | 校验失败且 `attempt < max_attempts (=3)` → 用 `repair_prompt` 重试 |
| `normalize` | 把 `records[]` / `fields[]` 拍平到 `field_path` 粒度，做枚举归一、去重 |
| `resolve_merge` | 与上游 `field_current_value` 合并落库前的预处理（在外层做实际落库） |

Metadata 链路不走 LangGraph，是单次直调 + Normalizer。

---

## 三、关键配置项（环境变量）

| 环境变量 | 含义 | 默认 |
|---|---|---|
| `OPENAI_API_KEY` | Provider API Key | 无（缺则两条链路都抛错） |
| `OPENAI_API_BASE_URL` | Chat Completions 根路径 | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | 模型 ID | `gpt-4o-mini` |
| `METADATA_LLM_TIMEOUT_SECONDS` | metadata 单次超时 | `120.0` |
| `METADATA_LLM_TEMPERATURE` | metadata temperature | `0.0` |
| `METADATA_LLM_ENABLE_RULE_FALLBACK` | metadata LLM 失败时是否走规则回退 | `true` |
| `EXTRACTION_LLM_TIMEOUT_SECONDS` | 抽取单次超时 | `180.0` |
| `EXTRACTION_LLM_TEMPERATURE` | 抽取 temperature | `0.0` |
| `EACY_EXTRACTION_STRATEGY` | 抽取策略选择 | `simple` |

> [!warning] 实际值
> API Key 不写文档，部署方在 `.env` 维护。见 [[环境变量清单]]（待写）。

---

## 四、配额与限速

- Provider 侧 QPM / TPM：**TBD**（取决于具体 Provider，代码无显式 rate limit）
- EACY 侧并发：由 `metadata` / `extraction` 两个 Celery 队列的 worker concurrency 决定
- **超长 OCR 文本**：`LlmEhrExtractor._trim_text` 在文本超过 ~18000 字时启发式裁剪（保留头尾 + 含医学关键字的行），避免触发 context window 上限

---

## 五、降级 / 重试策略

| 层级 | 行为 |
|---|---|
| **JSON mode 不支持** | 自动剥离 `response_format` 重试一次（仅本次请求） |
| **抽取校验失败** | LangGraph 路由器最多重试 2 次（`max_attempts=3`，含首次），每次用 `repair_prompt` 注入校验错误 |
| **Provider 5xx / 超时** | 由 Celery 任务层重试（详见 [[端到端数据流]]"重试策略"） |
| **Metadata LLM 报错** | 若 `METADATA_LLM_ENABLE_RULE_FALLBACK=true`，走规则化 fallback（基于文件名/正文关键词），结果写入 `document.metadata_json.llm_error` |
| **Extraction 校验全部失败** | 抛 `LlmExtractionError`；上层 `extraction_run` 落 `failed` 状态 |

---

## 六、常见错误码与处理

| 现象 | 触发 | 处理 |
|---|---|---|
| `LlmExtractionError: Missing OPENAI_API_KEY` | 配置缺失 | 设环境变量 |
| `MetadataExtractionError: Missing OPENAI_API_KEY` | 同上 | 同上 |
| `LlmExtractionError: langgraph is not installed` | 依赖缺失 | 重新执行 `pip install -r backend/requirements.txt` |
| HTTP 4xx / 5xx | Provider 拒绝（401 / 403 / 429 / 5xx） | 查 worker 日志中 `response.text` 前 500 字；401 → key；429 → 限速 / 配额；5xx → Provider 故障 |
| `EHR LLM returned empty content` | 模型空响应 | 多发生在 reasoning 类模型把全部 token 用于思考；切换模型或调大 max_tokens（TBD：代码当前未显式传 `max_tokens`） |
| `EHR LLM output must be a JSON object` | 模型不肯输出 JSON | 切支持 JSON mode 的模型，或加强 system prompt |
| `quote_text must be an OCR substring` | 模型编造证据 | 校验器自动降级为 warning，不影响落库；但会被验收脚本统计 |

---

## 七、离线替代方案

- **Metadata 规则回退**：`METADATA_LLM_ENABLE_RULE_FALLBACK=true` 时，LLM 失败可由规则把 `doc_type / doc_subtype` 推到一个保守值
- **Extraction 无离线方案**：抽取强依赖 LLM；无 LLM 时只能由人工在 EhrTab / SchemaEhrTab 直接录入字段值（走人工 `field_value_event`）
- **本地模型**：将 `OPENAI_API_BASE_URL` 指向兼容 OpenAI 的本地服务（vLLM / Ollama OpenAI 兼容层）即可，不需要改代码

---

## 相关文档

- [[端到端数据流]] — LLM 在 [3] [5] 阶段的位置
- [[AI抽取/业务概述]]（待写）
- [[AI抽取/Prompt与校验]]（待写）
- [[AI抽取/证据归因机制]]（待写）
- [[文档与OCR/Metadata识别]]（待写）
- [[TextIn-OCR]] — 上游产物
- [[环境变量清单]]（待写）
