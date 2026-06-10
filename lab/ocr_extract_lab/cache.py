from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_batch_entries(batch_dir: Path) -> list[dict[str, Any]]:
    summary_path = batch_dir / "summary.json"
    if not summary_path.exists():
        raise FileNotFoundError(f"未找到 OCR 缓存：{summary_path}，请先批量 OCR")
    summary = read_json(summary_path)
    return [
        item
        for item in (summary.get("results") if isinstance(summary.get("results"), list) else [])
        if isinstance(item, dict) and item.get("status") == "completed"
    ]


def load_combined_cached_ocr(batch_dir: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    entries = load_batch_entries(batch_dir)
    payloads: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for entry in entries:
        normalized_path = Path(str(entry.get("normalized_json") or ""))
        if not normalized_path.exists():
            continue
        payloads.append((entry, read_json(normalized_path)))
    if not payloads:
        raise FileNotFoundError(f"OCR 批次没有可用 normalized JSON：{batch_dir}")
    return combine_payloads(payloads), [entry for entry, _payload in payloads]


def combine_payloads(payloads: list[tuple[dict[str, Any], dict[str, Any]]]) -> dict[str, Any]:
    combined: dict[str, Any] = {
        "provider": "textin",
        "provider_version": "eacy-lab-combined-v1",
        "request": {"source": "ocr_extract_lab_cached_batch"},
        "response_summary": {"document_count": len(payloads)},
        "markdown": "",
        "pages": [],
        "blocks": [],
        "tables": [],
        "lines": [],
        "assets": {},
        "errors": [],
        "documents": [],
    }
    markdown_parts: list[str] = []
    page_offset = 0
    for doc_index, (entry, payload) in enumerate(payloads, start=1):
        prefix = f"d{doc_index}"
        source_name = str(entry.get("source_name") or entry.get("relative_path") or f"document-{doc_index}")
        rel_path = str(entry.get("relative_path") or source_name)
        source_path = str(entry.get("source_path") or "")
        page_map = build_page_map(payload, page_offset)
        combined["documents"].append(
            {
                "document_index": doc_index,
                "source_name": source_name,
                "relative_path": rel_path,
                "source_path": source_path,
                "page_start": page_offset + 1,
                "page_count": len(payload.get("pages") or []),
                "normalized_json": entry.get("normalized_json"),
                "markdown": entry.get("markdown"),
                "sha256": entry.get("sha256"),
            }
        )
        markdown = str(payload.get("markdown") or "").strip()
        if markdown:
            markdown_parts.append(f"\n\n## [{doc_index:03d}] {source_name}\n\n{markdown}")
        for page in as_list(payload.get("pages")):
            next_page = dict(page)
            old_page_no = normalize_page_no(page.get("page_no"), len(page_map))
            next_page["page_no"] = page_map.get(old_page_no, page_offset + len(page_map))
            next_page["source_page_no"] = old_page_no
            next_page["source_name"] = source_name
            next_page["relative_path"] = rel_path
            next_page["source_path"] = source_path
            combined["pages"].append(next_page)
        for line in as_list(payload.get("lines")):
            combined["lines"].append(rekey_line(line, prefix, page_map, entry))
        for block in as_list(payload.get("blocks")):
            combined["blocks"].append(rekey_block(block, prefix, page_map, entry))
        for table in as_list(payload.get("tables")):
            combined["tables"].append(rekey_table(table, prefix, page_map, entry))
        page_offset += len(page_map)
    combined["markdown"] = "\n".join(markdown_parts).strip()
    combined["response_summary"]["total_page_number"] = len(combined["pages"])
    return combined


def build_page_map(payload: dict[str, Any], page_offset: int) -> dict[int, int]:
    pages = as_list(payload.get("pages"))
    page_map: dict[int, int] = {}
    for fallback, page in enumerate(pages, start=1):
        if not isinstance(page, dict):
            continue
        old_page_no = normalize_page_no(page.get("page_no"), fallback)
        page_map[old_page_no] = page_offset + fallback
    if not page_map:
        page_map[1] = page_offset + 1
    return page_map


def rekey_line(line: Any, prefix: str, page_map: dict[int, int], entry: dict[str, Any]) -> dict[str, Any]:
    item = dict(line) if isinstance(line, dict) else {}
    old_id = item.get("line_id") or item.get("source_id") or "line"
    item["line_id"] = f"{prefix}-{old_id}"
    if item.get("block_id"):
        item["block_id"] = f"{prefix}-{item['block_id']}"
    item["page_no"] = remap_page(item.get("page_no"), page_map)
    return add_source_meta(item, entry)


def rekey_block(block: Any, prefix: str, page_map: dict[int, int], entry: dict[str, Any]) -> dict[str, Any]:
    item = dict(block) if isinstance(block, dict) else {}
    old_id = item.get("block_id") or item.get("source_id") or "block"
    item["block_id"] = f"{prefix}-{old_id}"
    if item.get("table_id"):
        item["table_id"] = f"{prefix}-{item['table_id']}"
    if isinstance(item.get("line_ids"), list):
        item["line_ids"] = [f"{prefix}-{line_id}" for line_id in item["line_ids"]]
    item["page_no"] = remap_page(item.get("page_no"), page_map)
    return add_source_meta(item, entry)


def rekey_table(table: Any, prefix: str, page_map: dict[int, int], entry: dict[str, Any]) -> dict[str, Any]:
    item = dict(table) if isinstance(table, dict) else {}
    if item.get("table_id"):
        item["table_id"] = f"{prefix}-{item['table_id']}"
    if item.get("block_id"):
        item["block_id"] = f"{prefix}-{item['block_id']}"
    item["page_no"] = remap_page(item.get("page_no"), page_map)
    item["cells"] = [rekey_cell(cell, prefix, entry) for cell in as_list(item.get("cells"))]
    return add_source_meta(item, entry)


def rekey_cell(cell: Any, prefix: str, entry: dict[str, Any]) -> dict[str, Any]:
    item = dict(cell) if isinstance(cell, dict) else {}
    if item.get("cell_key"):
        item["cell_key"] = f"{prefix}-{item['cell_key']}"
    return add_source_meta(item, entry)


def add_source_meta(item: dict[str, Any], entry: dict[str, Any]) -> dict[str, Any]:
    item["source_name"] = entry.get("source_name")
    item["relative_path"] = entry.get("relative_path")
    item["source_path"] = entry.get("source_path")
    return item


def remap_page(value: Any, page_map: dict[int, int]) -> int | None:
    return page_map.get(normalize_page_no(value, 1))


def normalize_page_no(value: Any, fallback: int) -> int:
    try:
        page_no = int(value)
    except (TypeError, ValueError):
        return fallback
    return page_no + 1 if page_no == 0 else page_no


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []
