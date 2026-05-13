from sqlalchemy import func, select, update
from sqlalchemy.orm import load_only

from app.models import Document, FieldValueEvidence
from core.db import session
from core.repository.base import BaseRepo


class DocumentRepository(BaseRepo[Document]):
    def __init__(self):
        super().__init__(Document)

    async def list_by_patient(self, patient_id: str, *, limit: int = 100, uploaded_by: str | None = None) -> list[Document]:
        query = (
            select(Document)
            .where(Document.patient_id == patient_id)
            .where(Document.status != "deleted")
        )
        if uploaded_by is not None:
            query = query.where(Document.uploaded_by == uploaded_by)
        query = (
            query
            .order_by(Document.created_at.desc())
            .limit(limit)
        )
        result = await session.execute(query)
        return list(result.scalars().all())

    async def list_unarchived(self, *, limit: int = 100, uploaded_by: str | None = None) -> list[Document]:
        query = (
            select(Document)
            .where(Document.patient_id.is_(None))
            .where(Document.status != "deleted")
        )
        if uploaded_by is not None:
            query = query.where(Document.uploaded_by == uploaded_by)
        query = (
            query
            .order_by(Document.created_at.desc())
            .limit(limit)
        )
        result = await session.execute(query)
        return list(result.scalars().all())

    async def list_visible_documents(self, *, uploaded_by: str | None = None) -> list[Document]:
        query = select(Document).where(Document.status != "deleted")
        if uploaded_by is not None:
            query = query.where(Document.uploaded_by == uploaded_by)
        query = query.options(
            load_only(
                Document.id,
                Document.original_filename,
                Document.status,
                Document.ocr_status,
                Document.meta_status,
                Document.metadata_json,
                Document.doc_type,
                Document.doc_subtype,
                Document.doc_title,
                Document.effective_at,
                Document.patient_id,
                Document.uploaded_by,
                Document.archived_at,
                Document.created_at,
                Document.updated_at,
            )
        ).order_by(Document.created_at.desc())
        result = await session.execute(query)
        return list(result.scalars().all())

    async def list_documents(
        self,
        *,
        offset: int = 0,
        limit: int = 20,
        patient_id: str | None = None,
        status: str | None = None,
        uploaded_by: str | None = None,
    ) -> list[Document]:
        query = select(Document)
        if uploaded_by is not None:
            query = query.where(Document.uploaded_by == uploaded_by)
        if patient_id is not None:
            query = query.where(Document.patient_id == patient_id)
        if status is not None:
            statuses = [item.strip() for item in str(status).split(",") if item.strip()]
            if len(statuses) > 1:
                query = query.where(Document.status.in_(statuses))
            elif statuses:
                query = query.where(Document.status == statuses[0])
        else:
            query = query.where(Document.status != "deleted")

        query = query.options(
            load_only(
                Document.id,
                Document.file_name,
                Document.file_type,
                Document.patient_id,
                Document.original_filename,
                Document.file_ext,
                Document.mime_type,
                Document.file_size,
                Document.storage_provider,
                Document.storage_path,
                Document.file_url,
                Document.status,
                Document.ocr_status,
                Document.meta_status,
                Document.metadata_json,
                Document.doc_type,
                Document.doc_subtype,
                Document.doc_title,
                Document.effective_at,
                Document.uploaded_by,
                Document.archived_at,
                Document.created_at,
                Document.updated_at,
            )
        ).order_by(Document.created_at.desc()).offset(offset).limit(limit)
        result = await session.execute(query)
        return list(result.scalars().all())

    async def list_by_ids_light(self, document_ids: list[str], *, uploaded_by: str | None = None) -> list[Document]:
        if not document_ids:
            return []
        query = (
            select(Document)
            .where(Document.id.in_(document_ids))
            .where(Document.status != "deleted")
            .options(
                load_only(
                    Document.id,
                    Document.file_name,
                    Document.file_type,
                    Document.patient_id,
                    Document.original_filename,
                    Document.file_ext,
                    Document.mime_type,
                    Document.file_size,
                    Document.storage_provider,
                    Document.storage_path,
                    Document.file_url,
                    Document.status,
                    Document.ocr_status,
                    Document.meta_status,
                    Document.metadata_json,
                    Document.doc_type,
                    Document.doc_subtype,
                    Document.doc_title,
                    Document.effective_at,
                    Document.uploaded_by,
                    Document.archived_at,
                    Document.created_at,
                    Document.updated_at,
                )
            )
        )
        if uploaded_by is not None:
            query = query.where(Document.uploaded_by == uploaded_by)
        result = await session.execute(query)
        documents = list(result.scalars().all())
        order = {document_id: index for index, document_id in enumerate(document_ids)}
        return sorted(documents, key=lambda document: order.get(str(document.id), len(order)))

    async def count_by_patients(
        self,
        patient_ids: list[str],
        *,
        uploaded_by: str | None = None,
    ) -> dict[str, int]:
        """批量按 patient_id 统计各患者的可见文档数量（排除已删除）。"""
        if not patient_ids:
            return {}
        query = (
            select(Document.patient_id, func.count(Document.id))
            .where(Document.patient_id.in_(patient_ids))
            .where(Document.status != "deleted")
        )
        if uploaded_by is not None:
            query = query.where(Document.uploaded_by == uploaded_by)
        query = query.group_by(Document.patient_id)
        result = await session.execute(query)
        return {str(patient_id): int(count) for patient_id, count in result.all()}

    async def count_documents(
        self,
        *,
        patient_id: str | None = None,
        status: str | None = None,
        uploaded_by: str | None = None,
    ) -> int:
        query = select(func.count()).select_from(Document)
        if uploaded_by is not None:
            query = query.where(Document.uploaded_by == uploaded_by)
        if patient_id is not None:
            query = query.where(Document.patient_id == patient_id)
        if status is not None:
            statuses = [item.strip() for item in str(status).split(",") if item.strip()]
            if len(statuses) > 1:
                query = query.where(Document.status.in_(statuses))
            elif statuses:
                query = query.where(Document.status == statuses[0])
        else:
            query = query.where(Document.status != "deleted")

        result = await session.execute(query)
        return int(result.scalar_one())

    async def get_visible_by_id(self, document_id: str, *, uploaded_by: str | None = None) -> Document | None:
        query = select(Document).where(Document.id == document_id).where(Document.status != "deleted")
        if uploaded_by is not None:
            query = query.where(Document.uploaded_by == uploaded_by)
        result = await session.execute(query)
        return result.scalars().first()

    async def soft_delete_by_patient(self, patient_id: str, *, uploaded_by: str | None = None) -> int:
        query = (
            update(Document)
            .where(Document.patient_id == patient_id)
            .where(Document.status != "deleted")
            .values(status="deleted")
        )
        if uploaded_by is not None:
            query = query.where(Document.uploaded_by == uploaded_by)
        result = await session.execute(query)
        return int(result.rowcount or 0)

    async def has_evidence(self, document_id: str) -> bool:
        query = select(FieldValueEvidence.id).where(FieldValueEvidence.document_id == document_id).limit(1)
        result = await session.execute(query)
        return result.scalar_one_or_none() is not None
