from .common import *

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


def test_document_match_info_flow():
    fake_service = FakeDocumentService()
    app.dependency_overrides[get_document_service] = lambda: fake_service

    try:
        upload_response = client.post(
            "/api/v1/documents",
            files={"file": ("report.pdf", b"fake pdf", "application/pdf")},
        )
        document_id = upload_response.json()["id"]

        match_response = client.get(f"/api/v1/documents/{document_id}/match-info")
        assert match_response.status_code == 200
        payload = match_response.json()
        assert payload["document_id"] == document_id
        assert payload["match_result"] == "new"
        assert payload["extracted_info"]["name"] == "张三"

        refresh_response = client.post(f"/api/v1/documents/{document_id}/match-info/refresh")
        assert refresh_response.status_code == 200
        assert refresh_response.json()["document_id"] == document_id
    finally:
        app.dependency_overrides.clear()
