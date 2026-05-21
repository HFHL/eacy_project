from types import SimpleNamespace

from app.services.document_preview_utils import (
    document_uses_ocr_page_preview,
    find_ocr_page_storage_path,
    first_persisted_ocr_page_path,
    get_ocr_page_count,
    uses_ocr_page_preview,
)


def test_uses_ocr_page_preview_detects_office_formats():
    assert uses_ocr_page_preview(file_ext=".docx")
    assert uses_ocr_page_preview(mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    assert not uses_ocr_page_preview(file_ext=".pdf", mime_type="application/pdf")


def test_find_ocr_page_storage_path():
    payload = {
        "pages": [
            {"page_no": 1, "local_page_image_path": "documents/ocr-pages/doc-1/page-1.jpg"},
            {"page_no": 2, "local_page_image_path": "documents/ocr-pages/doc-1/page-2.jpg"},
        ]
    }
    assert find_ocr_page_storage_path(payload, 2) == "documents/ocr-pages/doc-1/page-2.jpg"
    assert find_ocr_page_storage_path(payload, 9) is None


def test_first_persisted_ocr_page_path():
    payload = {
        "pages": [
            {"page_no": 2, "local_page_image_path": "documents/ocr-pages/doc-1/page-2.jpg"},
            {"page_no": 1, "local_page_image_path": "documents/ocr-pages/doc-1/page-1.jpg"},
        ]
    }
    assert first_persisted_ocr_page_path(payload) == (1, "documents/ocr-pages/doc-1/page-1.jpg")


def test_get_ocr_page_count_prefers_persisted_pages():
    payload = {
        "pages": [
            {"page_no": 1},
            {"page_no": 2, "local_page_image_path": "documents/ocr-pages/doc-1/page-2.jpg"},
        ]
    }
    assert get_ocr_page_count(payload) == 1


def test_document_uses_ocr_page_preview():
    document = SimpleNamespace(file_ext=".docx", mime_type=None)
    assert document_uses_ocr_page_preview(document)
