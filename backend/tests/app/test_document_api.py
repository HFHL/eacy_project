from datetime import datetime
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api.v1.documents.router import get_document_service
from app.server import app


client = TestClient(app)


class FakeDocumentService:
    def __init__(self):
        self.documents = {}

    async def upload_document(self, *, file, patient_id=None, uploaded_by=None):
        content = await file.read()
        document = SimpleNamespace(
            id="document-1",
            patient_id=patient_id,
            original_filename=file.filename,
            file_ext=".pdf",
            mime_type=file.content_type,
            file_size=len(content),
            storage_provider="oss",
            storage_path="documents/2026/04/document-1.pdf",
            file_url="https://cinocore-eacy.oss-cn-shanghai.aliyuncs.com/documents/2026/04/document-1.pdf",
            status="uploaded" if patient_id is None else "archived",
            ocr_status="pending",
            ocr_text=None,
            ocr_payload_json=None,
            meta_status=None,
            metadata_json=None,
            doc_type=None,
            doc_subtype=None,
            doc_title=None,
            effective_at=None,
            uploaded_by=uploaded_by,
            archived_at=None,
            created_at=datetime(2026, 1, 1),
            updated_at=None,
        )
        self.documents[document.id] = document
        return document

    async def list_documents(self, **kwargs):
        documents = [
            document
            for document in self.documents.values()
            if kwargs.get("status") is None or document.status == kwargs["status"]
        ]
        return documents, len(documents)

    async def get_document(self, document_id):
        document = self.documents.get(document_id)
        if document is not None and document.status == "deleted":
            return None
        return document

    async def update_document(self, document_id, **params):
        document = self.documents[document_id]
        for key, value in params.items():
            setattr(document, key, value)
        document.updated_at = datetime(2026, 1, 2)
        return document

    async def get_preview_url(self, document_id, *, expires_in=3600):
        document = self.documents[document_id]
        url = document.file_url
        return {
            "document_id": document_id,
            "url": url,
            "temp_url": url,
            "preview_url": url,
            "expires_in": expires_in,
            "storage_provider": document.storage_provider,
            "mime_type": document.mime_type,
            "file_name": document.original_filename,
        }

    async def get_stream_document(self, document_id):
        return self.documents[document_id]

    async def archive_to_patient(self, *, document_id, patient_id, requested_by=None, create_extraction_job=True):
        document = self.documents[document_id]
        document.patient_id = patient_id
        document.status = "archived"
        document.archived_at = datetime(2026, 1, 3)
        return document

    async def unarchive_document(self, document_id):
        document = self.documents[document_id]
        document.patient_id = None
        document.status = "uploaded"
        document.archived_at = None
        return document

    async def delete_document(self, document_id):
        self.documents[document_id].status = "deleted"


def test_document_upload_archive_unarchive_and_delete_flow():
    fake_service = FakeDocumentService()
    app.dependency_overrides[get_document_service] = lambda: fake_service

    upload_response = client.post(
        "/api/v1/documents",
        files={"file": ("report.pdf", b"fake pdf", "application/pdf")},
    )

    assert upload_response.status_code == 201
    created = upload_response.json()
    document_id = created["id"]
    assert created["original_filename"] == "report.pdf"
    assert created["file_size"] == 8

    list_response = client.get("/api/v1/documents", params={"page": 1, "page_size": 10})
    assert list_response.status_code == 200
    listed = list_response.json()
    assert listed["total"] == 1
    assert listed["items"][0]["id"] == document_id

    detail_response = client.get(f"/api/v1/documents/{document_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["status"] == "uploaded"

    preview_response = client.get(f"/api/v1/documents/{document_id}/preview-url", params={"expires_in": 600})
    assert preview_response.status_code == 200
    assert preview_response.json()["temp_url"].startswith("https://cinocore-eacy.")
    assert preview_response.json()["expires_in"] == 600

    update_response = client.patch(
        f"/api/v1/documents/{document_id}",
        json={"doc_type": "lab_report", "doc_title": "Admission Labs"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["doc_type"] == "lab_report"

    archive_response = client.post(
        f"/api/v1/documents/{document_id}/archive",
        json={"patient_id": "patient-1", "create_extraction_job": False},
    )
    assert archive_response.status_code == 200
    assert archive_response.json()["status"] == "archived"
    assert archive_response.json()["patient_id"] == "patient-1"

    unarchive_response = client.post(f"/api/v1/documents/{document_id}/unarchive")
    assert unarchive_response.status_code == 200
    assert unarchive_response.json()["status"] == "uploaded"
    assert unarchive_response.json()["patient_id"] is None

    delete_response = client.delete(f"/api/v1/documents/{document_id}")
    assert delete_response.status_code == 204

    missing_response = client.get(f"/api/v1/documents/{document_id}")
    assert missing_response.status_code == 404

    app.dependency_overrides.clear()


def test_document_preview_uses_oss_url_flow():
    fake_service = FakeDocumentService()
    app.dependency_overrides[get_document_service] = lambda: fake_service

    try:
        upload_response = client.post(
            "/api/v1/documents",
            files={"file": ("image.jpg", b"fake jpg", "image/jpeg")},
        )
        document_id = upload_response.json()["id"]
        fake_service.documents[document_id].mime_type = "image/jpeg"

        preview_response = client.get(f"/api/v1/documents/{document_id}/preview-url")
        assert preview_response.status_code == 200
        assert preview_response.json()["temp_url"].startswith("https://cinocore-eacy.")

        stream_response = client.get(f"/api/v1/documents/{document_id}/stream", follow_redirects=False)
        assert stream_response.status_code == 302
        assert stream_response.headers["location"].startswith("https://cinocore-eacy.")
    finally:
        app.dependency_overrides.clear()
