from __future__ import annotations

"""
单文件版：OpenAI + Prefect 医疗文档元数据抽取 Worker（严格对齐 meta_data.json + 运行时消歧版）

说明：
1. 不在 Python 中新增字段、主类型、子类型或自定义分类规则。
2. 仍以 backend/src/schema/meta_data.json 作为唯一契约来源。
3. 仅处理 JSON 配置内部的“格式/可空/缺省”冲突：
   - 缺失字段补 null
   - 空字符串归一为 null
   - 文档生效日期若为明确 YYYY-MM-DD，则归一为 YYYY-MM-DDT00:00:00
   - 运行时校验允许字段为 null，以对齐 system/defaults 中“无证据即 null / 可省略”的要求
4. 不修改你的字段集合、文档主类型/子类型枚举、allOf 分类关系。
"""

import argparse
import asyncio
import copy
import json
import logging
import os
import re
import sys
from functools import lru_cache
from pathlib import Path
from typing import Any

import sqlite3
from dotenv import load_dotenv
from jsonschema import Draft202012Validator, FormatChecker
from openai import AsyncOpenAI
from tenacity import retry, wait_exponential, stop_after_attempt

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stderr,
)
_logger = logging.getLogger("metadata-worker")

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

CONTRACT_PATH = ROOT_DIR / "backend" / "src" / "schema" / "meta_data.json"
FORMAT_CHECKER = FormatChecker()


class ContractValidationError(RuntimeError):
    pass


def get_db_conn():
    db_path = ROOT_DIR / "backend" / "eacy.db"
    conn = sqlite3.connect(db_path, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


@lru_cache(maxsize=1)
def load_contract_config() -> dict[str, Any]:
    if not CONTRACT_PATH.exists():
        raise FileNotFoundError(f"找不到元数据契约文件: {CONTRACT_PATH}")

    raw = CONTRACT_PATH.read_text(encoding="utf-8")
    config = json.loads(raw)
    if not isinstance(config, dict):
        raise ContractValidationError("meta_data.json 顶层必须是 object")

    # 顶层包含 system/examples/defaults 等非标准 JSON Schema 关键字，
    # 只对 properties.result 子 schema 做元校验
    result_schema = config.get("properties", {}).get("result")
    if not isinstance(result_schema, dict):
        raise ContractValidationError("meta_data.json 必须包含 properties.result 子 schema")
    Draft202012Validator.check_schema(result_schema)
    return config


def _property_accepts_null(prop_schema: dict[str, Any]) -> dict[str, Any]:
    """
    仅做运行时“可空兼容”补丁，不改字段名、enum、分类体系。
    目标：对齐 system/defaults 中“无证据即 null / 可省略”。
    """
    schema = copy.deepcopy(prop_schema)

    if "enum" in schema:
        enum_values = list(schema["enum"])
        if None not in enum_values:
            enum_values.append(None)
        schema["enum"] = enum_values
        return schema

    if "type" in schema:
        typ = schema["type"]
        if isinstance(typ, str):
            if typ != "null":
                schema["type"] = [typ, "null"]
        elif isinstance(typ, list):
            if "null" not in typ:
                schema["type"] = [*typ, "null"]
        return schema

    return {"anyOf": [schema, {"type": "null"}]}


def _patch_then_branch_for_nullable_subtype(branch: Any) -> Any:
    if not isinstance(branch, dict):
        return branch
    patched = copy.deepcopy(branch)
    props = patched.get("properties")
    if isinstance(props, dict):
        subtype_schema = props.get("文档子类型")
        if isinstance(subtype_schema, dict):
            props["文档子类型"] = _property_accepts_null(subtype_schema)
    return patched


@lru_cache(maxsize=1)
def get_runtime_result_schema() -> dict[str, Any]:
    """
    基于用户 JSON 中的 properties.result 子 schema 生成"运行时消歧版 schema"：
    - 保留字段、enum、allOf、分类逻辑
    - 对 result 内的字段及 then 分支中的文档子类型允许 null
    - 保留 required，仅在归一化阶段把缺失键补 null
    """
    config = load_contract_config()
    result_schema = config.get("properties", {}).get("result", {})
    schema = copy.deepcopy(result_schema)

    props = schema.get("properties", {})
    if isinstance(props, dict):
        for key, value in list(props.items()):
            if isinstance(value, dict):
                props[key] = _property_accepts_null(value)

    all_of = schema.get("allOf")
    if isinstance(all_of, list):
        patched_all_of = []
        for item in all_of:
            if isinstance(item, dict) and "then" in item:
                patched = copy.deepcopy(item)
                patched["then"] = _patch_then_branch_for_nullable_subtype(item.get("then"))
                patched_all_of.append(patched)
            else:
                patched_all_of.append(copy.deepcopy(item))
        schema["allOf"] = patched_all_of

    return schema


@lru_cache(maxsize=1)
def get_result_validator() -> Draft202012Validator:
    schema = get_runtime_result_schema()
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, format_checker=FORMAT_CHECKER)


