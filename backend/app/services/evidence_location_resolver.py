from __future__ import annotations

from typing import Any

from app.models import Document
from app.services.evidence_location_index import (
    SHORT_QUERY_MIN_SCORE,
    _as_list,
    _build_location_index,
    _compact,
    _field_hint_terms,
    _hint_score,
    _match_location_by_quote,
    _ocr_payload,
    _resolve_location,
)

# 模糊匹配高于此分数视为高置信度（可被 auto_select / 精确溯源信任）
FUZZY_RENDER_MIN_SCORE = 0.88
# 模糊匹配低于此分数则连 polygon 都不保留；位于 [LOW_CONFIDENCE_MIN, FUZZY_RENDER_MIN) 区间
# 的命中视为「低置信度但仍可渲染」，前端可按 low_confidence=true 画浅色框。
FUZZY_RENDER_LOW_CONFIDENCE_MIN_SCORE = 0.70


def has_renderable_polygon(location: dict[str, Any] | None) -> bool:
    if not isinstance(location, dict):
        return False
    polygon = location.get("polygon") or location.get("textin_position") or location.get("position")
    return isinstance(polygon, list) and len(polygon) >= 8


def page_angle_from_payload(payload: dict[str, Any], page_no: Any) -> float:
    try:
        target = int(page_no)
    except (TypeError, ValueError):
        return 0.0
    for page in _as_list(payload.get("pages")):
        if not isinstance(page, dict) or page.get("page_no") != target:
            continue
        try:
            angle = float(page.get("angle") or 0)
        except (TypeError, ValueError):
            return 0.0
        return ((angle % 360) + 360) % 360
    return 0.0


def enrich_evidence_location(document: Document | None, location: dict[str, Any]) -> dict[str, Any]:
    enriched = dict(location)
    payload = _ocr_payload(document)
    page_no = enriched.get("page_no")
    enriched["page_angle"] = page_angle_from_payload(payload, page_no)
    enriched = _apply_location_quality_gate(enriched)
    if enriched.get("coord_space") == "unknown":
        enriched["coord_warning"] = "missing_page_dimensions"
    elif not enriched.get("renderable"):
        enriched["coord_warning"] = enriched.get("coord_warning") or "missing_polygon"
    return enriched


def evidence_location_is_trusted(location: dict[str, Any] | None) -> bool:
    """可用于 auto_select / 精确溯源的坐标。"""
    if not has_renderable_polygon(location):
        return False
    if location.get("fallback_strategy"):
        return False
    if location.get("match_strategy") == "ocr_value_fuzzy":
        try:
            score = float(location.get("match_score") or 0)
        except (TypeError, ValueError):
            return False
        return score >= FUZZY_RENDER_MIN_SCORE
    return True


def _apply_location_quality_gate(location: dict[str, Any]) -> dict[str, Any]:
    next_location = dict(location)
    match_strategy = next_location.get("match_strategy")
    if match_strategy == "ocr_value_fuzzy":
        try:
            score = float(next_location.get("match_score") or 0)
        except (TypeError, ValueError):
            score = 0.0
        # < 0.70: 完全不可信，连 polygon 一起丢弃，前端不渲染。
        if score < FUZZY_RENDER_LOW_CONFIDENCE_MIN_SCORE:
            next_location.pop("polygon", None)
            next_location.pop("textin_position", None)
            next_location.pop("position", None)
            next_location["renderable"] = False
            next_location["coord_warning"] = "low_confidence_fuzzy_match"
            return next_location
        # 0.70 ~ 0.88: 仍然可渲染但属于「低置信度」匹配。保留 polygon 让用户至少
        # 看到位置候选框，同时打上 low_confidence=true / coord_warning 让前端用
        # 浅色或虚线区分，且不被 evidence_location_is_trusted 信任、不参与 auto_select。
        if score < FUZZY_RENDER_MIN_SCORE:
            next_location["low_confidence"] = True
            next_location["coord_warning"] = "low_confidence_fuzzy_match"
            next_location["renderable"] = has_renderable_polygon(next_location)
            return next_location
    next_location["renderable"] = has_renderable_polygon(next_location)
    return next_location


