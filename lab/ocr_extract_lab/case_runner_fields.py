from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from app.services.evidence_location_resolver import resolve_evidence_locations


def enrich_fields_with_locations(fields: list[dict[str, Any]], document: SimpleNamespace) -> list[dict[str, Any]]:
    enriched: list[dict[str, Any]] = []
    for field in fields:
        evidences = field.get("evidences") if isinstance(field.get("evidences"), list) else []
        resolved = resolve_evidence_locations(document, evidences, fallback_text=display_value(field))
        next_field = {**field, "evidences": resolved}
        next_field["locations"] = [evidence["bbox_json"] for evidence in resolved if isinstance(evidence, dict) and isinstance(evidence.get("bbox_json"), dict)]
        enriched.append(next_field)
    return enriched


def remap_fields(fields: list[dict[str, Any]], *, page_offset: int, entry: dict[str, Any], document_id: str) -> list[dict[str, Any]]:
    return [remap_field(field, page_offset=page_offset, entry=entry, document_id=document_id) for field in fields]


def remap_field(field: dict[str, Any], *, page_offset: int, entry: dict[str, Any], document_id: str) -> dict[str, Any]:
    next_field = {**field, "source_document_id": document_id, "source_name": entry.get("source_name"), "relative_path": entry.get("relative_path")}
    next_field["evidences"] = [remap_evidence(evidence, page_offset=page_offset, entry=entry) for evidence in field.get("evidences") or [] if isinstance(evidence, dict)]
    next_field["locations"] = [evidence["bbox_json"] for evidence in next_field["evidences"] if isinstance(evidence.get("bbox_json"), dict)]
    return next_field


def remap_evidence(evidence: dict[str, Any], *, page_offset: int, entry: dict[str, Any]) -> dict[str, Any]:
    next_evidence = dict(evidence)
    if next_evidence.get("page_no") is not None:
        next_evidence["source_page_no"] = next_evidence.get("page_no")
        next_evidence["page_no"] = int(next_evidence["page_no"]) + page_offset
    next_evidence["source_name"] = entry.get("source_name")
    next_evidence["relative_path"] = entry.get("relative_path")
    bbox = next_evidence.get("bbox_json")
    if isinstance(bbox, dict):
        next_bbox = dict(bbox)
        if next_bbox.get("page_no") is not None:
            next_bbox["source_page_no"] = next_bbox.get("page_no")
            next_bbox["page_no"] = int(next_bbox["page_no"]) + page_offset
        next_bbox["source_name"] = entry.get("source_name")
        next_bbox["relative_path"] = entry.get("relative_path")
        next_evidence["bbox_json"] = next_bbox
    return next_evidence


def display_value(field: dict[str, Any]) -> Any:
    for key in ("value_text", "value_number", "value_date", "value_datetime", "value_json"):
        if key in field and field[key] not in (None, "", [], {}):
            return field[key]
    return ""
