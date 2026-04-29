from sqlalchemy import func, select, update

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
        query = query.order_by(Document.created_at.desc())
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
            query = query.where(Document.status == status)
        else:
            query = query.where(Document.status != "deleted")

        query = query.order_by(Document.created_at.desc()).offset(offset).limit(limit)
        result = await session.execute(query)
        return list(result.scalars().all())

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
            query = query.where(Document.status == status)
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
