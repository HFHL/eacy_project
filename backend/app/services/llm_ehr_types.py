from __future__ import annotations

from typing import Any, NotRequired, TypedDict

from app.services.schema_field_planner import SchemaField


class LlmExtractionError(RuntimeError):
    pass


class EhrExtractionState(TypedDict):
    text: str
    fields: list[SchemaField]
    document_id: str | None
    document_meta: dict[str, Any]
    ocr_evidence_units: NotRequired[list[dict[str, Any]]]
    reading_units: NotRequired[list[dict[str, Any]]]
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
    llm_call_buffer: NotRequired[list[dict[str, Any]]]
    llm_call_context: NotRequired[dict[str, Any]]


VALUE_SLOTS = {
    "text": "value_text",
    "number": "value_number",
    "date": "value_date",
    "datetime": "value_datetime",
    "json": "value_json",
}