@lru_cache(maxsize=1)
def get_schema_properties() -> dict[str, Any]:
    config = load_contract_config()
    result_schema = config.get("properties", {}).get("result", {})
    props = result_schema.get("properties", {})
    return props if isinstance(props, dict) else {}


@lru_cache(maxsize=1)
def get_required_fields() -> list[str]:
    config = load_contract_config()
    result_schema = config.get("properties", {}).get("result", {})
    required = result_schema.get("required", [])
    return [x for x in required if isinstance(x, str)]


def strip_html(text: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</tr>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</td>", "\t", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("**", "")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _normalize_line_for_dedup(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def flatten_ocr_payload(payload: Any) -> str:
    if payload is None:
        return ""

    data = payload
    if isinstance(payload, str):
        stripped = payload.strip()
        if not stripped:
            return ""
        try:
            data = json.loads(stripped)
        except json.JSONDecodeError:
            return stripped

    if isinstance(data, dict):
        segments = data.get("segments")
        if isinstance(segments, list):
            parts: list[str] = []
            prev_text: str | None = None
            for seg in segments:
                if not isinstance(seg, dict):
                    continue
                if seg.get("type") not in {"paragraph", "table"}:
                    continue
                text = seg.get("text")
                if not text:
                    continue
                cleaned = strip_html(str(text))
                if not cleaned:
                    continue
                normalized = _normalize_line_for_dedup(cleaned)
                if prev_text == normalized:
                    continue
                parts.append(cleaned)
                prev_text = normalized
            return "\n".join(parts).strip()
        return json.dumps(data, ensure_ascii=False, indent=2)

    if isinstance(data, list):
        out: list[str] = []
        prev_text: str | None = None
        for item in data:
            if isinstance(item, str):
                cleaned = item.strip()
            elif isinstance(item, dict) and item.get("type") in {"paragraph", "table"}:
                text = item.get("text")
                cleaned = strip_html(str(text)) if text else ""
            else:
                cleaned = json.dumps(item, ensure_ascii=False)

            normalized = _normalize_line_for_dedup(cleaned) if cleaned else ""
            if normalized and normalized == prev_text:
                continue
            if normalized:
                out.append(cleaned)
                prev_text = normalized
        return "\n".join(out).strip()

    return str(data).strip()


def _build_contract_prompt_payload(config: dict[str, Any]) -> dict[str, Any]:
    return {
        "$schema": config.get("$schema"),
        "$id": config.get("$id"),
        "type": config.get("type"),
        "unevaluatedProperties": config.get("unevaluatedProperties"),
        "properties": config.get("properties", {}),
        "required": config.get("required", []),
        "defaults": config.get("defaults", {}),
        "audit_requirements": config.get("audit_requirements", {}),
        "list_policy": config.get("list_policy", {}),
        "x-classification-basis": config.get("x-classification-basis", {}),
        "x-classification-basis-source": config.get("x-classification-basis-source"),
    }


def build_instruction() -> str:
    config = load_contract_config()
    base_system_prompt = str(config.get("system", "")).strip()
    contract_block = json.dumps(_build_contract_prompt_payload(config), ensure_ascii=False, indent=2)

    instruction_parts = [
        base_system_prompt,
        (
            "【唯一契约来源】以下内容来自 meta_data.json，请严格按此执行，不要自行改写字段、枚举、required、allOf 分类约束或 audit 结构。"
            "若某字段无证据，可按 system/defaults 输出 null；不要擅自发明文档类型或子类型。"
        ),
        contract_block,
    ]
    return "\n\n".join(part for part in instruction_parts if part).strip()


def build_user_prompt(flattened_ocr_text: str) -> str:
    return f"""
请严格依据系统提示中的 meta_data.json 契约抽取元数据，并且只输出 JSON。

强制要求：
1. 顶层必须是 {{"result": ..., "audit": ...}}。
2. result 必须只使用 meta_data.json 中已有字段，不要新增字段。
3. 文档类型、文档子类型只能从 meta_data.json 的既有枚举/分类关系中选择，不要自定义。
4. 无证据字段可输出 null；不要输出空字符串占位，不要靠猜测补值。
5. 文档生效日期若原文只有明确日期没有时间，可归一为 YYYY-MM-DDT00:00:00。
6. audit 必须严格遵守 system 中对 audit.fields 的要求。
7. 不要输出解释，不要输出 Markdown 代码块，不要输出 <think>。
8. 不要使用系统当前日期、文件名时间戳或你自己的推断来补字段。

OCR 文本如下：
{flattened_ocr_text}
""".strip()


def _extract_json_text(raw_text: str) -> str:
    cleaned = raw_text.strip()
    if "</think>" in cleaned:
        cleaned = cleaned.split("</think>")[-1].strip()

    if cleaned.startswith("```json") and cleaned.endswith("```"):
        cleaned = cleaned[7:-3].strip()
    elif cleaned.startswith("```") and cleaned.endswith("```"):
        cleaned = cleaned[3:-3].strip()

    return cleaned


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ContractValidationError(message)


def _is_extracted_value(value: Any) -> bool:
    if value is None:
        return False
    if value == "":
        return False
    if value == []:
        return False
    if value == {}:
        return False
    return True


def _normalize_date_time_field(field_name: str, value: Any) -> Any:
    if field_name != "文档生效日期":
        return value
    if not isinstance(value, str):
        return value

    stripped = value.strip()
    if not stripped:
        return None

    # YYYY-MM-DD → YYYY-MM-DDT00:00:00+00:00
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", stripped):
        return f"{stripped}T00:00:00+00:00"
    # YYYY/MM/DD → YYYY-MM-DDT00:00:00+00:00
    if re.fullmatch(r"\d{4}/\d{2}/\d{2}", stripped):
        return f"{stripped.replace('/', '-')}T00:00:00+00:00"
    # 已有 datetime 但缺少时区后缀 → 追加 +00:00（RFC 3339 要求）
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", stripped):
        return f"{stripped}+00:00"
    return stripped


def _normalize_scalar_by_schema(field_name: str, value: Any, original_schema: dict[str, Any]) -> Any:
    if value is None:
        return None

    if isinstance(value, str):
        stripped = value.strip()
        if stripped == "":
            return None
        value = stripped

    normalized = _normalize_date_time_field(field_name, value)
    schema_type = original_schema.get("type")
    schema_enum = original_schema.get("enum")

    if normalized is None:
        return None

    if isinstance(schema_enum, list):
        return normalized

    if schema_type == "integer" and isinstance(normalized, str):
        if re.fullmatch(r"\d+", normalized):
            return int(normalized)

    return normalized


def normalize_result_for_contract(result: Any) -> dict[str, Any]:
    _require(isinstance(result, dict), "result 必须是 object")

    schema_properties = get_schema_properties()
    normalized: dict[str, Any] = {}

    for field_name, field_schema in schema_properties.items():
        raw_value = result.get(field_name, None)

        if field_name == "唯一标识符":
            if raw_value in (None, "", []):
                normalized[field_name] = None
            elif isinstance(raw_value, list):
                items = []
                for item in raw_value:
                    if not isinstance(item, dict):
                        items.append(item)
                        continue
                    normalized_item = {}
                    for k, v in item.items():
                        if isinstance(v, str):
                            v = v.strip() or None
                        normalized_item[k] = v
                    items.append(normalized_item)
                normalized[field_name] = items
            else:
                normalized[field_name] = raw_value
            continue

        if isinstance(field_schema, dict):
            normalized[field_name] = _normalize_scalar_by_schema(field_name, raw_value, field_schema)
        else:
            normalized[field_name] = raw_value

    return normalized


def _validate_scalar_audit_entry(field_name: str, entry: Any) -> None:
    _require(isinstance(entry, dict), f"audit.fields.{field_name} 必须是 object")
    required_keys = {"source_section", "source_label", "raw", "normalized"}
    missing = required_keys - set(entry.keys())
    _require(not missing, f"audit.fields.{field_name} 缺少字段: {sorted(missing)}")


def _validate_list_audit_entry(field_name: str, entry: Any, result_value: Any) -> None:
    _require(isinstance(entry, dict), f"audit.fields.{field_name} 必须是 object")
    required_keys = {"count", "items", "items_details"}
    missing = required_keys - set(entry.keys())
    _require(not missing, f"audit.fields.{field_name} 缺少字段: {sorted(missing)}")
    _require(isinstance(entry["count"], int), f"audit.fields.{field_name}.count 必须是整数")
    _require(isinstance(entry["items"], list), f"audit.fields.{field_name}.items 必须是数组")
    _require(isinstance(entry["items_details"], list), f"audit.fields.{field_name}.items_details 必须是数组")

    if isinstance(result_value, list):
        _require(entry["count"] == len(result_value), f"audit.fields.{field_name}.count 与 result.{field_name} 数量不一致")


def validate_envelope_against_contract(data: Any) -> dict[str, Any]:
    _require(isinstance(data, dict), "模型输出必须是 JSON object")
    _require(set(data.keys()) == {"result", "audit"}, "顶层必须且只能包含 result 和 audit")

    raw_result = data.get("result")
    audit = data.get("audit")

    _require(isinstance(raw_result, dict), "result 必须是 object")
    _require(isinstance(audit, dict), "audit 必须是 object")
    _require(isinstance(audit.get("fields"), dict), "audit.fields 必须是 object")

    result = normalize_result_for_contract(raw_result)

    validator = get_result_validator()
    errors = sorted(validator.iter_errors(result), key=lambda e: list(e.absolute_path))
    if errors:
        err = errors[0]
        path = ".".join(str(x) for x in err.absolute_path) or "<root>"
        raise ContractValidationError(f"result 不符合 meta_data.json：{path}: {err.message}")

    fields = audit["fields"]
    schema_properties = get_schema_properties()

    for field_name in schema_properties.keys():
        value = result.get(field_name)
        if not _is_extracted_value(value):
            continue

        _require(field_name in fields, f"已提取字段 {field_name} 缺少 audit.fields.{field_name}")
        entry = fields[field_name]

        if field_name == "唯一标识符":
            _validate_list_audit_entry(field_name, entry, value)
        else:
            _validate_scalar_audit_entry(field_name, entry)

    if result.get("文档生效日期") is not None:
        date_entry = fields.get("文档生效日期")
        _require(date_entry is not None, "result.文档生效日期 有值时，audit.fields.文档生效日期 不能为空")
        _validate_scalar_audit_entry("文档生效日期", date_entry)
        raw_value = date_entry.get("raw")
        _require(
            isinstance(raw_value, str) and raw_value.strip() != "",
            "audit.fields.文档生效日期.raw 为空时，result.文档生效日期 不允许有值",
        )

    normalized_data = {"result": result, "audit": audit}
    return normalized_data


@retry(
    stop=stop_after_attempt(10),
    wait=wait_exponential(multiplier=2, min=5, max=120),
    reraise=True
)
async def extract_with_llm(flattened_ocr_text: str) -> dict[str, Any]:
    api_key = os.getenv("OPENAI_API_KEY")
    base_url = os.getenv("OPENAI_API_BASE_URL")
    model = os.getenv("OPENAI_MODEL", "MiniMax-M2.7")

    if not api_key:
        raise RuntimeError("缺少环境配置 OPENAI_API_KEY")

    client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    system_instruction = build_instruction()
    user_prompt = build_user_prompt(flattened_ocr_text)

    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0,
    )

    payload = response.choices[0].message.content
    if payload is None:
        raise RuntimeError("大语言模型未返回任何抽取结果")

    cleaned = _extract_json_text(payload)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"解析 JSON 结果失败: {exc}; 原始内容: {cleaned}") from exc

    validated = validate_envelope_against_contract(data)
    return validated


