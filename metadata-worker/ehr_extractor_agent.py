from __future__ import annotations

"""
EHR Extractor Agent — 基于 Google ADK 的电子病历结构化抽取器

目标：
1. 保持与原 DocumentCRFExtractor.extract_single_document 基本兼容的输入输出接口。
2. 使用 Google ADK 负责单个 task root 的 LLM 抽取与格式自修复。
3. task root 抽取在进程内串行执行（不依赖 Prefect Server；与 .env 中供 OCR 使用的 PREFECT_API_URL 解耦）。
4. 支持基于大 schema 自动发现 task roots，并按 x-sources 过滤当前文档是否适合抽取。

说明：
- 该文件重点是“真实可接入的 Agent 实现”，不负责数据库持久化。
- 模型提供方默认使用 LiteLLM（OpenAI 兼容网关），但 Agent 框架是 Google ADK。
- 若项目里已有 DocumentCRFExtractionResult / ExtractionTaskResult / TaskRoot，请复用这些类型。
"""

import asyncio
import hashlib
import json
import logging
import os
import time
from collections import defaultdict
from dataclasses import asdict, is_dataclass
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, List, Optional

from google.adk.agents import LlmAgent, LoopAgent
from google.adk.agents.base_agent import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event, EventActions
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.models.lite_llm import LiteLlm
from google.genai import types as genai_types

import litellm
from tenacity import retry, stop_after_attempt, wait_exponential
try:
    from jsonschema import Draft202012Validator
except Exception:  # pragma: no cover
    Draft202012Validator = None

from dataclasses import dataclass, field
from dotenv import load_dotenv
load_dotenv()

@dataclass
class TaskRoot:
    path: List[str]
    name: str
    schema_node: Dict[str, Any]
    x_sources: Dict[str, Any] = field(default_factory=dict)
    x_merge_binding: Optional[str] = None

@dataclass
class ExtractionTaskResult:
    task_name: str
    path: List[str]
    extracted: Dict[str, Any]
    source_docs: List[str]
    filled_count: int = 0
    total_count: int = 0
    coverage: float = 0.0
    audit: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None

@dataclass
class DocumentCRFExtractionResult:
    crf_data: Dict[str, Any]
    task_results: List[ExtractionTaskResult]
    total_tasks: int = 0
    completed_tasks: int = 0
    total_fields: int = 0
    filled_fields: int = 0
    coverage: float = 0.0
    extracted_at: str = ""
    duration_ms: int = 0
    errors: List[str] = field(default_factory=list)

def _normalize_doc_type(s: str) -> str:
    """标准化文档类型字符串，用于模糊匹配：去标点、空格、转小写。"""
    import re
    if not s:
        return ""
    s = s.lower()
    # 将常见分隔符统一替换掉
    s = re.sub(r"[_\-/\\·\s、，,。.（）()【】\[\]《》<>「」『』]+", "", s)
    return s


def _get_doc_type_from_document(doc: Dict[str, Any]) -> str:
    """
    从文档对象中提取文档子类型字符串。
    优先级：doc_type 字段 → metadata.result.文档子类型 → metadata.result.文档类型
    """
    # 1. 直接字段
    doc_type = doc.get("document_type") or doc.get("doc_type") or ""
    if doc_type:
        return doc_type

    # 2. metadata JSON（由 metadata-worker 写入）
    meta_raw = doc.get("metadata")
    if not meta_raw:
        return ""
    try:
        meta = meta_raw if isinstance(meta_raw, dict) else __import__("json").loads(meta_raw)
        result = meta.get("result", meta)
        if isinstance(result, dict):
            sub = result.get("文档子类型") or result.get("文档类型") or ""
            return sub
    except Exception:
        pass
    return ""


