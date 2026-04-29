from typing import Any

from app.models import Document


def extract_document_text(document: Document) -> str:
    parts: list[str] = []
    for value in (document.ocr_text, document.parsed_content):
        if isinstance(value, str) and value.strip():
            parts.append(value.strip())
    for payload in (document.ocr_payload_json, document.parsed_data):
        text = extract_text_from_payload(payload)
        if text:
            parts.append(text)
    seen: set[str] = set()
    unique_parts: list[str] = []
    for part in parts:
        if part not in seen:
            seen.add(part)
            unique_parts.append(part)
    return "\n\n".join(unique_parts)


def extract_text_from_payload(payload: Any) -> str:
    if payload is None:
        return ""
    if isinstance(payload, str):
        return payload.strip()
    if isinstance(payload, list):
        return "\n".join(filter(None, (extract_text_from_payload(item) for item in payload)))
    if not isinstance(payload, dict):
        return ""

    preferred_keys = ("markdown", "text", "content", "ocr_text", "parsed_content")
    for key in preferred_keys:
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    result = payload.get("result")
    if result is not None:
        text = extract_text_from_payload(result)
        if text:
            return text

    pages = payload.get("pages")
    if isinstance(pages, list):
        text = extract_text_from_payload(pages)
        if text:
            return text

    lines = payload.get("lines") or payload.get("items")
    if isinstance(lines, list):
        text = extract_text_from_payload(lines)
        if text:
            return text

    return "\n".join(
        value.strip()
        for value in payload.values()
        if isinstance(value, str) and value.strip()
    )
