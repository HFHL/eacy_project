from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.integrations.textin_ocr import TextInOcrClient
from app.services.document_service import DocumentService
from app.storage.document_storage import StoredDocumentFile


class FakeUploadFile:
    filename = "report.pdf"
    content_type = "application/pdf"

    def __init__(self, content: bytes):
        self._content = content
        self._offset = 0

    async def read(self, size: int = -1) -> bytes:
        if self._offset >= len(self._content):
            return b""
        if size is None or size < 0:
            size = len(self._content) - self._offset
        chunk = self._content[self._offset : self._offset + size]
        self._offset += len(chunk)
        return chunk


class FakeStorage:
    async def save(self, file, *, original_filename, file_ext):
        assert original_filename == "report.pdf"
        assert file_ext == ".pdf"
        content = await file.read()
        assert content == b"fake pdf"
        return StoredDocumentFile(
            provider="oss",
            path="documents/2026/04/report.pdf",
            url="https://cinocore-eacy.oss-cn-shanghai.aliyuncs.com/documents/2026/04/report.pdf",
            size=len(content),
            sha256="hash-value",
        )


class FakeDocumentRepository:
    async def create(self, params):
        return SimpleNamespace(id="document-1", **params)


class MutableFakeDocumentRepository:
    def __init__(self):
        self.document = None

    async def create(self, params):
        self.document = SimpleNamespace(id="document-1", **params)
        return self.document

    async def get_visible_by_id(self, document_id):
        if self.document is None or self.document.id != document_id:
            return None
        return self.document

    async def save(self, document):
        self.document = document
        return document


class FakePreviewDocumentRepository:
    async def get_visible_by_id(self, document_id):
        return SimpleNamespace(
            id=document_id,
            storage_provider="local",
            storage_path="documents/legacy/report.pdf",
            file_url="https://example.com/legacy/report.pdf",
            mime_type="application/pdf",
            original_filename="report.pdf",
        )


class FakePatientRepository:
    async def get_active_by_id(self, patient_id):
        return None


@pytest.mark.asyncio
async def test_upload_document_persists_oss_storage_metadata():
    service = DocumentService(
        document_repository=FakeDocumentRepository(),
        patient_repository=FakePatientRepository(),
        storage_backend=FakeStorage(),
        ocr_auto_enqueue=False,
    )

    document = await service.upload_document(file=FakeUploadFile(b"fake pdf"))

    assert document.storage_provider == "oss"
    assert document.storage_path == "documents/2026/04/report.pdf"
    assert document.file_path == "documents/2026/04/report.pdf"
    assert document.file_url.startswith("https://cinocore-eacy.")
    assert document.file_size == 8
    assert document.file_hash == "hash-value"


@pytest.mark.asyncio
async def test_upload_document_auto_enqueues_ocr_after_persisting(monkeypatch):
    repository = FakeDocumentRepository()
    events = []

    class FakeSession:
        async def commit(self):
            events.append("commit")

        async def rollback(self):
            events.append("rollback")

    class RecordingDocumentService(DocumentService):
        def _enqueue_ocr_task(self, document_id):
            events.append(f"enqueue:{document_id}")

    monkeypatch.setattr("app.services.document_service.session", FakeSession())

    service = RecordingDocumentService(
        document_repository=repository,
        patient_repository=FakePatientRepository(),
        storage_backend=FakeStorage(),
        ocr_auto_enqueue=True,
    )

    document = await service.upload_document(file=FakeUploadFile(b"fake pdf"))

    assert document.ocr_status == "queued"
    assert document.status == "ocr_pending"
    assert events == ["commit", "enqueue:document-1"]


@pytest.mark.asyncio
async def test_process_document_ocr_backfills_text_and_payload(monkeypatch):
    repository = MutableFakeDocumentRepository()

    class FakeSession:
        async def commit(self):
            return None

        async def rollback(self):
            return None

    class PreviewDocumentService(DocumentService):
        async def get_preview_url(self, document_id, *, expires_in=3600):
            return {
                "document_id": document_id,
                "url": "https://example.com/report.pdf",
                "temp_url": "https://example.com/report.pdf",
                "preview_url": "https://example.com/report.pdf",
                "expires_in": expires_in,
                "storage_provider": "oss",
                "mime_type": "application/pdf",
                "file_name": "report.pdf",
            }

    async def fake_parse_document_url(self, document_url, *, filename=None, mime_type=None):
        assert document_url == "https://example.com/report.pdf"
        assert filename == "report.pdf"
        assert mime_type == "application/pdf"
        return {
            "code": 200,
            "result": {
                "markdown": "# OCR Result\n\nhello",
                "pages": [{"page_id": 1, "raw_ocr": [{"text": "hello", "score": 0.99}]}],
                "detail": [],
            },
        }

    monkeypatch.setattr("app.services.document_service.session", FakeSession())
    monkeypatch.setattr(TextInOcrClient, "parse_document_url", fake_parse_document_url)

    service = PreviewDocumentService(
        document_repository=repository,
        patient_repository=FakePatientRepository(),
        storage_backend=FakeStorage(),
        ocr_auto_enqueue=False,
    )
    await repository.create(
        {
            "original_filename": "report.pdf",
            "mime_type": "application/pdf",
            "storage_provider": "oss",
            "storage_path": "documents/2026/04/report.pdf",
            "file_url": "https://example.com/report.pdf",
            "status": "queued",
            "ocr_status": "queued",
            "ocr_text": None,
            "ocr_payload_json": None,
        }
    )

    document = await service.process_document_ocr("document-1")

    assert document.ocr_status == "completed"
    assert document.status == "ocr_completed"
    assert document.ocr_text == "# OCR Result\n\nhello"
    assert document.ocr_payload_json["provider"] == "textin"
    assert document.ocr_payload_json["lines"][0]["text"] == "hello"


@pytest.mark.asyncio
async def test_preview_rejects_non_oss_document_even_with_url():
    service = DocumentService(
        document_repository=FakePreviewDocumentRepository(),
        patient_repository=FakePatientRepository(),
        storage_backend=FakeStorage(),
    )

    with pytest.raises(HTTPException) as exc_info:
        await service.get_preview_url("document-1")

    assert exc_info.value.status_code == 409
