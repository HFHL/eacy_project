from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api.v1.documents.router import get_document_metadata_service, get_document_service
from app.server import app


client = TestClient(app)


@pytest.fixture(autouse=True)
def isolate_document_repository_helpers(monkeypatch):
    async def empty_extract_status_map(_documents):
        return {}

    async def empty_bound_patient_map(_documents, *, owner_id=None):
        return {}

    async def empty_extraction_records(_document_id):
        return []

    async def empty_linked_patients(_document, *, owner_id=None):
        return []

    monkeypatch.setattr("app.api.v1.documents.router.build_extract_status_map", empty_extract_status_map)
    monkeypatch.setattr("app.api.v1.documents.router.build_bound_patient_map", empty_bound_patient_map)
    monkeypatch.setattr("app.api.v1.documents.router.build_extraction_records", empty_extraction_records)
    monkeypatch.setattr("app.api.v1.documents.router.build_linked_patients", empty_linked_patients)


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

    async def get_document(self, document_id, **_kwargs):
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

    async def get_preview_url(self, document_id, *, expires_in=3600, **_kwargs):
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

    async def get_stream_document(self, document_id, **_kwargs):
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

    async def get_archive_tree(self, **_kwargs):
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

    async def get_archive_counts(self, **_kwargs):
        tree = await self.get_archive_tree()
        return tree["counts"]

    async def get_archive_group_documents(self, group_id, **_kwargs):
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

    async def get_document_match_info(self, document_id, *, uploaded_by=None):
        documents = [document for document in self.documents.values() if document.status != "deleted" and document.status != "archived"]
        return {
            "document_id": document_id,
            "group_id": "group_fake" if documents else None,
            "document_metadata": {},
            "extracted_info": {"name": "张三", "patient_name": "张三"},
            "matched_patient_id": None,
            "match_score": 0,
            "confidence": 0,
            "match_result": "new",
            "candidates": [],
            "ai_recommendation": None,
            "ai_reason": "未匹配到现有患者，建议新建档",
        }

    async def refresh_document_match_info(self, document_id, *, uploaded_by=None):
        return await self.get_document_match_info(document_id, uploaded_by=uploaded_by)

    async def list_documents_by_ids(self, document_ids, **_kwargs):
        return [self.documents[document_id] for document_id in document_ids if document_id in self.documents]

    async def unarchive_document(self, document_id, **_kwargs):
        document = self.documents[document_id]
        document.patient_id = None
        document.status = "uploaded"
        document.archived_at = None
        return document

    async def delete_document(self, document_id, **_kwargs):
        self.documents[document_id].status = "deleted"

    async def queue_document_metadata(self, document_id, **_kwargs):
        document = self.documents[document_id]
        document.meta_status = "queued"
        document.updated_at = datetime(2026, 1, 4)
        return document
