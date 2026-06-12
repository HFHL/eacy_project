from __future__ import annotations

from app.models import Document


def _document_task_status(document: Document) -> str:
    if document.status == "archived" or document.archived_at is not None:
        return "archived"
    if document.status == "failed" or document.ocr_status == "failed":
        return "parse_failed"
    if document.status == "ocr_pending" or document.ocr_status in {"queued", "running"}:
        return "parsing"
    if document.status == "ocr_completed" or document.ocr_status == "completed":
        return "parsed"
    return document.status or "uploaded"


def _project_status_label(status: str | None) -> str:
    labels = {
        "planning": "规划中",
        "active": "进行中",
        "paused": "已暂停",
        "completed": "已完成",
        "archived": "已归档",
        "draft": "草稿",
    }
    return labels.get(status or "", status or "未知")
