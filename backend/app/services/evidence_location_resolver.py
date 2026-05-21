from __future__ import annotations

from difflib import SequenceMatcher
import re
from typing import Any

from app.models import Document

# 模糊匹配低于此分数时不写入可渲染 polygon
FUZZY_RENDER_MIN_SCORE = 0.88
# 短 query（≤4 字）模糊匹配最低分数
SHORT_QUERY_MIN_SCORE = 0.85


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
        if score < FUZZY_RENDER_MIN_SCORE:
            next_location.pop("polygon", None)
            next_location.pop("textin_position", None)
            next_location.pop("position", None)
            next_location["renderable"] = False
            next_location["coord_warning"] = "low_confidence_fuzzy_match"
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


def _resolve_location(evidence: dict[str, Any], index: dict[tuple[str, str], dict[str, Any]]) -> dict[str, Any] | None:
    source_id = evidence.get("source_id") or evidence.get("line_id") or evidence.get("block_id") or evidence.get("cell_key")
    if not source_id:
        return None
    source_type = evidence.get("source_type")
    if source_type:
        return index.get((str(source_type), str(source_id)))
    for candidate_type in ("line", "block", "table_cell"):
        found = index.get((candidate_type, str(source_id)))
        if found is not None:
            return found
    return None


def _match_location_by_quote(
    evidence: dict[str, Any],
    index: dict[tuple[str, str], dict[str, Any]],
    *,
    fallback_text: Any = None,
) -> dict[str, Any] | None:
    queries = _candidate_queries(evidence.get("quote_text"), fallback_text)
    if not queries:
        return None
    page_no = _normalize_page_no(evidence.get("page_no"))
    best: tuple[float, dict[str, Any], str] | None = None
    for query in queries:
        for location in index.values():
            if page_no is not None and _normalize_page_no(location.get("page_no")) not in (None, page_no):
                continue
            text = _compact(location.get("text"))
            if not text:
                continue
            score = _text_match_score(query, text)
            threshold = _match_threshold(query)
            if score >= threshold and (best is None or score > best[0]):
                best = (score, location, query)
    if best is None:
        return None
    location = dict(best[1])
    location["match_score"] = round(best[0], 4)
    location["match_strategy"] = "ocr_value_fuzzy"
    location["match_query"] = best[2][:80]
    if page_no is not None:
        location.setdefault("page_no", page_no)
    if location.get("text") is not None:
        location["source_text"] = location.get("text")
    return location


def _candidate_queries(*values: Any) -> list[str]:
    queries: list[str] = []
    for value in values:
        for text in _flatten_query_values(value):
            compacted = _compact(text)
            if compacted and compacted not in queries:
                queries.append(compacted)
    return queries


def _flatten_query_values(value: Any) -> list[str]:
    if value is None or value == "":
        return []
    if isinstance(value, dict):
        output: list[str] = []
        for item in value.values():
            output.extend(_flatten_query_values(item))
        return output
    if isinstance(value, list):
        output: list[str] = []
        for item in value:
            output.extend(_flatten_query_values(item))
        return output
    return [str(value)]


def _match_threshold(query: str) -> float:
    if len(query) <= 2:
        return 0.98
    if len(query) <= 4:
        return SHORT_QUERY_MIN_SCORE
    return 0.55


def _text_match_score(query: str, text: str) -> float:
    if not query or not text:
        return 0.0
    if query == text:
        return 1.0
    wildcard_score = _wildcard_match_score(query, text)
    if wildcard_score > 0:
        return wildcard_score
    if query in text:
        return min(1.0, 0.75 + min(len(query), 50) / 200)
    if text in query:
        return min(0.95, 0.65 + min(len(text), 50) / 250)
    return SequenceMatcher(None, query, text).ratio()


def _wildcard_match_score(query: str, text: str) -> float:
    if "*" not in query and "＊" not in query:
        return 0.0
    parts = [part for part in re.split(r"[*＊]+", query) if part]
    if not parts:
        return 0.0
    pattern = ".{0,8}".join(re.escape(part) for part in parts)
    if re.search(pattern, text):
        return 0.99 if len(query) <= 6 else 0.92
    position = -1
    for part in parts:
        position = text.find(part, position + 1)
        if position < 0:
            return 0.0
    return 0.86


def _build_location_index(payload: dict[str, Any]) -> dict[tuple[str, str], dict[str, Any]]:
    index: dict[tuple[str, str], dict[str, Any]] = {}
    for line in _as_list(payload.get("lines")):
        if isinstance(line, dict):
            _add_location(index, source_type="line", source_id=line.get("line_id"), item=line)
    for block in _as_list(payload.get("blocks")):
        if isinstance(block, dict):
            _add_location(index, source_type="block", source_id=block.get("block_id"), item=block)
    for table in _as_list(payload.get("tables")):
        if not isinstance(table, dict):
            continue
        for cell in _as_list(table.get("cells")):
            if isinstance(cell, dict):
                item = {**cell, "page_no": table.get("page_no"), "table_id": table.get("table_id")}
                _add_location(index, source_type="table_cell", source_id=cell.get("cell_key"), item=item)
    return index


def _add_location(index: dict[tuple[str, str], dict[str, Any]], *, source_type: str, source_id: Any, item: dict[str, Any]) -> None:
    if not source_id:
        return
    polygon = item.get("polygon") or item.get("textin_position") or item.get("position")
    if not (isinstance(polygon, list) and len(polygon) >= 8):
        return
    location = {
        "page_no": item.get("page_no"),
        "polygon": polygon,
        "coord_space": item.get("coord_space") or "pixel",
        "page_width": item.get("page_width"),
        "page_height": item.get("page_height"),
        "source_type": source_type,
        "source_id": str(source_id),
        "textin_position": item.get("textin_position") or polygon,
        "textin_origin_position": item.get("textin_origin_position"),
        "text": item.get("text"),
    }
    if source_type == "line":
        location["line_id"] = str(source_id)
    elif source_type == "block":
        location["block_id"] = str(source_id)
    elif source_type == "table_cell":
        location["table_id"] = item.get("table_id")
        location["cell_key"] = str(source_id)
    index[(source_type, str(source_id))] = {key: value for key, value in location.items() if value is not None}


def _ocr_payload(document: Document | None) -> dict[str, Any]:
    if document is None:
        return {}
    for payload in (document.ocr_payload_json, document.parsed_data):
        if isinstance(payload, dict):
            return payload
    return {}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _compact(value: Any) -> str:
    return "".join(str(value or "").split())


def _normalize_page_no(value: Any) -> int | None:
    try:
        page = int(value)
    except (TypeError, ValueError):
        return None
    return page if page > 0 else None


def _field_hint_terms(field_hints: list[str] | None) -> set[str]:
    terms: set[str] = set()
    for hint in field_hints or []:
        for part in re.split(r"[\s.·：:，,;；/\\-]+", str(hint)):
            compacted = part.strip()
            if len(compacted) >= 2:
                terms.add(compacted)
    return terms


def _hint_score(text: str, terms: set[str]) -> int:
    compacted = _compact(text)
    if not compacted:
        return 0
    return sum(1 for term in terms if term in compacted or term in text)
