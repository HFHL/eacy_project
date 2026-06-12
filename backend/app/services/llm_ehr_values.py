from __future__ import annotations

from typing import Any


class LlmEhrValueMixin:
    def _normalize_enum_value(self, value: Any, options: Any) -> Any:
        if self._is_empty(value) or not isinstance(options, list) or not options:
            return value
        if isinstance(value, list):
            return [self._normalize_enum_value(item, options) for item in value if not self._is_empty(item)]
        text = str(value).strip()
        option_texts = [str(option).strip() for option in options]
        if text in option_texts:
            return text
        synonyms = {"男性": "男", "男士": "男", "女性": "女", "女士": "女"}
        if synonyms.get(text) in option_texts:
            return synonyms[text]
        for option in option_texts:
            if option and (option in text or text in option):
                return option
        return value

    def _coerce_confidence(self, value: Any) -> float | None:
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        return max(0.0, min(1.0, number))

    def _first_quote(self, evidences: Any) -> str | None:
        if not isinstance(evidences, list):
            return None
        for evidence in evidences:
            if isinstance(evidence, dict) and evidence.get("quote_text"):
                return str(evidence["quote_text"])
        return None

    def _normalize_evidences(self, evidences: Any) -> list[dict[str, Any]]:
        if not isinstance(evidences, list):
            return []
        output = []
        for evidence in evidences:
            if not isinstance(evidence, dict):
                continue
            normalized = {
                key: evidence.get(key)
                for key in (
                    "quote_text",
                    "page_no",
                    "bbox_json",
                    "start_offset",
                    "end_offset",
                    "source_type",
                    "source_id",
                    "line_id",
                    "block_id",
                    "cell_key",
                    "record_shared",
                )
                if evidence.get(key) is not None
            }
            if normalized:
                output.append(normalized)
        return output

    def _is_empty(self, value: Any) -> bool:
        return value is None or value == "" or value == [] or value == {}
