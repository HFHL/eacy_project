from __future__ import annotations

from typing import Any

OFFICE_FILE_EXTENSIONS = frozenset({".doc", ".docx", ".ppt", ".pptx"})
OFFICE_MIME_TYPES = frozenset(
    {
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }
)


def normalize_file_ext(value: str | None) -> str:
    ext = (value or "").strip().lower()
    if not ext:
        return ""
    return ext if ext.startswith(".") else f".{ext}"


def uses_ocr_page_preview(*, file_ext: str | None = None, mime_type: str | None = None) -> bool:
    ext = normalize_file_ext(file_ext)
    if ext in OFFICE_FILE_EXTENSIONS:
        return True
    mime = (mime_type or "").strip().lower()
    return mime in OFFICE_MIME_TYPES


def document_uses_ocr_page_preview(document: Any) -> bool:
    return uses_ocr_page_preview(
        file_ext=getattr(document, "file_ext", None),
        mime_type=getattr(document, "mime_type", None),
    )


def get_ocr_page_count(ocr_payload: dict[str, Any] | None) -> int:
    if not isinstance(ocr_payload, dict):
        return 0
    pages = ocr_payload.get("pages")
    if not isinstance(pages, list):
        return 0
    persisted = [
        page
        for page in pages
        if isinstance(page, dict) and page.get("local_page_image_path")
    ]
    return len(persisted) if persisted else len([page for page in pages if isinstance(page, dict)])


def find_ocr_page_storage_path(ocr_payload: dict[str, Any] | None, page_no: int) -> str | None:
    if not isinstance(ocr_payload, dict):
        return None
    pages = ocr_payload.get("pages")
    if not isinstance(pages, list):
        return None
    for page in pages:
        if not isinstance(page, dict):
            continue
        try:
            current_page_no = int(page.get("page_no") or 0)
        except (TypeError, ValueError):
            continue
        if current_page_no == page_no:
            path = page.get("local_page_image_path")
            return str(path) if path else None
    return None


def first_persisted_ocr_page_path(ocr_payload: dict[str, Any] | None) -> tuple[int, str] | None:
    if not isinstance(ocr_payload, dict):
        return None
    pages = ocr_payload.get("pages")
    if not isinstance(pages, list):
        return None
    candidates: list[tuple[int, str]] = []
    for page in pages:
        if not isinstance(page, dict):
            continue
        path = page.get("local_page_image_path")
        if not path:
            continue
        try:
            page_no = int(page.get("page_no") or 0)
        except (TypeError, ValueError):
            page_no = 0
        if page_no <= 0:
            continue
        candidates.append((page_no, str(path)))
    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0])
    return candidates[0]
