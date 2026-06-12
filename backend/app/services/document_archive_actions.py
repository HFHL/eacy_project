from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException, status

from app.models import Document
from app.services.document_service_runtime import document_service_session
from app.services.extraction_strategy import with_default_extraction_strategy
from core.db import Transactional


class DocumentArchiveActionsMixin:
    async def archive_group_to_patient(
        self,
        *,
        group_id: str,
        patient_id: str,
        requested_by: str | None = None,
        create_extraction_job: bool = True,
    ) -> list[Document]:
        group_payload = await self.get_archive_group_documents(group_id, uploaded_by=requested_by)
        document_ids = [document.id for document in group_payload["items"]]
        if not document_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Group has no archivable documents")
        return await self.batch_archive_to_patient(
            document_ids=document_ids,
            patient_id=patient_id,
            requested_by=requested_by,
            create_extraction_job=create_extraction_job,
        )

    @Transactional()
    async def archive_to_patient(
        self,
        *,
        document_id: str,
        patient_id: str,
        requested_by: str | None = None,
        create_extraction_job: bool = True,
    ) -> Document:
        document = await self.get_document(document_id, uploaded_by=requested_by)
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

        patient = await self.patient_repository.get_active_by_id(patient_id, owner_id=requested_by)
        if patient is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

        document.patient_id = patient_id
        document.status = "archived"
        document.archived_at = datetime.utcnow()
        document.updated_at = datetime.utcnow()
        document = await self.document_repository.save(document)
        await self.invalidate_archive_tree_cache(requested_by)

        schema_version = await self.schema_service.get_latest_published("ehr")
        if schema_version is not None:
            context = await self.ehr_service.get_or_create_patient_ehr_context(
                patient_id=patient_id,
                schema_version=schema_version,
                created_by=requested_by,
            )
            if create_extraction_job:
                session = document_service_session()
                job = await self.extraction_job_repository.create(
                    {
                        "job_type": "patient_ehr",
                        "status": "pending",
                        "priority": 0,
                        "patient_id": patient_id,
                        "document_id": document.id,
                        "context_id": context.id,
                        "schema_version_id": schema_version.id,
                        "input_json": with_default_extraction_strategy(
                            job_type="patient_ehr",
                            input_json={"source": "document_archive"},
                        ),
                        "progress": 0,
                        "requested_by": requested_by,
                    }
                )
                await session.commit()
                await self._enqueue_extraction_task(job.id)

        return document

    @Transactional()
    async def batch_archive_to_patient(
        self,
        *,
        document_ids: list[str],
        patient_id: str,
        requested_by: str | None = None,
        create_extraction_job: bool = True,
    ) -> list[Document]:
        if len(set(document_ids)) != len(document_ids):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Duplicate document ids are not allowed")

        patient = await self.patient_repository.get_active_by_id(patient_id, owner_id=requested_by)
        if patient is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

        documents: list[Document] = []
        for document_id in document_ids:
            document = await self.get_document(document_id, uploaded_by=requested_by)
            if document is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Document not found: {document_id}")
            documents.append(document)

        schema_version = await self.schema_service.get_latest_published("ehr")
        context = None
        if schema_version is not None:
            context = await self.ehr_service.get_or_create_patient_ehr_context(
                patient_id=patient_id,
                schema_version=schema_version,
                created_by=requested_by,
            )

        archived_documents: list[Document] = []
        extraction_job_ids: list[str] = []
        now = datetime.utcnow()
        for document in documents:
            document.patient_id = patient_id
            document.status = "archived"
            document.archived_at = now
            document.updated_at = now
            document = await self.document_repository.save(document)
            archived_documents.append(document)

            if schema_version is not None and context is not None and create_extraction_job:
                job = await self.extraction_job_repository.create(
                    {
                        "job_type": "patient_ehr",
                        "status": "pending",
                        "priority": 0,
                        "patient_id": patient_id,
                        "document_id": document.id,
                        "context_id": context.id,
                        "schema_version_id": schema_version.id,
                        "input_json": with_default_extraction_strategy(
                            job_type="patient_ehr",
                            input_json={"source": "document_batch_archive"},
                        ),
                        "progress": 0,
                        "requested_by": requested_by,
                    }
                )
                extraction_job_ids.append(job.id)

        if extraction_job_ids:
            session = document_service_session()
            await session.commit()
            for job_id in extraction_job_ids:
                await self._enqueue_extraction_task(job_id)

        await self.invalidate_archive_tree_cache(requested_by)
        return archived_documents

    @Transactional()
    async def unarchive_document(self, document_id: str, *, requested_by: str | None = None) -> Document:
        document = await self.get_document(document_id, uploaded_by=requested_by)
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

        document.patient_id = None
        document.status = "uploaded"
        document.archived_at = None
        document.updated_at = datetime.utcnow()
        document = await self.document_repository.save(document)
        await self.invalidate_archive_tree_cache(requested_by)
        return document

    @Transactional()
    async def delete_document(self, document_id: str, *, requested_by: str | None = None) -> None:
        document = await self.get_document(document_id, uploaded_by=requested_by)
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文档不存在")

        document.status = "deleted"
        document.updated_at = datetime.utcnow()
        await self.document_repository.save(document)
        await self.invalidate_archive_tree_cache(requested_by)

    async def list_patient_documents(self, patient_id: str, *, limit: int = 100, uploaded_by: str | None = None) -> list[Document]:
        return await self.document_repository.list_by_patient(patient_id, limit=limit, uploaded_by=uploaded_by)
