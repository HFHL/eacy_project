from __future__ import annotations

import mimetypes
from dataclasses import asdict
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from datetime import datetime

from app.services.extraction_planner import ExtractionPlanner
from app.services.schema_field_planner import SchemaField


def metadata_document(
    *,
    document_id: str,
    entry: dict[str, Any],
    payload: dict[str, Any],
    metadata: dict[str, Any] | None,
) -> SimpleNamespace:
    source_name = str(entry.get("source_name") or entry.get("relative_path") or "document")
    meta_json = metadata.get("metadata_json") if isinstance(metadata, dict) else None
    return SimpleNamespace(
        id=document_id,
        original_filename=source_name,
        file_name=source_name,
        file_ext=Path(source_name).suffix,
        mime_type=entry.get("mime_type") or mimetypes.guess_type(source_name)[0],
        ocr_payload_json=payload,
        parsed_data=payload,
        ocr_text=payload.get("markdown") or "",
        parsed_content=payload.get("markdown") or "",
        doc_type=(metadata or {}).get("doc_type"),
        document_type=(metadata or {}).get("doc_type"),
        doc_subtype=(metadata or {}).get("doc_subtype"),
        document_sub_type=(metadata or {}).get("doc_subtype"),
        doc_title=(metadata or {}).get("doc_title") or source_name,
        metadata_json=meta_json if isinstance(meta_json, dict) else None,
        effective_at=parse_datetime((metadata or {}).get("effective_at")),
        ocr_status="completed",
    )


def plan_document_forms(
    *,
    document: SimpleNamespace,
    schema_json: dict[str, Any],
    source_tag: str = "ocr_extract_lab_document",
) -> list[dict[str, Any]]:
    items = ExtractionPlanner().plan(
        document=document,
        schema_json=schema_json,
        input_json={"source": source_tag},
        source_roles={"primary"},
    )
    return [asdict(item) for item in items]


def filter_fields_for_plan(fields: list[SchemaField], plan_items: list[dict[str, Any]]) -> list[SchemaField]:
    form_keys = {str(item.get("target_form_key")) for item in plan_items if item.get("target_form_key")}
    if not form_keys:
        return []
    return [field for field in fields if field.record_form_key in form_keys]


def filter_fields_by_query(fields: list[SchemaField], query: str | None) -> list[SchemaField]:
    tokens = [part.strip() for part in (query or "").replace(",", " ").split() if part.strip()]
    if not tokens:
        return fields
    selected: list[SchemaField] = []
    for field in fields:
        haystack = " ".join(
            str(value or "")
            for value in (
                field.field_path,
                field.field_title,
                field.field_key,
                field.extraction_prompt,
                field.record_form_key,
                field.record_form_title,
            )
        )
        if any(token in haystack for token in tokens):
            selected.append(field)
    return selected


def rank_and_limit_fields(fields: list[SchemaField], text: str, limit: int | None) -> list[SchemaField]:
    scored: list[tuple[int, int, SchemaField]] = []
    for index, field in enumerate(fields):
        score = 0
        for value in (field.field_title, field.field_key, field.record_form_title):
            if value and str(value) in text:
                score += 10
        if field.extraction_prompt and any(token in text for token in str(field.extraction_prompt).split()):
            score += 1
        scored.append((score, index, field))
    selected = [field for _score, _index, field in sorted(scored, key=lambda item: (-item[0], item[1]))]
    return selected[:limit] if limit and limit > 0 else selected


def target_form_keys(plan_items: list[dict[str, Any]]) -> list[str]:
    keys: list[str] = []
    seen: set[str] = set()
    for item in plan_items:
        key = item.get("target_form_key")
        if key and str(key) not in seen:
            keys.append(str(key))
            seen.add(str(key))
    return keys


def parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
