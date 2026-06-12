from datetime import date, datetime
from typing import Any


VALUE_FIELDS = (
    "value_text",
    "value_number",
    "value_date",
    "value_datetime",
    "value_json",
    "unit",
)


def normalize_value_params(values: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(values)
    if "value_date" in normalized:
        normalized["value_date"] = coerce_date(normalized.get("value_date"))
    if "value_datetime" in normalized:
        normalized["value_datetime"] = coerce_datetime(normalized.get("value_datetime"))
    if "value_json" in normalized:
        normalized["value_json"] = coerce_json(normalized.get("value_json"))
    return normalized


def normalize_evidence_params(values: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(values)
    normalized["quote_text"] = coerce_text(normalized.get("quote_text"))
    normalized["row_key"] = coerce_text(normalized.get("row_key"))
    normalized["cell_key"] = coerce_text(normalized.get("cell_key"))
    normalized["page_no"] = coerce_int(normalized.get("page_no"))
    normalized["start_offset"] = coerce_int(normalized.get("start_offset"))
    normalized["end_offset"] = coerce_int(normalized.get("end_offset"))
    normalized["evidence_score"] = coerce_float(normalized.get("evidence_score"))
    return normalized


def coerce_date(value: Any) -> date | None:
    if value is None or value == "" or value == "null":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value).strip())


def coerce_datetime(value: Any) -> datetime | None:
    if value is None or value == "" or value == "null":
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).strip().replace("Z", "+00:00")
    parsed = datetime.fromisoformat(text)
    return parsed.replace(tzinfo=None) if parsed.tzinfo is not None else parsed


def coerce_json(value: Any) -> dict[str, Any] | list[Any] | None:
    if value is None or value == "" or value == "null":
        return None
    if isinstance(value, (dict, list)):
        return value
    return {"value": value}


def coerce_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def coerce_int(value: Any) -> int | None:
    if value in (None, "", "null"):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def coerce_float(value: Any) -> float | None:
    if value in (None, "", "null"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
