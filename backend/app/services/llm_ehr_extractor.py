from __future__ import annotations

import json
import re
from dataclasses import asdict
from datetime import datetime
from typing import Any, NotRequired, TypedDict

import httpx

from app.models import Document
from app.services.evidence_location_resolver import build_ocr_evidence_units
from app.services.schema_field_planner import SchemaField
from core.config import config


class LlmExtractionError(RuntimeError):
    pass


class EhrExtractionState(TypedDict):
    text: str
    fields: list[SchemaField]
    document_id: str | None
    document_meta: dict[str, Any]
    ocr_evidence_units: NotRequired[list[dict[str, Any]]]
    field_specs: NotRequired[list[dict[str, Any]]]
    system_prompt: NotRequired[str]
    user_prompt: NotRequired[str]
    raw_output: NotRequired[dict[str, Any]]
    raw_content: NotRequired[str]
    parse_error: NotRequired[str]
    fields_output: NotRequired[list[dict[str, Any]]]
    errors: NotRequired[list[str]]
    attempt: NotRequired[int]
    max_attempts: NotRequired[int]
    validation_errors: NotRequired[list[str]]
    validation_warnings: NotRequired[list[str]]
    validation_log: NotRequired[list[dict[str, Any]]]
    repair_prompt: NotRequired[str]
    validation_status: NotRequired[str]


VALUE_SLOTS = {
    "text": "value_text",
    "number": "value_number",
    "date": "value_date",
    "datetime": "value_datetime",
    "json": "value_json",
}