def load_document(document_id: str) -> dict[str, Any]:
    with get_db_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            select id, object_key, status, raw_text, metadata
            from documents
            where id = ?
            """,
            (document_id,),
        )
        row = cur.fetchone()
        if not row:
            raise ValueError(f"documents 表中不存在 id={document_id} 的记录")
        record = dict(row)
        if isinstance(record.get("metadata"), str):
            try:
                record["metadata"] = json.loads(record["metadata"])
            except Exception:
                record["metadata"] = {}
        return record


def mark_metadata_running(document_id: str) -> None:
    with get_db_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            update documents
            set meta_status = 'running',
                meta_started_at = datetime('now'),
                meta_error_message = null,
                updated_at = datetime('now')
            where id = ?
            """,
            (document_id,),
        )
        conn.commit()


def save_metadata_success(document_id: str, envelope: dict[str, Any]) -> None:
    with get_db_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            update documents
            set meta_status = 'completed',
                metadata = ?,
                meta_completed_at = datetime('now'),
                meta_error_message = null,
                updated_at = datetime('now')
            where id = ?
            """,
            (json.dumps(envelope, ensure_ascii=False), document_id),
        )
        conn.commit()


def save_metadata_failure(document_id: str, error_message: str) -> None:
    with get_db_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            update documents
            set meta_status = 'failed',
                meta_completed_at = datetime('now'),
                meta_error_message = ?,
                updated_at = datetime('now')
            where id = ?
            """,
            (error_message[:4000], document_id),
        )
        conn.commit()