def filter_documents_by_sources(
    docs: List[Dict[str, Any]],
    primary: List[str],
    secondary: List[str],
) -> tuple:
    """
    根据 x-sources.primary / secondary 对文档列表进行过滤。

    - 若 primary 和 secondary 均为空 → 视为无来源限制，全部文档均为 primary。
    - 若文档子类型命中 primary → 放入 primary_docs。
    - 若文档子类型命中 secondary（且不在 primary）→ 放入 secondary_docs。
    - 否则跳过。

    返回: (primary_docs, secondary_docs)
    """
    if not primary and not secondary:
        # 无 x-sources 限制，全部归为 primary
        return list(docs), []

    norm_primary = [_normalize_doc_type(t) for t in primary]
    norm_secondary = [_normalize_doc_type(t) for t in secondary]

    primary_docs: List[Dict[str, Any]] = []
    secondary_docs: List[Dict[str, Any]] = []

    for doc in docs:
        raw_type = _get_doc_type_from_document(doc)
        norm_type = _normalize_doc_type(raw_type)

        if not norm_type:
            # doc_type 未知时：不跳过，但只作为 secondary（保守策略）
            if norm_secondary:
                secondary_docs.append(doc)
            else:
                # 没有 secondary 限制时也降级放入 secondary
                secondary_docs.append(doc)
            continue

        # 模糊匹配：检查 norm_type 是否包含（或被包含于）任一候选词
        def _matches(norm_type: str, candidates: List[str]) -> bool:
            for c in candidates:
                if not c:
                    continue
                if c in norm_type or norm_type in c:
                    return True
            return False

        if _matches(norm_type, norm_primary):
            primary_docs.append(doc)
        elif _matches(norm_type, norm_secondary):
            secondary_docs.append(doc)
        else:
            logger.debug(
                "[filter_documents_by_sources] 跳过: doc_type=%r 不匹配 primary=%s secondary=%s",
                raw_type, primary[:3], secondary[:3],
            )

    return primary_docs, secondary_docs

logger = logging.getLogger(__name__)

for _noisy in ("LiteLLM", "litellm", "google.adk", "google.genai", "httpx"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)
    logging.getLogger(_noisy).propagate = False

# ═══════════════════════════════════════════════════════════════════════════════
# 模型配置
# ═══════════════════════════════════════════════════════════════════════════════

litellm.num_retries = 2
litellm.request_timeout = 120


# ═══════════════════════════════════════════════════════════════════════════════
# Schema 工具函数
# ═══════════════════════════════════════════════════════════════════════════════

