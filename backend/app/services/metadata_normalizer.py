import json
import re
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any


METADATA_SCHEMA_VERSION = "doc_metadata.v1"
SCHEMA_PATH = Path(__file__).resolve().parents[3] / "meta_data.json"


def _load_schema() -> dict[str, Any]:
    try:
        return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


@lru_cache(maxsize=1)
def get_result_schema() -> dict[str, Any]:
    schema = _load_schema().get("properties", {}).get("result", {})
    return schema if isinstance(schema, dict) else {}


@lru_cache(maxsize=1)
def get_schema_properties() -> dict[str, Any]:
    props = get_result_schema().get("properties", {})
    return props if isinstance(props, dict) else {}


@lru_cache(maxsize=1)
def get_required_result_keys() -> tuple[str, ...]:
    required = get_result_schema().get("required", [])
    if isinstance(required, list) and all(isinstance(item, str) for item in required):
        return tuple(required)
    return (
        "唯一标识符",
        "机构名称",
        "科室信息",
        "患者姓名",
        "患者性别",
        "患者年龄",
        "出生日期",
        "联系电话",
        "诊断",
        "文档类型",
        "文档子类型",
        "文档标题",
        "文档生效日期",
    )


@lru_cache(maxsize=1)
def get_document_type_enum() -> set[str]:
    enum_values = get_schema_properties().get("文档类型", {}).get("enum", [])
    return {value for value in enum_values if isinstance(value, str)}


@lru_cache(maxsize=1)
def get_identifier_type_enum() -> set[str]:
    identifier_schema = get_schema_properties().get("唯一标识符", {})
    enum_values = identifier_schema.get("items", {}).get("properties", {}).get("标识符类型", {}).get("enum", [])
    return {value for value in enum_values if isinstance(value, str)}


@lru_cache(maxsize=1)
def get_document_subtype_by_type() -> dict[str, set[str]]:
    subtype_by_type: dict[str, set[str]] = {}
    for branch in get_result_schema().get("allOf", []) or []:
        if not isinstance(branch, dict):
            continue
        document_type = branch.get("if", {}).get("properties", {}).get("文档类型", {}).get("const")
        subtype_enum = branch.get("then", {}).get("properties", {}).get("文档子类型", {}).get("enum", [])
        if isinstance(document_type, str) and isinstance(subtype_enum, list):
            subtype_by_type[document_type] = {value for value in subtype_enum if isinstance(value, str)}
    return subtype_by_type


def empty_metadata_result() -> dict[str, Any]:
    return {key: [] if key == "唯一标识符" else None for key in get_required_result_keys()}


