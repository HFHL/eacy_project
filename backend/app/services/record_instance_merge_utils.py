import json
import re
import unicodedata
from datetime import datetime
from typing import Any


def canonical_field_path(field_path: Any) -> str:
    parts = [part for part in str(field_path or "").replace("/", ".").split(".") if part and not part.isdigit()]
    return ".".join(parts)


def record_form_key_from_field_path(field_path: Any) -> str | None:
    parts = [part for part in str(field_path or "").replace("/", ".").split(".") if part and not part.isdigit()]
    if len(parts) >= 2:
        return f"{parts[0]}.{parts[1]}"
    return None


def local_repeat_index_for_field(*, field: dict[str, Any], record_form_key: str | None) -> int:
    raw_repeat_index = field.get("repeat_index")
    if raw_repeat_index is not None:
        try:
            return max(0, int(raw_repeat_index))
        except (TypeError, ValueError):
            pass

    parts = [part for part in str(field.get("field_path") or "").replace("/", ".").split(".") if part]
    form_parts = [part for part in str(record_form_key or "").split(".") if part]
    if form_parts and parts[: len(form_parts)] == form_parts:
        candidates = parts[len(form_parts):]
    else:
        candidates = parts[2:]
    for part in candidates:
        if part.isdigit():
            return int(part)
    return 0


def fields_by_label(fields: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    by_label: dict[str, dict[str, Any]] = {}
    for field in fields:
        labels = [
            field.get("field_title"),
            field.get("field_key"),
            canonical_field_path(field.get("field_path")).split(".")[-1],
        ]
        for label in labels:
            key = label_key(label)
            if key:
                by_label.setdefault(key, field)
    return by_label


def parse_merge_binding(value: str | None) -> dict[str, str]:
    parsed: dict[str, str] = {}
    for part in str(value or "").split(";"):
        if "=" not in part:
            continue
        key, raw = part.split("=", 1)
        key = key.strip()
        raw = raw.strip()
        if key and raw:
            parsed[key] = raw
    return parsed


def binding_names(value: str | None, *, separator: str = "+") -> list[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(separator) if part.strip()]


def field_value(field: dict[str, Any] | None) -> Any:
    if not isinstance(field, dict):
        return None
    for key in ("value_text", "value_number", "value_date", "value_datetime", "value_json", "normalized_text"):
        value = field.get(key)
        if value not in (None, "", [], {}):
            return value
    return None


def first_text(values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def label_key(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = text.replace("（", "(").replace("）", ")")
    return re.sub(r"[\s:：,，;；]", "", text)


def normalize_value(value: Any, granularity: str | None) -> str:
    if isinstance(value, (dict, list)):
        text = json.dumps(value, ensure_ascii=False, sort_keys=True)
    else:
        text = str(value or "").strip()
    text = unicodedata.normalize("NFKC", text)
    date_value = normalize_date_text(text)
    if date_value and granularity in {None, "", "day"}:
        return date_value
    text = normalize_chinese_ordinals(text)
    text = text.replace("第", "").replace("次", "")
    return re.sub(r"[\s:：,，;；、_\-]+", "", text).lower()


def normalize_date_text(text: str) -> str | None:
    match = re.search(r"(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2})日?)?", text)
    if match:
        year, month, day = match.groups()
        return f"{int(year):04d}-{int(month):02d}-{int(day or 1):02d}"
    for fmt in ("%Y%m%d", "%Y-%m-%d"):
        try:
            return datetime.strptime(text[:10], fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def normalize_chinese_ordinals(text: str) -> str:
    chinese_digits = {
        "零": 0,
        "〇": 0,
        "一": 1,
        "二": 2,
        "两": 2,
        "三": 3,
        "四": 4,
        "五": 5,
        "六": 6,
        "七": 7,
        "八": 8,
        "九": 9,
        "十": 10,
    }

    def repl(match: re.Match[str]) -> str:
        raw = match.group(0)
        if raw == "十":
            return "10"
        if raw.startswith("十"):
            return str(10 + chinese_digits.get(raw[-1], 0))
        if raw.endswith("十"):
            return str(chinese_digits.get(raw[0], 0) * 10)
        if "十" in raw:
            left, right = raw.split("十", 1)
            return str(chinese_digits.get(left, 1) * 10 + chinese_digits.get(right, 0))
        return str(chinese_digits.get(raw, raw))

    return re.sub(r"[零〇一二两三四五六七八九十]{1,3}", repl, text)