def _resolve_schema_node(schema: Dict[str, Any], node: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(node, dict):
        return {}
    all_of = node.get("allOf")
    if isinstance(all_of, list):
        ref = next(
            (
                it["$ref"]
                for it in all_of
                if isinstance(it, dict) and isinstance(it.get("$ref"), str)
            ),
            None,
        )
        if isinstance(ref, str) and ref.startswith("#/$defs/"):
            defs = schema.get("$defs") or {}
            resolved = dict(defs.get(ref.replace("#/$defs/", ""), {}))
            if resolved:
                resolved.update(node)
                return resolved
    return node


def _infer_type(node: Dict[str, Any]) -> str:
    t = node.get("type")
    if isinstance(t, str):
        return t
    if "properties" in node:
        return "object"
    if "items" in node:
        return "array"
    return "string"


def _find_task_roots(schema: Dict[str, Any]) -> List[TaskRoot]:
    roots: List[TaskRoot] = []

    def walk(node: Dict[str, Any], path: List[str]) -> None:
        node = _resolve_schema_node(schema, node)
        t = _infer_type(node)
        if (node.get("x-sources") or node.get("x-merge-binding")) and t in ("object", "array") and path:
            roots.append(
                TaskRoot(
                    path=list(path),
                    name=" / ".join(path),
                    schema_node=node,
                    x_sources=node.get("x-sources") or {},
                    x_merge_binding=node.get("x-merge-binding"),
                )
            )
            return
        if t == "object" and isinstance(node.get("properties"), dict):
            for k, child in node["properties"].items():
                walk(child, path + [k])
        elif t == "array" and isinstance(node.get("items"), dict):
            walk(node["items"], path + ["[]"])

    if isinstance(schema.get("properties"), dict):
        for k, v in schema["properties"].items():
            walk(v, [k])
    return roots


def _collect_leaf_fields(schema: Dict[str, Any], schema_node: Dict[str, Any], prefix: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    prefix = prefix or []
    specs: List[Dict[str, Any]] = []

    def _to_pointer(path: List[str]) -> str:
        return "/" + "/".join(path)

    def walk(node: Dict[str, Any], path: List[str]) -> None:
        node = _resolve_schema_node(schema, node)
        t = _infer_type(node)
        if t == "object" and isinstance(node.get("properties"), dict):
            for k, child in node["properties"].items():
                walk(child, path + [k])
            return
        if t == "array":
            specs.append({"path": _to_pointer(path), "type": "array", "prompt": node.get("x-extraction-prompt")})
            if isinstance(node.get("items"), dict):
                items_node = _resolve_schema_node(schema, node["items"])
                if isinstance(items_node.get("properties"), dict):
                    for k, child in items_node["properties"].items():
                        walk(child, path + ["N", k])
            return
        specs.append(
            {
                "path": _to_pointer(path),
                "type": t,
                "format": node.get("format"),
                "enum": node.get("enum") if isinstance(node.get("enum"), list) else None,
                "description": node.get("description"),
                "prompt": node.get("x-extraction-prompt"),
            }
        )

    walk(schema_node, prefix)
    return specs


def _full_path_to_task_relative(full_path: str, task_path: List[str]) -> str:
    if not task_path:
        return full_path
    prefix = "/" + "/".join(task_path)
    if full_path == prefix:
        return "/"
    if full_path.startswith(prefix + "/"):
        return full_path[len(prefix):]
    return full_path


def _expand_audit_fields_to_full(task_path: List[str], fields: Dict[str, Any]) -> Dict[str, Any]:
    if not task_path or not isinstance(fields, dict):
        return fields
    prefix = "/" + "/".join(task_path)
    out: Dict[str, Any] = {}
    for k, v in fields.items():
        if not isinstance(k, str):
            continue
        if k == prefix or k.startswith(prefix + "/"):
            out[k] = v
            continue
        rel = k if k.startswith("/") else "/" + k.lstrip("/")
        out[prefix + rel] = v
    return out


def _content_list_to_blocks(content_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    blocks: List[Dict[str, Any]] = []
    page_seq: Dict[int, int] = defaultdict(int)
    for item in content_list:
        if not isinstance(item, dict):
            continue
        text = (item.get("text") or item.get("content") or "").strip()
        if not text:
            continue
        raw_page = item.get("page_idx", item.get("page_id", 0))
        try:
            page_id = int(raw_page) if raw_page is not None else 0
        except (TypeError, ValueError):
            page_id = 0
        idx_in_page = page_seq[page_id]
        page_seq[page_id] = idx_in_page + 1
        bid = f"p{page_id}.{idx_in_page}"
        blocks.append({"block_id": bid, "text": text, "page_id": page_id})
    return blocks


# ═══════════════════════════════════════════════════════════════════════════════
# 输出校验
# ═══════════════════════════════════════════════════════════════════════════════

class ExtractionValidationError(Exception):
    def __init__(self, message: str, raw_output: Any = None, attempts: int = 0):
        super().__init__(message)
        self.raw_output = raw_output
        self.attempts = attempts


def _build_task_validation_schema(root_schema: Dict[str, Any], task_schema_node: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "$schema": root_schema.get("$schema", "https://json-schema.org/draft/2020-12/schema"),
        "$defs": root_schema.get("$defs", {}),
        **task_schema_node,
    }


def _validate_extraction_output(raw: Any, root_schema: Optional[Dict[str, Any]] = None, task_schema: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    parsed = None
    if isinstance(raw, dict):
        parsed = raw
    elif isinstance(raw, str):
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError as e:
            raise ExtractionValidationError(f"JSON 解析失败: {e}", raw_output=raw)
    else:
        raise ExtractionValidationError(f"输出类型不支持: {type(raw).__name__}", raw_output=raw)

    if not isinstance(parsed, dict):
        raise ExtractionValidationError(f"顶层不是 dict: {type(parsed).__name__}", raw_output=raw)
    if "result" not in parsed:
        raise ExtractionValidationError(f"缺少 'result' 键。现有 keys: {list(parsed.keys())}", raw_output=raw)

    result_val = parsed.get("result")
    if result_val is not None and not isinstance(result_val, (dict, list)):
        raise ExtractionValidationError(f"'result' 值类型异常: {type(result_val).__name__}", raw_output=raw)

    def _sanitize_empty_strings(obj: Any) -> Any:
        if isinstance(obj, dict):
            return {k: _sanitize_empty_strings(v) for k, v in obj.items() if v != "" and v is not None}
        elif isinstance(obj, list):
            return [_sanitize_empty_strings(x) for x in obj if x != "" and x is not None]
        return obj

    if result_val is not None:
        result_val = _sanitize_empty_strings(result_val)
        parsed["result"] = result_val

    audit = parsed.get("audit")
    if audit is not None and not isinstance(audit, dict):
        raise ExtractionValidationError("'audit' 必须是对象", raw_output=raw)
    if isinstance(audit, dict):
        fields = audit.get("fields")
        if fields is not None and not isinstance(fields, dict):
            raise ExtractionValidationError("'audit.fields' 必须是对象", raw_output=raw)

    if root_schema is not None and task_schema is not None and Draft202012Validator is not None:
        try:
            validator = Draft202012Validator(_build_task_validation_schema(root_schema, task_schema))
            errors = sorted(validator.iter_errors(result_val), key=lambda e: list(e.absolute_path))
            if errors:
                first = errors[0]
                path = "/" + "/".join(str(p) for p in first.absolute_path)
                raise ExtractionValidationError(
                    f"result 不符合当前 task schema: {first.message}; path={path or '/'}",
                    raw_output=raw,
                )
        except ExtractionValidationError:
            raise
        except Exception as e:
            raise ExtractionValidationError(f"schema 校验执行失败: {e}", raw_output=raw)

    return parsed


class _FormatValidator(BaseAgent):
    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        raw = ctx.session.state.get("extracted", "")
        validation_log = ctx.session.state.get("_validation_log", [])
        attempt = len(validation_log) + 1

        entry = {"attempt": attempt, "timestamp": datetime.now(timezone.utc).isoformat()}
        root_schema = ctx.session.state.get("_root_schema")
        task_schema = ctx.session.state.get("_task_schema")

        try:
            _validate_extraction_output(raw, root_schema=root_schema, task_schema=task_schema)
            entry["status"] = "pass"
            validation_log.append(entry)
            ctx.session.state["_validation_log"] = validation_log
            yield Event(author=self.name, actions=EventActions(escalate=True))
        except ExtractionValidationError as e:
            entry["status"] = "fail"
            entry["error"] = str(e)
            validation_log.append(entry)
            ctx.session.state["_validation_log"] = validation_log

            error_msg = (
                f"[校验轮次 {attempt}] 抽取结果校验失败：{e}\n\n"
                f"请严格重新输出纯 JSON，禁止解释、禁止 markdown、禁止思维链。\n"
                f"输出格式必须为：\n"
                f'{{{{"result": <当前任务结果>, "audit": {{{{"fields": {{{{...}}}}}}}}}}}}\n\n'
                f"要求：\n"
                f"1. result 必须符合当前 task schema\n"
                f"2. 顶层必须有 result 和 audit\n"
                f"3. audit.fields 键必须为 JSON Pointer 风格路径\n"
                f"4. 无证据时请返回 null，不要猜测\n"
            )
            yield Event(
                author=self.name,
                content=genai_types.Content(role="user", parts=[genai_types.Part.from_text(text=error_msg)]),
            )


# ═══════════════════════════════════════════════════════════════════════════════
# Prompt 构建
# ═══════════════════════════════════════════════════════════════════════════════

def _build_extraction_instruction(task_name: str, fields_text: str, schema_snippet: str, task_path: List[str]) -> str:
    task_path_str = " / ".join(task_path) if task_path else task_name
    return f"""你是专业的医疗文档结构化抽取专家。你的任务是基于当前输入文档，为当前 task path 抽取结构化结果，并返回严格符合要求的 JSON。

【当前任务路径】
{task_path_str}

【总原则】
1. 仅依据当前输入文档文本抽取，不使用外部知识，不做常识补全。
2. 宁可缺失，不可猜测；无可靠证据时返回 null。
3. 只处理当前任务定义的字段，不新增字段，不输出任务外结构。
4. 只输出纯 JSON，不要 markdown，不要解释，不要思维链。

【输出格式】
{{{{
  "result": <符合当前 task schema 的 JSON>,
  "audit": {{{{
    "fields": {{{{
      "<字段路径>": {{{{
        "value": <与 result 对应字段相同的值>,
        "raw": <原文证据片段；无证据时为 null>,
        "source_id": <原文块标识，如 p0.3；无证据时为 null>
      }}}}
    }}}}
  }}}}
}}}}

【审计规则】
1. audit.fields 必须覆盖你实际输出的叶子字段。
2. audit.value 必须与 result 中同路径字段值一致。
3. raw 必须是原文片段，不得总结改写。
4. source_id 必须来自输入 OCR blocks 的 block_id。

【字段清单】
{fields_text}

【当前任务 schema 片段】
{schema_snippet}
"""


# ═══════════════════════════════════════════════════════════════════════════════
# 统计
# ═══════════════════════════════════════════════════════════════════════════════

def _count_fields(obj: Any, depth: int = 0) -> tuple[int, int]:
    if depth > 10:
        return 0, 0
    if isinstance(obj, dict):
        t = f = 0
        for v in obj.values():
            a, b = _count_fields(v, depth + 1)
            t += a
            f += b
        return t, f
    if isinstance(obj, list):
        if not obj:
            return 1, 0
        t = f = 0
        for item in obj:
            a, b = _count_fields(item, depth + 1)
            t += a
            f += b
        return t, f
    return 1, (1 if obj is not None and str(obj).strip() else 0)


# ═══════════════════════════════════════════════════════════════════════════════
# 单 task：Google ADK 抽取
# ═══════════════════════════════════════════════════════════════════════════════

async def _extract_single_task_adk(
    *,
    root_schema: Dict[str, Any],
    task_name: str,
    instruction: str,
    user_message: str,
    task_path: List[str],
    task_schema: Dict[str, Any],
    max_loop_iterations: int = 3,
) -> Dict[str, Any]:
    from llm_router import get_llm_configs
    configs = get_llm_configs(strategy="fallback")

    last_exception = None

    for config in configs:
        logger.info(f"[EHR Agent] 尝试配置: {config.get('id')} (Model: {config.get('model')})")
        model_instance = LiteLlm(
            model=f"openai/{config['model']}",
            api_base=config['base_url'],
            api_key=config['api_key'] or "sk-placeholder",
        )
        
        try:
            return await _do_extract_single_task_adk(
                model_instance=model_instance,
                root_schema=root_schema,
                task_name=task_name,
                instruction=instruction,
                user_message=user_message,
                task_path=task_path,
                task_schema=task_schema,
                max_loop_iterations=max_loop_iterations
            )
        except Exception as e:
            last_exception = e
            logger.warning(f"[EHR Agent] 配置 {config.get('id')} 发生错误，降级切换: {e}")
            continue
            
    raise RuntimeError(f"所有 LLM 节点均请求失败，最后错误: {last_exception}")

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=5, max=30),
    reraise=True
)
async def _do_extract_single_task_adk(
    model_instance: LiteLlm,
    root_schema: Dict[str, Any],
    task_name: str,
    instruction: str,
    user_message: str,
    task_path: List[str],
    task_schema: Dict[str, Any],
    max_loop_iterations: int = 3,
) -> Dict[str, Any]:
    extract_agent = LlmAgent(
        name="extract_task",
        model=model_instance,
        instruction=instruction,
        output_key="extracted",
    )
    validator = _FormatValidator(name="format_validator")
    pipeline = LoopAgent(
        name="robust_pipeline",
        sub_agents=[extract_agent, validator],
        max_iterations=max_loop_iterations,
    )

    safe_id = hashlib.md5(f"{task_name}_{time.time()}".encode()).hexdigest()[:8]
    app_name = f"ehr_ex_{safe_id}"
    user_id = "system"
    session_id = f"s_{safe_id}"

    session_service = InMemorySessionService()
    await session_service.create_session(
        app_name=app_name,
        user_id=user_id,
        session_id=session_id,
        state={"_root_schema": root_schema, "_task_schema": task_schema},
    )
    runner = Runner(agent=pipeline, app_name=app_name, session_service=session_service)

    t0 = time.time()
    user_content = genai_types.Content(role="user", parts=[genai_types.Part.from_text(text=user_message)])
    events_collected = []

    logger.info(
        "[EHR Agent] === LLM Request ===\n[Task: %s]\n[Instruction]:\n%s\n\n[User Message]:\n%s\n=== End LLM Request ===",
        task_name,
        instruction,
        user_message,
    )

    async for event in runner.run_async(user_id=user_id, session_id=session_id, new_message=user_content):
        events_collected.append(event)

    elapsed_ms = int((time.time() - t0) * 1000)

    final_session = await session_service.get_session(app_name=app_name, user_id=user_id, session_id=session_id)
    extracted_raw = final_session.state.get("extracted", {})
    validation_log = final_session.state.get("_validation_log", [])

    parsed = _validate_extraction_output(extracted_raw, root_schema=root_schema, task_schema=task_schema)

    logger.info(
        "[EHR Agent] === LLM Response ===\n[Task: %s]\n[Raw Extracted]:\n%s\n=== End LLM Response ===",
        task_name,
        json.dumps(extracted_raw, ensure_ascii=False, indent=2) if isinstance(extracted_raw, (dict, list)) else str(extracted_raw),
    )

    audit = parsed.get("audit")
    if isinstance(audit, dict):
        af = audit.get("fields")
        if isinstance(af, dict):
            audit["fields"] = _expand_audit_fields_to_full(task_path, af)

    return {
        "parsed": parsed,
        "elapsed_ms": elapsed_ms,
        "validation_log": validation_log,
        "events_count": len(events_collected),
    }


_GLOBAL_PAYLOAD_STORE: Dict[str, Any] = {}

# 进程内串行执行（不经过 Prefect Server，避免 .env 里 PREFECT_API_URL=4200 导致连接失败）
def _extract_task_sync(payload_id: str, task_idx: int) -> Dict[str, Any]:
    shared = _GLOBAL_PAYLOAD_STORE.get(payload_id)
    if not shared:
        raise RuntimeError(f"未找到 payload_id: {payload_id}")
    task_shared = shared["tasks"][task_idx]
    
    payload = dict(task_shared)
    payload["root_schema"] = shared["root_schema"]
    payload["user_message"] = shared["user_message"]
    return asyncio.run(_extract_single_task_adk(**payload))


def _extract_document_flow(payload_id: str) -> List[Dict[str, Any]]:
    outputs: List[Dict[str, Any]] = []
    shared = _GLOBAL_PAYLOAD_STORE.get(payload_id)
    if not shared:
        raise RuntimeError(f"未找到 payload_id: {payload_id}")
    tasks = shared["tasks"]
    for i, t in enumerate(tasks):
        logger.info("[ehr-flow] 开始 task root: %s", t.get("task_name"))
        outputs.append(_extract_task_sync(payload_id, i))
    return outputs

# ═══════════════════════════════════════════════════════════════════════════════
# 主入口：EhrExtractorAgent
# ═══════════════════════════════════════════════════════════════════════════════

class EhrExtractorAgent:
    def __init__(self, schema: Dict[str, Any]):
        if not schema:
            raise ValueError("EHR V2 schema 不能为空")
        self._schema = schema
        self.task_roots = _find_task_roots(schema)
        logger.info("[EhrExtractorAgent] 初始化完成，发现 %s 个 task roots", len(self.task_roots))

    async def extract_single_document(
        self,
        document: Dict[str, Any],
        target_section: Optional[str] = None,
    ) -> DocumentCRFExtractionResult:
        start_time = datetime.now()

        if not document:
            return DocumentCRFExtractionResult(crf_data={}, task_results=[], errors=["No document provided"])
        if not self.task_roots:
            return DocumentCRFExtractionResult(crf_data={}, task_results=[], errors=["No task roots found in schema"])

        content_list = document.get("content_list", [])
        if not content_list:
            return DocumentCRFExtractionResult(crf_data={}, task_results=[], errors=["Document has no content_list"])

        blocks_for_llm = _content_list_to_blocks(content_list)
        if not blocks_for_llm:
            return DocumentCRFExtractionResult(crf_data={}, task_results=[], errors=["No text blocks extracted from content_list"])

        doc_type = document.get("document_type", "")
        doc_subtype = document.get("document_sub_type", "")
        file_name = document.get("file_name", "")

        active_tasks = self.task_roots
        if target_section:
            target_parts = target_section.split(".")
            active_tasks = [t for t in self.task_roots if t.path[: len(target_parts)] == target_parts]

        task_payloads: List[Dict[str, Any]] = []
        prebuilt_results: List[ExtractionTaskResult] = []
        errors: List[str] = []

        doc_type_raw = _get_doc_type_from_document(document)
        skipped_count = 0

        for task in active_tasks:
            # ── x-sources 过滤：只对匹配文档类型的 task root 发起 LLM 调用 ──
            if not target_section and task.x_sources:
                primary_sources = task.x_sources.get("primary", [])
                # 暂时不启用 secondary，只用 primary
                secondary_sources = [] # task.x_sources.get("secondary", [])
                primary_docs, secondary_docs = filter_documents_by_sources(
                    [document], primary_sources, secondary_sources
                )
                if not primary_docs and not secondary_docs:
                    # 文档类型与该 task 完全不匹配，跳过
                    skipped_count += 1
                    prebuilt_results.append(
                        ExtractionTaskResult(
                            task_name=task.name,
                            path=task.path,
                            extracted={},
                            source_docs=[],
                            error="source_type_mismatch",
                        )
                    )
                    continue
                # secondary-only 时仍然执行，但在 instruction 中降低期望

            leaf_specs = _collect_leaf_fields(self._schema, task.schema_node, task.path)
            fields_lines = []
            for s in leaf_specs[:120]:
                rp = _full_path_to_task_relative(s["path"], task.path)
                line = f"- {rp} | type={s['type']}"
                if s.get("format"):
                    line += f" | format={s['format']}"
                if s.get("enum"):
                    line += f" | enum={s['enum'][:8]}"
                if s.get("description"):
                    line += f" | {str(s['description'])[:120]}"
                if s.get("prompt"):
                    line += f" | 提示={str(s['prompt'])[:100]}"
                fields_lines.append(line)
            fields_text = "\n".join(fields_lines)

            simplified = {"type": _infer_type(task.schema_node)}
            if task.schema_node.get("properties"):
                simplified["properties"] = task.schema_node["properties"]
            if task.schema_node.get("items"):
                simplified["items"] = task.schema_node["items"]
            schema_snippet = json.dumps(simplified, ensure_ascii=False, indent=2)[:5000]

            instruction = _build_extraction_instruction(task.name, fields_text, schema_snippet, task.path)
            task_payloads.append(
                {
                    "task_name": task.name,
                    "instruction": instruction,
                    "task_path": task.path,
                    "task_schema": task.schema_node,
                    "max_loop_iterations": 3,
                }
            )

        logger.info(
            "[EhrExtractorAgent] doc_type=%r | 执行 %d/%d task roots（跳过 %d 个，类型不匹配）",
            doc_type_raw or "未知", len(task_payloads), len(active_tasks), skipped_count,
        )

        flow_results: List[Dict[str, Any]] = []
        if task_payloads:
            user_message = (
                f"以下是文档「{file_name}」（类型: {doc_type}/{doc_subtype}）的 OCR 文本块：\n\n"
                + json.dumps(blocks_for_llm, ensure_ascii=False)
            )
            import uuid
            payload_id = str(uuid.uuid4())
            _GLOBAL_PAYLOAD_STORE[payload_id] = {
                "root_schema": self._schema,
                "user_message": user_message,
                "tasks": task_payloads,
            }
            try:
                flow_results = await asyncio.to_thread(_extract_document_flow, payload_id)
            finally:
                _GLOBAL_PAYLOAD_STORE.pop(payload_id, None)

        valid_results: List[ExtractionTaskResult] = list(prebuilt_results)
        for payload, flow_result in zip(task_payloads, flow_results):
            task_name = payload["task_name"]
            task_path = payload["task_path"]
            try:
                parsed = flow_result["parsed"]
                result_data = parsed.get("result", {})
                audit_data = parsed.get("audit", {})
                total_f, filled_f = _count_fields(result_data) if result_data else (0, 0)
                valid_results.append(
                    ExtractionTaskResult(
                        task_name=task_name,
                        path=task_path,
                        extracted=result_data if isinstance(result_data, (dict, list)) else {},
                        source_docs=[document.get("id", "")],
                        filled_count=filled_f,
                        total_count=total_f,
                        coverage=round(filled_f / total_f, 4) if total_f else 0.0,
                        audit=audit_data,
                    )
                )
                logger.info(
                    "[EhrExtractorAgent] 任务完成: %s (%sms, %s/%s 字段, 校验 %s 轮)",
                    task_name,
                    flow_result["elapsed_ms"],
                    filled_f,
                    total_f,
                    len(flow_result["validation_log"]),
                )
            except ExtractionValidationError as e:
                error_msg = f"Task {task_name}: 格式/Schema 校验最终失败 ({e.attempts} 轮): {e}"
                logger.error("[EhrExtractorAgent] %s", error_msg)
                errors.append(error_msg)
                valid_results.append(
                    ExtractionTaskResult(
                        task_name=task_name,
                        path=task_path,
                        extracted={},
                        source_docs=[document.get("id", "")],
                        error=error_msg,
                    )
                )
            except Exception as e:
                error_msg = f"Task {task_name}: {e}"
                logger.error("[EhrExtractorAgent] 任务异常: %s", error_msg, exc_info=True)
                errors.append(error_msg)
                valid_results.append(
                    ExtractionTaskResult(
                        task_name=task_name,
                        path=task_path,
                        extracted={},
                        source_docs=[document.get("id", "")],
                        error=error_msg,
                    )
                )

        return self._build_result(valid_results, errors, start_time)

    def _build_result(
        self,
        valid_results: List[ExtractionTaskResult],
        errors: List[str],
        start_time: datetime,
    ) -> DocumentCRFExtractionResult:
        crf_data: Dict[str, Any] = {}
        total_fields = 0
        filled_fields = 0
        result_errors = list(errors)

        for result in valid_results:
            if result.extracted:
                _set_nested_value(crf_data, result.path, result.extracted)
            total_fields += result.total_count
            filled_fields += result.filled_count
            if result.error:
                result_errors.append(f"Task {result.task_name}: {result.error}")

        end_time = datetime.now()
        duration_ms = int((end_time - start_time).total_seconds() * 1000)

        return DocumentCRFExtractionResult(
            crf_data=crf_data,
            task_results=list(valid_results),
            total_tasks=len(self.task_roots),
            completed_tasks=len([r for r in valid_results if r.extracted]),
            total_fields=total_fields,
            filled_fields=filled_fields,
            coverage=filled_fields / total_fields if total_fields > 0 else 0.0,
            extracted_at=end_time.isoformat(),
            duration_ms=duration_ms,
            errors=result_errors,
        )

    @staticmethod
    def merge_indexer_metadata(crf_data: Dict[str, Any], indexer_metadata: dict) -> Dict[str, Any]:
        return crf_data


def _set_nested_value(data: Dict[str, Any], path: List[str], value: Any) -> None:
    cur = data
    for k in path[:-1]:
        if k not in cur:
            cur[k] = {}
        cur = cur[k]
    if path:
        cur[path[-1]] = value
