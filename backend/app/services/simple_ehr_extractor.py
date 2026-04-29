import re
from datetime import date
from typing import Any

from app.services.schema_field_planner import SchemaField


class SimpleEhrExtractor:
    def extract(self, *, text: str, fields: list[SchemaField], document_id: str | None = None) -> dict[str, Any]:
        extracted_fields: list[dict[str, Any]] = []
        for field in fields:
            value = self._extract_field_value(text=text, field=field)
            if value in (None, "", [], {}):
                continue
            extracted = {
                "field_key": field.field_key,
                "field_path": field.field_path,
                "field_title": field.field_title,
                "value_type": field.value_type,
                "confidence": 0.70,
                "quote_text": self._quote_for_value(text, value),
                "record_form_key": field.record_form_key,
            }
            if field.value_type == "number":
                extracted["value_number"] = value
            elif field.value_type == "date":
                extracted["value_date"] = value
            elif field.value_type == "datetime":
                extracted["value_datetime"] = value
            elif field.value_type == "json":
                extracted["value_json"] = value
            else:
                extracted["value_text"] = str(value)
            extracted_fields.append(extracted)
        return {"extractor": "SimpleEhrExtractor", "document_id": document_id, "fields": extracted_fields}

    def _extract_field_value(self, *, text: str, field: SchemaField) -> Any:
        if not text.strip():
            return None
        label_patterns = self._label_patterns(field.field_key)
        for pattern in label_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                value = self._normalize_value(match.group(1).strip(), field.value_type)
                if field.options:
                    return self._normalize_option(value, field.options)
                return value
        if field.options:
            for option in field.options:
                option_text = str(option).strip()
                if option_text and re.search(rf"{re.escape(field.field_key)}.{{0,20}}{re.escape(option_text)}", text):
                    return option_text
        if field.value_type == "date":
            match = re.search(r"(\d{4}[-/.年]\d{1,2}(?:[-/.月]\d{1,2}日?)?)", text)
            if match:
                return self._normalize_date(match.group(1))
        return None

    def _label_patterns(self, label: str) -> list[str]:
        escaped = re.escape(label)
        return [
            rf"{escaped}\s*[:：]\s*([^\n；;，,]+)",
            rf"{escaped}\s+([^\n；;，,]+)",
        ]

    def _normalize_value(self, value: str, value_type: str) -> Any:
        value = value.strip().strip("：:，,；;。")
        if value_type == "number":
            match = re.search(r"-?\d+(?:\.\d+)?", value)
            return float(match.group(0)) if match else None
        if value_type == "date":
            return self._normalize_date(value)
        return value

    def _normalize_date(self, value: str) -> str | None:
        match = re.search(r"(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2})日?)?", value)
        if not match:
            return None
        year, month, day = match.groups()
        return date(int(year), int(month), int(day or 1))

    def _normalize_option(self, value: Any, options: list[Any]) -> str | None:
        value_text = str(value or "").strip()
        if not value_text:
            return None
        for option in options:
            option_text = str(option).strip()
            if option_text and option_text in value_text:
                return option_text
        return value_text

    def _quote_for_value(self, text: str, value: Any) -> str | None:
        value_text = str(value)
        index = text.find(value_text)
        if index < 0:
            return value_text
        start = max(0, index - 40)
        end = min(len(text), index + len(value_text) + 40)
        return text[start:end]
