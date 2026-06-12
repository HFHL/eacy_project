from .common import *

def test_document_upload_archive_unarchive_and_delete_flow():
    fake_service = FakeDocumentService()
    app.dependency_overrides[get_document_service] = lambda: fake_service
    app.dependency_overrides[get_document_metadata_service] = lambda: fake_service

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

    metadata_response = client.post(f"/api/v1/documents/{document_id}/metadata")
    assert metadata_response.status_code == 202
    assert metadata_response.json()["meta_status"] == "queued"

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


class FakeHttpxStreamResponse:
    def raise_for_status(self):
        return None

    async def aiter_bytes(self):
        yield b"fake image body"


class FakeHttpxStreamContext:
    async def __aenter__(self):
        return FakeHttpxStreamResponse()

    async def __aexit__(self, exc_type, exc, tb):
        return False


class FakeAsyncClient:
    def __init__(self, **_kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    def stream(self, method, url):
        assert method == "GET"
        assert url.startswith("https://cinocore-eacy.")
        return FakeHttpxStreamContext()


def test_document_preview_uses_oss_url_flow(monkeypatch):
    fake_service = FakeDocumentService()
    app.dependency_overrides[get_document_service] = lambda: fake_service
    monkeypatch.setattr("app.api.v1.documents.router.httpx.AsyncClient", FakeAsyncClient)

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
        assert stream_response.status_code == 200
        assert stream_response.content == b"fake image body"
    finally:
        app.dependency_overrides.clear()
