import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile, status

from app.core.auth import CurrentUser, uuid_user_id_or_none
from app.integrations.textin_ocr import TextInOcrClient, build_textin_api_url  # re-exported for tests/patching
from app.models import Document
from app.repositories import DocumentRepository, ExtractionJobRepository, PatientRepository
from app.services.document_archive_actions import DocumentArchiveActionsMixin
from app.services.document_archive_tree import DocumentArchiveTreeMixin
from app.services.document_extraction_queue import DocumentExtractionQueueMixin
from app.services.document_ocr_service import DocumentOcrMixin
from app.services.document_preview_service import DocumentPreviewMixin
from app.services.document_upload_validation import read_upload_bytes, validate_upload_file
from app.services.ehr_service import EhrService
from app.services.schema_service import SchemaService
from app.storage.document_storage import DocumentStorage, build_document_storage
from core.config import config
from core.db import Transactional, session
from core.helpers.redis import redis_client


def document_user_scope(current_user: CurrentUser | None) -> str | None:
    if current_user is None:
        return None
    return uuid_user_id_or_none(current_user)


class DocumentService(
    DocumentArchiveActionsMixin,
    DocumentArchiveTreeMixin,
    DocumentExtractionQueueMixin,
    DocumentOcrMixin,
    DocumentPreviewMixin,
):
    def __init__(
        self,
        document_repository: DocumentRepository | None = None,
        patient_repository: PatientRepository | None = None,
        schema_service: SchemaService | None = None,
        ehr_service: EhrService | None = None,
        extraction_job_repository: ExtractionJobRepository | None = None,
        storage_backend: DocumentStorage | None = None,
        ocr_auto_enqueue: bool | None = None,
    ):
        self.document_repository = document_repository or DocumentRepository()
        self.patient_repository = patient_repository or PatientRepository()
        self.schema_service = schema_service or SchemaService()
        self.ehr_service = ehr_service or EhrService()
        self.extraction_job_repository = extraction_job_repository or ExtractionJobRepository()
        self.storage_backend = storage_backend or build_document_storage()
        self.ocr_auto_enqueue = config.DOCUMENT_OCR_AUTO_ENQUEUE if ocr_auto_enqueue is None else ocr_auto_enqueue

    @staticmethod
    def _archive_cache_key(uploaded_by: str | None) -> str:
        return f"documents:archive_tree:{uploaded_by or 'all'}"

    async def invalidate_archive_tree_cache(self, uploaded_by: str | None = None) -> None:
        try:
            await redis_client.delete(self._archive_cache_key(uploaded_by))
        except Exception:
            pass

    @staticmethod
    def _normalize_optional_uuid(value: str | None) -> str | None:
        if value is None:
            return None
        try:
            return str(uuid.UUID(str(value)))
        except (TypeError, ValueError, AttributeError):
            return None

    async def create_document(self, **params: Any) -> Document:
        return await self.document_repository.create(params)

    async def upload_document(
        self,
        *,
        file: UploadFile,
        patient_id: str | None = None,
        uploaded_by: str | None = None,
    ) -> Document:
        should_enqueue_ocr = self.ocr_auto_enqueue
        try:
            if patient_id is not None:
                patient = await self.patient_repository.get_active_by_id(
                    patient_id,
                    owner_id=self._normalize_optional_uuid(uploaded_by),
                )
                if patient is None:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

            original_filename = Path(file.filename or "upload.bin").name
            file_ext = Path(original_filename).suffix.lower()[:20] or None
            upload_bytes = await read_upload_bytes(file)
            validate_upload_file(
                filename=original_filename,
                content_type=file.content_type,
                size=len(upload_bytes),
            )
            stored_file = await self.storage_backend.save(
                file,
                original_filename=original_filename,
                file_ext=file_ext,
            )

            document = await self.document_repository.create(
                {
                    "file_name": original_filename,
                    "file_path": stored_file.path,
                    "file_type": file_ext or "",
                    "file_hash": stored_file.sha256,
                    "document_type": None,
                    "document_sub_type": None,
                    "is_parsed": False,
                    "parsed_content": None,
                    "parsed_data": {},
                    "patient_id": patient_id,
                    "original_filename": original_filename,
                    "file_ext": file_ext,
                    "mime_type": file.content_type,
                    "file_size": stored_file.size,
                    "storage_provider": stored_file.provider,
                    "storage_path": stored_file.path,
                    "file_url": stored_file.url,
                    "status": "ocr_pending" if should_enqueue_ocr else ("uploaded" if patient_id is None else "archived"),
                    "ocr_status": "queued" if should_enqueue_ocr else "pending",
                    "uploaded_by": self._normalize_optional_uuid(uploaded_by),
                    "archived_at": datetime.utcnow() if patient_id is not None else None,
                }
            )
            await session.commit()
            await self.invalidate_archive_tree_cache(uploaded_by)
        except Exception:
            await session.rollback()
            raise

        if should_enqueue_ocr:
            try:
                self._enqueue_ocr_task(document.id)
            except Exception as exc:
                document = await self._mark_ocr_enqueue_failed(document.id, exc, uploaded_by=uploaded_by)
        return document

    async def get_document(self, document_id: str, *, uploaded_by: str | None = None) -> Document | None:
        return await self.document_repository.get_visible_by_id(document_id, uploaded_by=uploaded_by)

    async def list_documents(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        patient_id: str | None = None,
        status: str | None = None,
        uploaded_by: str | None = None,
        tab: str | None = None,
        task_stage: str | None = None,
        keyword: str | None = None,
        document_types: str | None = None,
        date_from=None,
        date_to=None,
        order_by: str = "created_at",
        order_direction: str = "desc",
    ) -> tuple[list[Document], int]:
        from app.services.document_list_query import DocumentListQuery, parse_date_boundary

        list_query = DocumentListQuery(
            patient_id=patient_id,
            status=status,
            tab=tab,
            task_stage=task_stage,
            keyword=keyword,
            document_types=document_types,
            date_from=date_from if isinstance(date_from, datetime) else parse_date_boundary(date_from),
            date_to=date_to if isinstance(date_to, datetime) else parse_date_boundary(date_to, end_of_day=True),
            order_by=order_by,
            order_direction=order_direction,
            uploaded_by=uploaded_by,
        )
        offset = (page - 1) * page_size
        documents = await self.document_repository.list_documents(
            offset=offset,
            limit=page_size,
            list_query=list_query,
        )
        total = await self.document_repository.count_documents(list_query=list_query)
        return documents, total

    async def list_documents_by_ids(self, document_ids: list[str], *, uploaded_by: str | None = None) -> list[Document]:
        unique_ids = list(dict.fromkeys([str(document_id) for document_id in document_ids if document_id]))
        return await self.document_repository.list_by_ids_light(unique_ids, uploaded_by=uploaded_by)

    @Transactional()
    async def update_document(self, document_id: str, *, uploaded_by: str | None = None, **params: Any) -> Document:
        document = await self.get_document(document_id, uploaded_by=uploaded_by)
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

        for key, value in params.items():
            setattr(document, key, value)
        document.updated_at = datetime.utcnow()
        document = await self.document_repository.save(document)
        await self.invalidate_archive_tree_cache(getattr(document, "uploaded_by", None))
        return document