def build_ocr_reading_units(
    document: Document | None,
    *,
    limit: int | None = None,
    field_hints: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Structured OCR units for LLM extraction input (replaces markdown as primary reading surface)."""
    from core.config import config

    unit_limit = limit if limit is not None else int(getattr(config, "EXTRACTION_OCR_EVIDENCE_UNIT_LIMIT", 400) or 400)
    payload = _ocr_payload(document)
    if not isinstance(payload, dict) or not payload:
        return []

    units: list[dict[str, Any]] = []
    seen: set[tuple[Any, str]] = set()

    def append_unit(item: dict[str, Any]) -> None:
        if len(units) >= unit_limit:
            return
        text = str(item.get("text") or "").strip()
        source_id = item.get("source_id")
        if not text or not source_id:
            return
        dedupe_key = (item.get("page_no"), _compact(text))
        if dedupe_key in seen:
            return
        seen.add(dedupe_key)
        units.append(item)

    for block in _as_list(payload.get("blocks")):
        if not isinstance(block, dict):
            continue
        text = str(block.get("text") or block.get("markdown") or "").strip()
        source_id = block.get("block_id")
        if not text or not source_id:
            continue
        unit: dict[str, Any] = {
            "source_type": "block",
            "source_id": str(source_id),
            "page_no": block.get("page_no"),
            "text": text[:2000],
        }
        if block.get("type"):
            unit["type"] = block.get("type")
        if block.get("sub_type"):
            unit["sub_type"] = block.get("sub_type")
        if block.get("table_id"):
            unit["table_id"] = block.get("table_id")
        append_unit(unit)

    for table in _as_list(payload.get("tables")):
        if not isinstance(table, dict):
            continue
        page_no = table.get("page_no")
        table_id = table.get("table_id")
        for cell in _as_list(table.get("cells")):
            if not isinstance(cell, dict):
                continue
            text = str(cell.get("text") or "").strip()
            source_id = cell.get("cell_key")
            if not text or not source_id:
                continue
            unit = {
                "source_type": "table_cell",
                "source_id": str(source_id),
                "page_no": page_no,
                "text": text[:500],
            }
            if table_id:
                unit["table_id"] = table_id
            if cell.get("row") is not None:
                unit["row"] = cell.get("row")
            if cell.get("col") is not None:
                unit["col"] = cell.get("col")
            if cell.get("row_span") is not None:
                unit["row_span"] = cell.get("row_span")
            if cell.get("col_span") is not None:
                unit["col_span"] = cell.get("col_span")
            append_unit(unit)

    for line in _as_list(payload.get("lines")):
        if not isinstance(line, dict):
            continue
        text = str(line.get("text") or "").strip()
        source_id = line.get("line_id")
        if not text or not source_id:
            continue
        unit = {
            "source_type": "line",
            "source_id": str(source_id),
            "page_no": line.get("page_no"),
            "text": text[:500],
        }
        if line.get("order_index") is not None:
            unit["order_index"] = line.get("order_index")
        append_unit(unit)

    hint_terms = _field_hint_terms(field_hints)
    if hint_terms:
        units.sort(key=lambda unit: _hint_score(unit.get("text") or "", hint_terms), reverse=True)
    return units[:unit_limit]


def build_ocr_evidence_units(
    document: Document | None,
    *,
    limit: int | None = None,
    field_hints: list[str] | None = None,
) -> list[dict[str, Any]]:
    return build_ocr_reading_units(document, limit=limit, field_hints=field_hints)


def flatten_reading_unit_corpus(units: list[dict[str, Any]] | None) -> str:
    if not units:
        return ""
    parts: list[str] = []
    seen: set[str] = set()
    for unit in units:
        if not isinstance(unit, dict):
            continue
        text = str(unit.get("text") or "").strip()
        if text and text not in seen:
            seen.add(text)
            parts.append(text)
    return "\n".join(parts)


def resolve_evidence_locations(
    document: Document | None,
    evidences: list[dict[str, Any]],
    *,
    fallback_text: Any = None,
) -> list[dict[str, Any]]:
    payload = _ocr_payload(document)
    if not isinstance(payload, dict) or not evidences:
        return evidences

    index = _build_location_index(payload)
    resolved: list[dict[str, Any]] = []
    for evidence in evidences:
        if not isinstance(evidence, dict):
            continue
        next_evidence = dict(evidence)
        location = _resolve_location(next_evidence, index)
        if location is None:
            location = _match_location_by_quote(next_evidence, index, fallback_text=fallback_text)

        if location is not None:
            enriched = enrich_evidence_location(document, location)
            next_evidence["bbox_json"] = enriched
            next_evidence.setdefault("page_no", enriched.get("page_no"))
        resolved.append(next_evidence)
    return resolved
