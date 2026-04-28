from __future__ import annotations

from typing import Any


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _page_no(value: Any, fallback: int) -> int:
    try:
        page_id = int(value)
    except (TypeError, ValueError):
        return fallback
    return page_id + 1 if page_id == 0 else page_id


def _coord_space(page: dict[str, Any]) -> str:
    if page.get("width") and page.get("height"):
        return "pixel"
    return "unknown"


def _join_raw_ocr_text(pages: list[dict[str, Any]]) -> str:
    page_texts: list[str] = []
    for page in pages:
        lines = [
            str(item.get("text") or "")
            for item in _as_list(page.get("raw_ocr"))
            if isinstance(item, dict) and item.get("text")
        ]
        if lines:
            page_texts.append("\n".join(lines))
    return "\n\n".join(page_texts)


def normalize_textin_ocr_payload(raw_response: dict[str, Any], *, request_snapshot: dict[str, Any] | None = None) -> dict[str, Any]:
    result = raw_response.get("result") if isinstance(raw_response.get("result"), dict) else {}
    pages_raw = _as_list(result.get("pages"))
    detail_raw = _as_list(result.get("detail"))
    markdown = result.get("markdown") or _join_raw_ocr_text([page for page in pages_raw if isinstance(page, dict)])

    pages: list[dict[str, Any]] = []
    lines: list[dict[str, Any]] = []
    blocks: list[dict[str, Any]] = []
    tables: list[dict[str, Any]] = []
    offset = 0

    page_dimensions: dict[int, tuple[Any, Any]] = {}
    for index, page in enumerate(pages_raw, start=1):
        if not isinstance(page, dict):
            continue
        page_no = _page_no(page.get("page_id"), index)
        width = page.get("width")
        height = page.get("height")
        page_dimensions[page_no] = (width, height)
        pages.append(
            {
                "page_no": page_no,
                "textin_page_id": page.get("page_id"),
                "status": page.get("status"),
                "width": width,
                "height": height,
                "angle": page.get("angle"),
                "dpi": page.get("dpi"),
                "image_id": page.get("image_id"),
                "origin_image_id": page.get("origin_image_id"),
                "page_image_url": page.get("page_image_url"),
                "duration_ms": page.get("durations"),
            }
        )

        for line_index, item in enumerate(_as_list(page.get("raw_ocr")), start=1):
            if not isinstance(item, dict):
                continue
            text = str(item.get("text") or "")
            start_offset = offset
            offset += len(text)
            end_offset = offset
            offset += 1
            lines.append(
                {
                    "line_id": f"p{page_no}-l{line_index}",
                    "page_no": page_no,
                    "text": text,
                    "polygon": item.get("position") or item.get("pos"),
                    "coord_space": _coord_space(page),
                    "page_width": width,
                    "page_height": height,
                    "score": item.get("score"),
                    "char_positions": item.get("char_positions") or item.get("char_pos"),
                    "char_scores": item.get("char_scores"),
                    "start_offset": start_offset,
                    "end_offset": end_offset,
                    "block_id": None,
                    "order_index": line_index,
                    "textin_position": item.get("position") or item.get("pos"),
                    "textin_origin_position": item.get("origin_position"),
                }
            )

    for index, item in enumerate(detail_raw, start=1):
        if not isinstance(item, dict):
            continue
        page_no = _page_no(item.get("page_id"), 1)
        width, height = page_dimensions.get(page_no, (None, None))
        block_id = f"b{index}"
        block_type = item.get("type")
        block = {
            "block_id": block_id,
            "source": "detail",
            "source_id": item.get("paragraph_id") or index,
            "page_no": page_no,
            "type": block_type,
            "sub_type": item.get("sub_type"),
            "text": item.get("text"),
            "markdown": item.get("markdown"),
            "polygon": item.get("position") or item.get("pos"),
            "coord_space": "pixel" if width and height else "unknown",
            "page_width": width,
            "page_height": height,
            "line_ids": [],
            "table_id": None,
            "confidence": item.get("score"),
            "order_index": index,
            "textin_position": item.get("position") or item.get("pos"),
            "textin_origin_position": item.get("origin_position"),
        }
        blocks.append(block)

        cells = _as_list(item.get("cells"))
        if block_type == "table" or cells:
            table_id = f"t{len(tables) + 1}"
            block["table_id"] = table_id
            normalized_cells = []
            for cell_index, cell in enumerate(cells, start=1):
                if not isinstance(cell, dict):
                    continue
                row = cell.get("row")
                col = cell.get("col")
                normalized_cells.append(
                    {
                        "row": row,
                        "col": col,
                        "row_span": cell.get("row_span"),
                        "col_span": cell.get("col_span"),
                        "text": cell.get("text"),
                        "polygon": cell.get("position") or cell.get("pos"),
                        "coord_space": "pixel" if width and height else "unknown",
                        "row_key": f"r{row}" if row is not None else None,
                        "cell_key": f"t{len(tables) + 1}-c{cell_index}",
                        "textin_position": cell.get("position") or cell.get("pos"),
                        "textin_origin_position": cell.get("origin_position"),
                    }
                )
            tables.append(
                {
                    "table_id": table_id,
                    "page_no": page_no,
                    "block_id": block_id,
                    "text": item.get("text"),
                    "html": item.get("html"),
                    "markdown": item.get("markdown"),
                    "polygon": item.get("position") or item.get("pos"),
                    "rows": item.get("rows"),
                    "cols": item.get("cols"),
                    "cells": normalized_cells,
                }
            )

    return {
        "provider": "textin",
        "provider_version": "eacy-textin-adapter-v1",
        "request": request_snapshot or {},
        "response_summary": {
            "code": raw_response.get("code"),
            "message": raw_response.get("message") or raw_response.get("msg"),
            "total_page_number": result.get("total_page_number"),
            "valid_page_number": result.get("valid_page_number"),
            "success_count": result.get("success_count"),
        },
        "raw_response": raw_response,
        "markdown": markdown or "",
        "pages": pages,
        "blocks": blocks,
        "tables": tables,
        "lines": lines,
        "assets": {},
        "errors": [],
    }