def call_llm_extractor(flattened_ocr_text: str) -> dict[str, Any]:
    return asyncio.run(extract_with_llm(flattened_ocr_text))


def extract_document_metadata_flow(document_id: str, stdout_only: bool = False) -> dict[str, Any]:
    doc = load_document(document_id)
    _logger.info("Loaded document id=%s status=%s", doc["id"], doc.get("status"))

    raw_payload = doc.get("raw_text")
    if not raw_payload and isinstance(doc.get("metadata"), dict):
        raw_payload = doc["metadata"].get("ocr_payload")

    flattened = flatten_ocr_payload(raw_payload)
    if not flattened:
        if stdout_only:
            raise ValueError("没有可用的 OCR 内容，无法抽取元数据")
        save_metadata_failure(document_id, "没有可用的 OCR 内容，无法抽取元数据")
        raise ValueError("没有可用的 OCR 内容，无法抽取元数据")

    _logger.info("Flattened OCR text length=%s", len(flattened))

    if not stdout_only:
        mark_metadata_running(document_id)

    try:
        result = call_llm_extractor(flattened)
        if stdout_only:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            save_metadata_success(document_id, result)
        return result
    except Exception as exc:
        if not stdout_only:
            save_metadata_failure(document_id, str(exc))
        raise


def run_local_from_json(ocr_json_path: str) -> None:
    raw = Path(ocr_json_path).read_text(encoding="utf-8")
    flattened = flatten_ocr_payload(raw)
    if not flattened:
        raise ValueError("OCR JSON 中没有可用文本")
    result = asyncio.run(extract_with_llm(flattened))
    print(json.dumps(result, indent=2, ensure_ascii=False))


def main() -> int:
    parser = argparse.ArgumentParser(description="OpenAI + Prefect 文档元数据抽取脚本（严格对齐 meta_data.json + 运行时消歧）")
    parser.add_argument("--document-id", help="documents.id，走数据库模式")
    parser.add_argument("--ocr-json", help="本地 OCR JSON 文件路径，直接抽取并输出到 stdout")
    args = parser.parse_args()

    if not os.getenv("OPENAI_API_KEY"):
        print("缺少 OPENAI_API_KEY", file=sys.stderr)
        return 2

    try:
        load_contract_config()
        get_runtime_result_schema()
        get_result_validator()
    except Exception as exc:
        print(f"meta_data.json 校验失败: {exc}", file=sys.stderr)
        return 2

    if args.ocr_json:
        run_local_from_json(args.ocr_json)
        return 0

    if args.document_id:
        result = extract_document_metadata_flow(document_id=args.document_id, stdout_only=False)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