class MetadataNormalizer:
    def normalize(self, agent_output: dict[str, Any] | str | None) -> dict[str, Any]:
        payload = self._parse_output(agent_output)
        raw_result = payload.get("result") if isinstance(payload, dict) else None
        result = empty_metadata_result()
        if isinstance(raw_result, dict):
            result.update({key: raw_result.get(key) for key in get_required_result_keys() if key in raw_result})

        result["唯一标识符"] = self._normalize_identifiers(result.get("唯一标识符"))
        for key in ("患者姓名", "机构名称", "科室信息", "联系电话", "诊断", "文档标题"):
            result[key] = self._normalize_string(result.get(key))
        result["患者性别"] = self._normalize_gender(result.get("患者性别"))
        result["患者年龄"] = self._normalize_age(result.get("患者年龄"))
        result["出生日期"] = self._normalize_date(result.get("出生日期"))
        result["文档类型"] = self._normalize_document_type(result.get("文档类型"), result.get("文档标题"))
        result["文档子类型"] = self._normalize_document_subtype(result.get("文档类型"), result.get("文档子类型"))
        result["文档生效日期"] = self._normalize_datetime(result.get("文档生效日期"))
        return result

    def to_document_update(self, result: dict[str, Any]) -> dict[str, Any]:
        return {
            "metadata_json": {
                "schema_version": METADATA_SCHEMA_VERSION,
                "result": result,
            },
            "doc_type": result.get("文档类型"),
            "doc_subtype": result.get("文档子类型"),
            "doc_title": result.get("文档标题"),
            "effective_at": self.parse_effective_at(result.get("文档生效日期")),
        }

    def parse_effective_at(self, value: Any) -> datetime | None:
        if not isinstance(value, str) or not value:
            return None
        normalized = value.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(normalized)
        except ValueError:
            return None

    def _parse_output(self, agent_output: dict[str, Any] | str | None) -> dict[str, Any]:
        if isinstance(agent_output, dict):
            return agent_output
        if not isinstance(agent_output, str):
            return {"result": empty_metadata_result()}

        content = agent_output.strip()
        if "</think>" in content:
            content = content.split("</think>")[-1].strip()
        fence_match = re.search(r"```(?:json)?\s*(.*?)\s*```", content, flags=re.DOTALL | re.IGNORECASE)
        if fence_match:
            content = fence_match.group(1).strip()
        return json.loads(content)

    def _normalize_string(self, value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    def _normalize_gender(self, value: Any) -> str | None:
        text = self._normalize_string(value)
        if text in {"男", "男性"}:
            return "男"
        if text in {"女", "女性"}:
            return "女"
        if text in {"不详", "未知"}:
            return "不详"
        return None

    def _normalize_age(self, value: Any) -> int | None:
        if value is None or value == "":
            return None
        match = re.search(r"\d+", str(value))
        if not match:
            return None
        age = int(match.group(0))
        return age if 0 <= age <= 130 else None

    def _normalize_date(self, value: Any) -> str | None:
        text = self._normalize_string(value)
        if not text:
            return None
        match = re.search(r"(\d{4})[年\-/\.](\d{1,2})[月\-/\.](\d{1,2})", text)
        if not match:
            return None
        year, month, day = match.groups()
        try:
            return datetime(int(year), int(month), int(day)).date().isoformat()
        except ValueError:
            return None

    def _normalize_datetime(self, value: Any) -> str | None:
        text = self._normalize_string(value)
        if not text:
            return None
        date_value = self._normalize_date(text)
        if date_value:
            return f"{date_value}T00:00:00"
        try:
            return datetime.fromisoformat(text.replace("Z", "+00:00")).isoformat()
        except ValueError:
            return None

    def _normalize_document_type(self, value: Any, title: Any = None) -> str | None:
        text = self._normalize_string(value)
        document_type_enum = get_document_type_enum()
        if text in document_type_enum:
            return text
        haystack = f"{text or ''} {title or ''}"
        keyword_map = [
            (("CT", "MRI", "超声", "X光", "影像"), "影像检查"),
            (("血常规", "尿常规", "生化", "检验", "化验"), "实验室检查"),
            (("病理",), "病理报告"),
            (("入院记录", "出院", "病程", "门诊病历", "病案首页"), "病历记录"),
            (("内镜", "胃镜", "肠镜"), "内镜检查"),
        ]
        for keywords, document_type in keyword_map:
            if document_type in document_type_enum and any(keyword in haystack for keyword in keywords):
                return document_type
        return None

    def _normalize_document_subtype(self, document_type: Any, value: Any) -> str | None:
        doc_type = self._normalize_string(document_type)
        subtype = self._normalize_string(value)
        if not doc_type or not subtype:
            return None
        allowed = get_document_subtype_by_type().get(doc_type)
        return subtype if allowed and subtype in allowed else None

    def _normalize_identifiers(self, value: Any) -> list[dict[str, str]]:
        if not isinstance(value, list):
            return []
        identifier_type_enum = get_identifier_type_enum() or {"其他"}
        identifiers: list[dict[str, str]] = []
        seen: set[tuple[str, str]] = set()
        for item in value:
            if not isinstance(item, dict):
                continue
            identifier_type = self._normalize_string(item.get("标识符类型")) or "其他"
            if identifier_type not in identifier_type_enum:
                identifier_type = "其他"
            identifier_no = self._normalize_string(item.get("标识符编号"))
            if not identifier_no:
                continue
            key = (identifier_type, identifier_no)
            if key in seen:
                continue
            seen.add(key)
            identifiers.append({"标识符类型": identifier_type, "标识符编号": identifier_no})
        return identifiers
