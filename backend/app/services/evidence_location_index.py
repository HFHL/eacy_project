from __future__ import annotations

from difflib import SequenceMatcher
import re
from typing import Any

from app.models import Document


SHORT_QUERY_MIN_SCORE = 0.85


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
    page_sizes = _page_sizes_by_no(payload)
    for line in _as_list(payload.get("lines")):
        if isinstance(line, dict):
            _add_location(index, source_type="line", source_id=line.get("line_id"), item=line, page_sizes=page_sizes)
    for block in _as_list(payload.get("blocks")):
        if isinstance(block, dict):
            _add_location(index, source_type="block", source_id=block.get("block_id"), item=block, page_sizes=page_sizes)
    for table in _as_list(payload.get("tables")):
        if not isinstance(table, dict):
            continue
        for cell in _as_list(table.get("cells")):
            if isinstance(cell, dict):
                item = {**cell, "page_no": table.get("page_no"), "table_id": table.get("table_id")}
                _add_location(index, source_type="table_cell", source_id=cell.get("cell_key"), item=item, page_sizes=page_sizes)
    return index


def _add_location(
    index: dict[tuple[str, str], dict[str, Any]],
    *,
    source_type: str,
    source_id: Any,
    item: dict[str, Any],
    page_sizes: dict[int, tuple[Any, Any]] | None = None,
) -> None:
    if not source_id:
        return
    polygon = item.get("polygon") or item.get("textin_position") or item.get("position")
    if not (isinstance(polygon, list) and len(polygon) >= 8):
        return
    page_no = item.get("page_no")
    fallback_width, fallback_height = _page_size_for(page_sizes or {}, page_no)
    page_width = item.get("page_width") or item.get("width") or fallback_width
    page_height = item.get("page_height") or item.get("height") or fallback_height
    coord_space = item.get("coord_space")
    if not coord_space:
        coord_space = "pixel" if page_width and page_height else "unknown"
    location = {
        "page_no": page_no,
        "polygon": polygon,
        "coord_space": coord_space,
        "page_width": page_width,
        "page_height": page_height,
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


def _page_sizes_by_no(payload: dict[str, Any]) -> dict[int, tuple[Any, Any]]:
    sizes: dict[int, tuple[Any, Any]] = {}
    for page in _as_list(payload.get("pages")):
        if not isinstance(page, dict):
            continue
        page_no = _normalize_page_no(page.get("page_no"))
        if page_no is None:
            continue
        width = page.get("page_width") or page.get("width")
        height = page.get("page_height") or page.get("height")
        if width is not None and height is not None:
            sizes[page_no] = (width, height)
    return sizes


def _page_size_for(page_sizes: dict[int, tuple[Any, Any]], page_no: Any) -> tuple[Any, Any]:
    normalized_page_no = _normalize_page_no(page_no)
    if normalized_page_no is None:
        return None, None
    return page_sizes.get(normalized_page_no, (None, None))


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