class LlmEhrExtractor:
    """LangGraph-based EHR extractor that normalizes LLM output to current field event format."""

    def extract(
        self,
        *,
        text: str,
        fields: list[SchemaField],
        document_id: str | None = None,
        document: Document | None = None,
    ) -> dict[str, Any]:
        if not config.OPENAI_API_KEY:
            raise LlmExtractionError("Missing OPENAI_API_KEY for EHR extraction")
        graph = self._build_graph()
        state: EhrExtractionState = {
            "text": text,
            "fields": fields,
            "document_id": document_id,
            "document_meta": self._document_meta(document),
            "ocr_evidence_units": build_ocr_evidence_units(document),
            "attempt": 0,
            "max_attempts": 3,
            "validation_log": [],
        }
        result = graph.invoke(state)
        validation_status = result.get("validation_status") or "invalid"
        if validation_status not in {"valid", "valid_empty"}:
            errors = result.get("validation_errors") or ["EHR LLM output validation failed"]
            raise LlmExtractionError("; ".join(errors))
        return {
            "extractor": "LlmEhrExtractor",
            "document_id": document_id,
            "raw_output": result.get("raw_output"),
            "fields": result.get("fields_output") or [],
            "errors": result.get("errors") or [],
            "validation_status": validation_status,
            "validation_log": result.get("validation_log") or [],
            "validation_warnings": result.get("validation_warnings") or [],
            "attempt_count": result.get("attempt") or 0,
        }

    def _build_graph(self):
        try:
            from langgraph.graph import END, START, StateGraph
        except Exception as exc:  # pragma: no cover - dependency guard
            raise LlmExtractionError("langgraph is not installed. Install backend dependencies first.") from exc

        builder = StateGraph(EhrExtractionState)
        builder.add_node("prepare", self._node_prepare)
        builder.add_node("call_llm", self._node_call_llm)
        builder.add_node("validate", self._node_validate)
        builder.add_node("normalize", self._node_normalize)
        builder.add_node("resolve_merge", self._node_resolve_merge)
        builder.add_edge(START, "prepare")
        builder.add_edge("prepare", "call_llm")
        builder.add_edge("call_llm", "validate")
        builder.add_conditional_edges(
            "validate",
            self._route_after_validate,
            {"retry": "call_llm", "normalize": "normalize"},
        )
        builder.add_edge("normalize", "resolve_merge")
        builder.add_edge("resolve_merge", END)
        return builder.compile()

    def _node_prepare(self, state: EhrExtractionState) -> dict[str, Any]:
        field_specs = [self._field_spec(field) for field in state["fields"]]
        return {
            "field_specs": field_specs,
            "system_prompt": self._build_system_prompt(field_specs),
            "user_prompt": self._build_user_prompt(state=state),
        }

    def _node_call_llm(self, state: EhrExtractionState) -> dict[str, Any]:
        base_url = (config.OPENAI_API_BASE_URL or "https://api.openai.com/v1").rstrip("/")
        attempt = int(state.get("attempt") or 0) + 1
        prompt = state.get("repair_prompt") if attempt > 1 and state.get("repair_prompt") else state["user_prompt"]
        request_payload = {
            "model": config.OPENAI_MODEL,
            "messages": [
                {"role": "system", "content": state["system_prompt"]},
                {"role": "user", "content": prompt},
            ],
            "temperature": getattr(config, "EXTRACTION_LLM_TEMPERATURE", config.METADATA_LLM_TEMPERATURE),
            "response_format": {"type": "json_object"},
        }
        headers = {
            "Authorization": f"Bearer {config.OPENAI_API_KEY}",
            "Content-Type": "application/json",
        }
        timeout = getattr(config, "EXTRACTION_LLM_TIMEOUT_SECONDS", config.METADATA_LLM_TIMEOUT_SECONDS)
        with httpx.Client(timeout=timeout) as client:
            response = client.post(f"{base_url}/chat/completions", headers=headers, json=request_payload)
            if response.status_code >= 400 and request_payload.get("response_format"):
                request_payload.pop("response_format", None)
                response = client.post(f"{base_url}/chat/completions", headers=headers, json=request_payload)
            response.raise_for_status()
            data = response.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content")
        if not content:
            content = ""
        try:
            raw_output = self._parse_json_content(content)
            return {"attempt": attempt, "raw_content": content, "raw_output": raw_output, "parse_error": None}
        except Exception as exc:
            return {"attempt": attempt, "raw_content": content, "raw_output": None, "parse_error": str(exc)}

    def _node_validate(self, state: EhrExtractionState) -> dict[str, Any]:
        errors, warnings, status_hint = self._validate_raw_output(
            state.get("raw_output"),
            state.get("field_specs") or [],
            text=state.get("text") or "",
            parse_error=state.get("parse_error"),
        )
        status = "invalid" if errors else (status_hint or "valid")
        attempt = int(state.get("attempt") or 0)
        validation_log = [*(state.get("validation_log") or [])]
        validation_log.append(
            {
                "attempt": attempt,
                "status": status,
                "errors": errors,
                "warnings": warnings,
                "created_at": datetime.utcnow().isoformat(),
            }
        )
        update: dict[str, Any] = {
            "validation_status": status,
            "validation_errors": errors,
            "validation_warnings": warnings,
            "validation_log": validation_log,
        }
        if errors and attempt < int(state.get("max_attempts") or 1):
            update["repair_prompt"] = self._build_repair_prompt(state=state, errors=errors)
        return update

    def _route_after_validate(self, state: EhrExtractionState) -> str:
        if state.get("validation_status") in {"valid", "valid_empty"}:
            return "normalize"
        if int(state.get("attempt") or 0) < int(state.get("max_attempts") or 1):
            return "retry"
        return "normalize"

    def _node_normalize(self, state: EhrExtractionState) -> dict[str, Any]:
        raw_output = state.get("raw_output") or {}
        if state.get("validation_status", "valid") not in {"valid", "valid_empty"}:
            return {"fields_output": []}
        field_specs = state.get("field_specs") or []
        by_path = {spec["field_path"]: spec for spec in field_specs}
        normalized: list[dict[str, Any]] = []

        raw_fields = raw_output.get("fields")
        if isinstance(raw_fields, list):
            for raw_field in raw_fields:
                item = self._normalize_field_item(raw_field, by_path, state.get("document_id"))
                if item:
                    normalized.append(item)

        raw_records = raw_output.get("records")
        if isinstance(raw_records, list):
            normalized.extend(self._normalize_records(raw_records, by_path, state.get("document_id")))

        deduped: list[dict[str, Any]] = []
        seen: set[tuple[str, str]] = set()
        for item in normalized:
            value = self._field_display_value(item)
            key = (item["field_path"], str(value))
            if key in seen:
                continue
            seen.add(key)
            deduped.append(item)
        return {"fields_output": deduped}

    def _node_resolve_merge(self, state: EhrExtractionState) -> dict[str, Any]:
        return {"fields_output": state.get("fields_output") or []}

    def _build_system_prompt(self, field_specs: list[dict[str, Any]]) -> str:
        return (
            "你是医疗 EHR/CRF 结构化抽取助手。只根据输入 OCR 原文抽取，不要编造。\n"
            "输出必须是 JSON object，优先使用 records 格式；也兼容 fields 格式。\n\n"
            "推荐输出格式：\n"
            "{\n"
            "  \"records\": [\n"
            "    {\n"
            "      \"form_path\": \"顶层分组.表单名\",\n"
            "      \"record\": {\"字段\": \"值\", \"嵌套对象\": {\"字段\": \"值\"}},\n"
            "      \"confidence\": 0.0-1.0,\n"
            "      \"evidences\": [{\"source_type\": \"line\", \"source_id\": \"p1-l1\", \"quote_text\": \"原文片段\", \"page_no\": 1}]\n"
            "    }\n"
            "  ]\n"
            "}\n\n"
            "兼容输出格式：\n"
            "{\"fields\": [{\"field_path\": \"完整点号路径\", \"value_type\": \"text\", \"value_text\": \"值\", \"confidence\": 0.9, \"quote_text\": \"证据\"}]}\n\n"
            "严格规则：\n"
            "1. 不要输出 null、空字符串、未知、未见、无法判断。\n"
            "2. 日期统一 YYYY-MM-DD；datetime 统一 ISO 格式。\n"
            "3. 枚举字段必须从 options 中选择最接近项。\n"
            "4. evidence.quote_text 必须来自原文，不要改写；如 OCR 证据单元中有对应内容，必须填写 source_type/source_id。\n"
            "5. 不要自行决定数据库是否覆盖 current；只输出候选抽取结果。\n"
            "6. 对可重复记录/表格，records.record 中可以输出数组，但不要输出 _1/_2 展示名。\n"
            "7. field_path 如需使用数组下标，必须是 0 开始的数字路径。\n\n"
            f"可抽取字段清单：\n{json.dumps(field_specs[:180], ensure_ascii=False, indent=2)}"
        )

    def _build_user_prompt(self, *, state: EhrExtractionState) -> str:
        text = self._trim_text(state["text"])
        evidence_units = state.get("ocr_evidence_units") or []
        evidence_section = ""
        if evidence_units:
            evidence_section = (
                "\n\nOCR 证据单元（用于 evidence.source_id 引用；不要改写 source_id）：\n"
                f"{json.dumps(evidence_units, ensure_ascii=False)}"
            )
        return (
            "请从下面单份医疗文档 OCR 文本中抽取字段。\n\n"
            f"document_id: {state.get('document_id')}\n"
            f"document_meta: {json.dumps(state.get('document_meta') or {}, ensure_ascii=False)}\n\n"
            f"OCR 文本：\n{text}"
            f"{evidence_section}"
        )

    def _field_spec(self, field: SchemaField) -> dict[str, Any]:
        return {
            "field_key": field.field_key,
            "field_path": field.field_path,
            "field_title": field.field_title,
            "value_type": field.value_type,
            "record_form_key": field.record_form_key,
            "options": field.options,
            "prompt": field.extraction_prompt,
        }

    def _normalize_field_item(
        self,
        raw_field: Any,
        by_path: dict[str, dict[str, Any]],
        document_id: str | None,
    ) -> dict[str, Any] | None:
        if not isinstance(raw_field, dict):
            return None
        field_path = str(raw_field.get("field_path") or "").strip().strip("/").replace("/", ".")
        if not field_path:
            return None
        spec = by_path.get(field_path) or self._spec_for_indexed_path(field_path, by_path)
        if spec is None:
            return None
        value_type = str(raw_field.get("value_type") or spec.get("value_type") or "text")
        value = self._extract_raw_value(raw_field, value_type)
        value = self._normalize_enum_value(value, spec.get("options"))
        if self._is_empty(value):
            return None
        return self._build_field_output(
            field_path=field_path,
            spec=spec,
            value=value,
            value_type=value_type,
            confidence=raw_field.get("confidence"),
            quote_text=raw_field.get("quote_text") or self._first_quote(raw_field.get("evidences")),
            evidences=self._normalize_evidences(raw_field.get("evidences")),
            evidence_type=raw_field.get("evidence_type") or "llm_extract",
        )

    def _normalize_records(
        self,
        raw_records: list[Any],
        by_path: dict[str, dict[str, Any]],
        document_id: str | None,
    ) -> list[dict[str, Any]]:
        output: list[dict[str, Any]] = []
        for raw_record in raw_records:
            if not isinstance(raw_record, dict):
                continue
            form_path = str(raw_record.get("form_path") or "").strip().strip("/").replace("/", ".")
            record = raw_record.get("record")
            if not form_path or self._is_empty(record):
                continue
            confidence = raw_record.get("confidence")
            quote_text = self._first_quote(raw_record.get("evidences"))
            evidences = self._normalize_evidences(raw_record.get("evidences"))
            if isinstance(record, list):
                for index, item in enumerate(record):
                    output.extend(self._flatten_record_node(f"{form_path}.{index}", item, by_path, confidence, quote_text, evidences))
            else:
                output.extend(self._flatten_record_node(form_path, record, by_path, confidence, quote_text, evidences))
        return output

    def _flatten_record_node(
        self,
        prefix: str,
        node: Any,
        by_path: dict[str, dict[str, Any]],
        confidence: Any,
        quote_text: str | None,
        evidences: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if isinstance(node, dict):
            output: list[dict[str, Any]] = []
            for key, value in node.items():
                output.extend(self._flatten_record_node(f"{prefix}.{key}", value, by_path, confidence, quote_text, evidences))
            return output
        if isinstance(node, list):
            output = []
            for index, item in enumerate(node):
                output.extend(self._flatten_record_node(f"{prefix}.{index}", item, by_path, confidence, quote_text, evidences))
            return output
        if self._is_empty(node):
            return []
        spec = by_path.get(prefix) or self._spec_for_indexed_path(prefix, by_path)
        if spec is None:
            return []
        return [
            self._build_field_output(
                field_path=prefix,
                spec=spec,
                value=node,
                value_type=str(spec.get("value_type") or "text"),
                confidence=confidence,
                quote_text=quote_text,
                evidences=evidences,
                evidence_type="llm_extract",
            )
        ]

    def _spec_for_indexed_path(self, field_path: str, by_path: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
        parts = field_path.split(".")
        without_indexes = ".".join(part for part in parts if not part.isdigit())
        return by_path.get(without_indexes)

    def _canonical_path(self, field_path: str) -> str:
        return ".".join(part for part in field_path.split(".") if not part.isdigit())

    def _build_field_output(
        self,
        *,
        field_path: str,
        spec: dict[str, Any],
        value: Any,
        value_type: str,
        confidence: Any,
        quote_text: str | None,
        evidence_type: str,
        evidences: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        normalized_value_type = value_type if value_type in VALUE_SLOTS else "text"
        slot = VALUE_SLOTS[normalized_value_type]
        value = self._coerce_value(value, normalized_value_type)
        value = self._normalize_enum_value(value, spec.get("options"))
        item = {
            "field_key": spec.get("field_key") or field_path.split(".")[-1],
            "field_path": field_path,
            "field_title": spec.get("field_title"),
            "record_form_key": spec.get("record_form_key"),
            "value_type": normalized_value_type,
            slot: value,
            "confidence": self._coerce_confidence(confidence),
            "quote_text": quote_text,
            "evidences": evidences,
            "evidence_type": evidence_type,
        }
        return {key: value for key, value in item.items() if value is not None}

    def _extract_raw_value(self, raw_field: dict[str, Any], value_type: str) -> Any:
        for key in (VALUE_SLOTS.get(value_type), "value", "value_text", "value_number", "value_date", "value_datetime", "value_json"):
            if key and key in raw_field and not self._is_empty(raw_field[key]):
                return raw_field[key]
        return None

    def _field_display_value(self, item: dict[str, Any]) -> Any:
        for slot in VALUE_SLOTS.values():
            if slot in item:
                return item[slot]
        return None

    def _coerce_value(self, value: Any, value_type: str) -> Any:
        if value_type == "number":
            if isinstance(value, (int, float)):
                return value
            match = re.search(r"-?\d+(?:\.\d+)?", str(value))
            return float(match.group(0)) if match else None
        if value_type in {"text", "date", "datetime"}:
            return str(value).strip()
        return value

    def _normalize_enum_value(self, value: Any, options: Any) -> Any:
        if self._is_empty(value) or not isinstance(options, list) or not options:
            return value
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

    def _parse_json_content(self, content: str) -> dict[str, Any]:
        cleaned = content.strip()
        if not cleaned:
            raise LlmExtractionError("EHR LLM returned empty content")
        if "</think>" in cleaned:
            cleaned = cleaned.split("</think>")[-1].strip()
        fence_match = re.search(r"```(?:json)?\s*(.*?)\s*```", cleaned, flags=re.DOTALL | re.IGNORECASE)
        if fence_match:
            cleaned = fence_match.group(1).strip()
        parsed = json.loads(cleaned)
        if not isinstance(parsed, dict):
            raise LlmExtractionError("EHR LLM output must be a JSON object")
        return parsed

    def _validate_raw_output(
        self,
        raw_output: Any,
        field_specs: list[dict[str, Any]],
        *,
        text: str = "",
        parse_error: str | None = None,
    ) -> tuple[list[str], list[str], str | None]:
        errors: list[str] = []
        warnings: list[str] = []
        if parse_error:
            errors.append(f"JSON parse error: {parse_error}")
            return errors, warnings, None
        if not isinstance(raw_output, dict):
            return ["Output must be a JSON object"], warnings, None

        raw_fields = raw_output.get("fields")
        raw_records = raw_output.get("records")
        has_fields = isinstance(raw_fields, list) and len(raw_fields) > 0
        has_records = isinstance(raw_records, list) and len(raw_records) > 0
        if not has_fields and not has_records:
            warnings.append("No extractable records[] or fields[] returned")
            return errors, warnings, "valid_empty"

        by_path = {spec["field_path"]: spec for spec in field_specs}
        form_keys = {spec.get("record_form_key") for spec in field_specs if spec.get("record_form_key")}

        if isinstance(raw_fields, list):
            for index, raw_field in enumerate(raw_fields):
                if not isinstance(raw_field, dict):
                    errors.append(f"fields[{index}] must be an object")
                    continue
                field_path = str(raw_field.get("field_path") or "").strip().strip("/").replace("/", ".")
                spec = by_path.get(field_path) or self._spec_for_indexed_path(field_path, by_path)
                if not field_path or spec is None:
                    errors.append(f"fields[{index}].field_path is not in schema: {field_path or '<missing>'}")
                    continue
                errors.extend(self._validate_value_payload(raw_field, spec, f"fields[{index}]"))
                warnings.extend(self._validate_evidence(raw_field, text, f"fields[{index}]"))

        if isinstance(raw_records, list):
            for index, raw_record in enumerate(raw_records):
                if not isinstance(raw_record, dict):
                    errors.append(f"records[{index}] must be an object")
                    continue
                form_path = str(raw_record.get("form_path") or "").strip().strip("/").replace("/", ".")
                if not form_path or form_path not in form_keys:
                    errors.append(f"records[{index}].form_path is not a schema form: {form_path or '<missing>'}")
                if self._is_empty(raw_record.get("record")):
                    errors.append(f"records[{index}].record is required")
                warnings.extend(self._validate_evidence(raw_record, text, f"records[{index}]"))
                if form_path and not self._is_empty(raw_record.get("record")):
                    for path, value in self._iter_record_leaf_values(form_path, raw_record.get("record")):
                        spec = by_path.get(path) or self._spec_for_indexed_path(path, by_path)
                        if spec is None:
                            errors.append(f"records[{index}] contains field not in schema: {path}")
                            continue
                        errors.extend(self._validate_scalar_value(value, str(spec.get("value_type") or "text"), spec, path))
        return errors, warnings, None

    def _validate_value_payload(self, raw_field: dict[str, Any], spec: dict[str, Any], label: str) -> list[str]:
        errors: list[str] = []
        value_type = str(raw_field.get("value_type") or spec.get("value_type") or "text")
        normalized_value_type = value_type if value_type in VALUE_SLOTS else "text"
        present_slots = [slot for slot in VALUE_SLOTS.values() if not self._is_empty(raw_field.get(slot))]
        if len(present_slots) > 1:
            errors.append(f"{label} must write only one value slot")
        expected_slot = VALUE_SLOTS[normalized_value_type]
        if not self._is_empty(raw_field.get("value")):
            errors.append(f"{label} must use {expected_slot}, not generic value")
        if present_slots and expected_slot not in present_slots:
            errors.append(f"{label} value_type={normalized_value_type} must use {expected_slot}")
        value = self._extract_raw_value(raw_field, normalized_value_type)
        if self._is_empty(value):
            errors.append(f"{label} value is required")
            return errors
        return errors + self._validate_scalar_value(value, normalized_value_type, spec, label)

    def _validate_scalar_value(self, value: Any, value_type: str, spec: dict[str, Any], label: str) -> list[str]:
        errors: list[str] = []
        normalized_value = self._normalize_enum_value(value, spec.get("options"))
        options = spec.get("options")
        if isinstance(options, list) and options and str(normalized_value) not in {str(option) for option in options}:
            errors.append(f"{label} enum value must be one of {options}: {value}")
        if value_type == "date" and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(value).strip()):
            errors.append(f"{label} date must be YYYY-MM-DD: {value}")
        if value_type == "datetime":
            try:
                datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
            except ValueError:
                errors.append(f"{label} datetime must be ISO format: {value}")
        return errors

    def _validate_evidence(self, item: dict[str, Any], text: str, label: str) -> list[str]:
        quotes = []
        if item.get("quote_text"):
            quotes.append(str(item["quote_text"]))
        evidences = item.get("evidences")
        if isinstance(evidences, list):
            quotes.extend(str(evidence.get("quote_text")) for evidence in evidences if isinstance(evidence, dict) and evidence.get("quote_text"))
        return [f"{label} quote_text must be an OCR substring: {quote}" for quote in quotes if quote and quote not in text]

    def _iter_record_leaf_values(self, prefix: str, node: Any):
        if isinstance(node, dict):
            for key, value in node.items():
                yield from self._iter_record_leaf_values(f"{prefix}.{key}", value)
            return
        if isinstance(node, list):
            for index, value in enumerate(node):
                yield from self._iter_record_leaf_values(f"{prefix}.{index}", value)
            return
        if not self._is_empty(node):
            yield prefix, node

    def _build_repair_prompt(self, *, state: EhrExtractionState, errors: list[str]) -> str:
        evidence_units = state.get("ocr_evidence_units") or []
        evidence_section = ""
        if evidence_units:
            evidence_section = f"\nOCR 证据单元：{json.dumps(evidence_units, ensure_ascii=False)}\n"
        return (
            "上一次抽取输出未通过校验。请只修复 JSON 输出，不要重新发挥或添加原文没有的信息。\n"
            "必须输出严格 JSON object，禁止 Markdown fence，保留原抽取含义。\n"
            f"校验错误：{json.dumps(errors, ensure_ascii=False)}\n"
            f"上一次原始输出：{state.get('raw_content') or json.dumps(state.get('raw_output'), ensure_ascii=False)}\n"
            f"可抽取字段清单：{json.dumps((state.get('field_specs') or [])[:180], ensure_ascii=False)}\n"
            f"{evidence_section}"
            f"OCR 文本：\n{self._trim_text(state.get('text') or '')}"
        )

    def _trim_text(self, text: str) -> str:
        if len(text) <= 18000:
            return text
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        keywords = ("姓名", "性别", "诊断", "入院", "出院", "病理", "检查", "治疗", "用药", "报告")
        picked = [line for line in lines if any(keyword in line for keyword in keywords)]
        return "\n".join([text[:9000], *picked[:300], text[-4000:]])[:24000]

    def _document_meta(self, document: Document | None) -> dict[str, Any]:
        if document is None:
            return {}
        return {
            "filename": document.original_filename,
            "doc_type": document.doc_type or document.document_type,
            "doc_subtype": document.doc_subtype or document.document_sub_type,
            "doc_title": document.doc_title,
            "effective_at": document.effective_at.isoformat() if document.effective_at else None,
        }

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
                for key in ("quote_text", "page_no", "bbox_json", "start_offset", "end_offset", "source_type", "source_id", "line_id", "block_id", "cell_key")
                if evidence.get(key) is not None
            }
            if normalized:
                output.append(normalized)
        return output

    def _is_empty(self, value: Any) -> bool:
        return value is None or value == "" or value == [] or value == {}
