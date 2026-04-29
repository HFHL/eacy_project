from datetime import datetime
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api.v1.documents.router import get_document_metadata_service, get_document_service
from app.server import app


client = TestClient(app)


class FakeDocumentService:
    def __init__(self):
        self.documents = {}

    async def upload_document(self, *, file, patient_id=None, uploaded_by=None):
        content = await file.read()
        document_id = f"document-{len(self.documents) + 1}"
        document = SimpleNamespace(
            id=document_id,
            patient_id=patient_id,
            original_filename=file.filename,
            file_ext=".pdf",
            mime_type=file.content_type,
            file_size=len(content),
            storage_provider="oss",
            storage_path=f"documents/2026/04/{document_id}.pdf",
            file_url=f"https://cinocore-eacy.oss-cn-shanghai.aliyuncs.com/documents/2026/04/{document_id}.pdf",
            status="uploaded" if patient_id is None else "archived",
            ocr_status="pending",
            ocr_text=None,
            ocr_payload_json=None,
            parsed_content=None,
            parsed_data=None,
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

    async def batch_archive_to_patient(self, *, document_ids, patient_id, requested_by=None, create_extraction_job=True):
        archived_documents = []
        for document_id in document_ids:
            document = await self.archive_to_patient(
                document_id=document_id,
                patient_id=patient_id,
                requested_by=requested_by,
                create_extraction_job=create_extraction_job,
            )
            archived_documents.append(document)
        return archived_documents

    async def get_archive_tree(self):
        active_documents = [document for document in self.documents.values() if document.status != "deleted" and document.status != "archived"]
        archived_documents = [document for document in self.documents.values() if document.status == "archived"]
        todo_groups = []
        if active_documents:
            todo_groups.append({
                "group_id": "group_fake",
                "label": {"name": "张三", "gender": "男", "age": "42"},
                "count": len(active_documents),
                "document_ids": [document.id for document in active_documents],
                "status_set": ["pending_confirm_new"],
                "matched_patient_id": None,
            })
        return {
            "total": len(self.documents),
            "counts": {
                "parse_total": 0,
                "todo_total": len(active_documents),
                "archived_total": len(archived_documents),
            },
            "todo_groups": todo_groups,
            "archived_patients": [],
        }

    async def get_archive_group_documents(self, group_id):
        documents = [document for document in self.documents.values() if document.status != "deleted" and document.status != "archived"]
        return {
            "items": documents,
            "group": {"group_id": group_id, "display_name": "张三", "status": "new_patient_candidate", "confidence": "medium"},
            "match_info": {
                "matched_patient_id": None,
                "match_score": 0,
                "match_result": "new",
                "candidates": [],
                "ai_recommendation": None,
                "ai_reason": "未匹配到现有患者，建议新建档",
            },
            "pagination": {"page": 1, "page_size": len(documents), "total": len(documents), "total_pages": 1},
        }

    async def archive_group_to_patient(self, *, group_id, patient_id, requested_by=None, create_extraction_job=True):
        group_payload = await self.get_archive_group_documents(group_id)
        return await self.batch_archive_to_patient(
            document_ids=[document.id for document in group_payload["items"]],
            patient_id=patient_id,
            requested_by=requested_by,
            create_extraction_job=create_extraction_job,
        )

    async def unarchive_document(self, document_id):
        document = self.documents[document_id]
        document.patient_id = None
        document.status = "uploaded"
        document.archived_at = None
        return document

    async def delete_document(self, document_id):
        self.documents[document_id].status = "deleted"

    async def queue_document_metadata(self, document_id):
        document = self.documents[document_id]
        document.meta_status = "queued"
        document.updated_at = datetime(2026, 1, 4)
        return document


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


def test_document_batch_archive_flow():
    fake_service = FakeDocumentService()
    app.dependency_overrides[get_document_service] = lambda: fake_service

    try:
        first_upload_response = client.post(
            "/api/v1/documents",
            files={"file": ("first.pdf", b"first pdf", "application/pdf")},
        )
        second_upload_response = client.post(
            "/api/v1/documents",
            files={"file": ("second.pdf", b"second pdf", "application/pdf")},
        )
        document_ids = [first_upload_response.json()["id"], second_upload_response.json()["id"]]

        archive_response = client.post(
            "/api/v1/documents/batch-archive",
            json={
                "document_ids": document_ids,
                "patient_id": "patient-1",
                "create_extraction_job": False,
            },
        )

        assert archive_response.status_code == 200
        archived = archive_response.json()
        assert archived["total"] == 2
        assert [item["id"] for item in archived["items"]] == document_ids
        assert {item["status"] for item in archived["items"]} == {"archived"}
        assert {item["patient_id"] for item in archived["items"]} == {"patient-1"}
    finally:
        app.dependency_overrides.clear()


def test_document_archive_group_flow():
    fake_service = FakeDocumentService()
    app.dependency_overrides[get_document_service] = lambda: fake_service

    try:
        client.post(
            "/api/v1/documents",
            files={"file": ("first.pdf", b"first pdf", "application/pdf")},
        )
        client.post(
            "/api/v1/documents",
            files={"file": ("second.pdf", b"second pdf", "application/pdf")},
        )

        tree_response = client.get("/api/v1/documents/v2/tree")
        assert tree_response.status_code == 200
        tree = tree_response.json()
        assert tree["counts"]["todo_total"] == 2
        assert tree["todo_groups"][0]["group_id"] == "group_fake"

        group_response = client.get("/api/v1/documents/v2/groups/group_fake/documents")
        assert group_response.status_code == 200
        assert group_response.json()["match_info"]["match_result"] == "new"
        assert len(group_response.json()["items"]) == 2

        archive_response = client.post(
            "/api/v1/documents/v2/groups/group_fake/confirm-archive",
            params={"patient_id": "patient-1", "auto_merge_ehr": False},
        )
        assert archive_response.status_code == 200
        assert archive_response.json()["archived_count"] == 2
        assert all(document.status == "archived" for document in fake_service.documents.values())
    finally:
        app.dependency_overrides.clear()
