from __future__ import annotations

from typing import Any

from app.models import Document


def build_ocr_evidence_units(document: Document | None, *, limit: int = 260) -> list[dict[str, Any]]:
    payload = _ocr_payload(document)
    units: list[dict[str, Any]] = []

    for line in _as_list(payload.get("lines")):
        if not isinstance(line, dict):
            continue
        text = str(line.get("text") or "").strip()
        source_id = line.get("line_id")
        if not text or not source_id:
            continue
        units.append(
            {
                "source_type": "line",
                "source_id": source_id,
                "page_no": line.get("page_no"),
                "text": text[:300],
            }
        )

    if len(units) < limit:
        for block in _as_list(payload.get("blocks")):
            if not isinstance(block, dict):
                continue
            text = str(block.get("text") or block.get("markdown") or "").strip()
            source_id = block.get("block_id")
            if not text or not source_id:
                continue
            units.append(
                {
                    "source_type": "block",
                    "source_id": source_id,
                    "page_no": block.get("page_no"),
                    "type": block.get("type"),
                    "text": text[:500],
                }
            )

    return units[:limit]


def resolve_evidence_locations(document: Document | None, evidences: list[dict[str, Any]]) -> list[dict[str, Any]]:
    payload = _ocr_payload(document)
    if not isinstance(payload, dict) or not evidences:
        return evidences

    index = _build_location_index(payload)
    resolved: list[dict[str, Any]] = []
    for evidence in evidences:
        if not isinstance(evidence, dict):
            continue
        next_evidence = dict(evidence)
        if next_evidence.get("bbox_json") is None:
            location = _resolve_location(next_evidence, index)
            if location is None:
                location = _match_location_by_quote(next_evidence, index)
            if location is not None:
                next_evidence["bbox_json"] = location
                next_evidence.setdefault("page_no", location.get("page_no"))
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


def _match_location_by_quote(evidence: dict[str, Any], index: dict[tuple[str, str], dict[str, Any]]) -> dict[str, Any] | None:
    quote = _compact(evidence.get("quote_text"))
    if not quote:
        return None
    best: tuple[int, dict[str, Any]] | None = None
    for location in index.values():
        text = _compact(location.get("text"))
        if not text:
            continue
        score = 0
        if quote in text:
            score = len(quote)
        elif text in quote:
            score = len(text)
        if score and (best is None or score > best[0]):
            best = (score, location)
    return best[1] if best is not None else None


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
