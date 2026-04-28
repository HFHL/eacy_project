import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile, status

from app.integrations.textin_ocr import TextInOcrClient
from app.models import Document
from app.repositories import DocumentRepository, ExtractionJobRepository, PatientRepository
from app.services.ocr_payload_normalizer import normalize_textin_ocr_payload
from app.services.ehr_service import EhrService
from app.services.schema_service import SchemaService
from app.storage.document_storage import AliyunOssDocumentStorage, DocumentStorage, build_document_storage
from core.config import config
from core.db import Transactional, session


class DocumentService:
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
        if storage_backend is not None:
            self.storage_backend = storage_backend
        else:
            self.storage_backend = build_document_storage()
        self.ocr_auto_enqueue = config.DOCUMENT_OCR_AUTO_ENQUEUE if ocr_auto_enqueue is None else ocr_auto_enqueue

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
                patient = await self.patient_repository.get_active_by_id(patient_id)
                if patient is None:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

            original_filename = Path(file.filename or "upload.bin").name
            file_ext = Path(original_filename).suffix.lower()[:20] or None
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
        except Exception:
            await session.rollback()
            raise

        if should_enqueue_ocr:
            self._enqueue_ocr_task(document.id)
        return document

    async def get_document(self, document_id: str) -> Document | None:
        return await self.document_repository.get_visible_by_id(document_id)

    async def get_preview_url(self, document_id: str, *, expires_in: int = 3600) -> dict[str, Any]:
        document = await self.get_document(document_id)
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

        provider = (document.storage_provider or "oss").lower()
        if provider == "oss":
            preview_url = self._get_oss_preview_url(document, expires_in=expires_in)
        else:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Document is not stored in OSS")

        return {
            "document_id": document.id,
            "url": preview_url,
            "temp_url": preview_url,
            "preview_url": preview_url,
            "expires_in": expires_in,
            "storage_provider": document.storage_provider,
            "mime_type": document.mime_type,
            "file_name": document.original_filename,
        }

    async def get_stream_document(self, document_id: str) -> Document:
        document = await self.get_document(document_id)
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        return document

    def _get_oss_preview_url(self, document: Document, *, expires_in: int = 3600) -> str:
        if isinstance(self.storage_backend, AliyunOssDocumentStorage):
            return self.storage_backend.get_signed_url(document.storage_path, expires_in=expires_in)
        if config.OSS_ACCESS_KEY_ID and config.OSS_ACCESS_KEY_SECRET and config.OSS_BUCKET_NAME and config.OSS_ENDPOINT:
            return AliyunOssDocumentStorage(
                access_key_id=config.OSS_ACCESS_KEY_ID,
                access_key_secret=config.OSS_ACCESS_KEY_SECRET,
                bucket_name=config.OSS_BUCKET_NAME,
                endpoint=config.OSS_ENDPOINT,
                base_prefix=config.OSS_BASE_PREFIX,
                public_base_url=config.OSS_PUBLIC_BASE_URL,
            ).get_signed_url(document.storage_path, expires_in=expires_in)
        if document.file_url:
            return document.file_url
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document preview URL not available")

    async def list_documents(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        patient_id: str | None = None,
        status: str | None = None,
    ) -> tuple[list[Document], int]:
        offset = (page - 1) * page_size
        documents = await self.document_repository.list_documents(
            offset=offset,
            limit=page_size,
            patient_id=patient_id,
            status=status,
        )
        total = await self.document_repository.count_documents(patient_id=patient_id, status=status)
        return documents, total

    @Transactional()
    async def update_document(self, document_id: str, **params: Any) -> Document:
        document = await self.get_document(document_id)
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

        for key, value in params.items():
            setattr(document, key, value)
        document.updated_at = datetime.utcnow()
        return await self.document_repository.save(document)

    def _enqueue_ocr_task(self, document_id: str) -> None:
        from app.workers.celery_app import OCR_QUEUE, OCR_TASK_NAME, celery_app

        celery_app.send_task(
            OCR_TASK_NAME,
            args=[document_id],
            queue=OCR_QUEUE,
            routing_key=OCR_QUEUE,
        )

    async def queue_document_ocr(self, document_id: str) -> Document:
        try:
            document = await self.get_document(document_id)
            if document is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
            if document.ocr_status == "running":
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Document OCR is already running")

            document.ocr_status = "queued"
            document.status = "ocr_pending"
            document.updated_at = datetime.utcnow()
            document = await self.document_repository.save(document)
            await session.commit()
        except Exception:
            await session.rollback()
            raise

        self._enqueue_ocr_task(document.id)
        return document

    async def process_document_ocr(self, document_id: str) -> Document:
        document = await self.update_document(
            document_id,
            ocr_status="running",
            status="ocr_pending",
            ocr_payload_json={
                "provider": "textin",
                "errors": [],
                "request": {"document_id": document_id},
            },
        )

        try:
            preview = await self.get_preview_url(document_id, expires_in=3600)
            request_snapshot = {
                "api_url": config.TEXTIN_API_URL,
                "document_id": document_id,
                "file_name": document.original_filename,
                "mime_type": document.mime_type,
                "source": "document_preview_url",
            }
            raw_response = await TextInOcrClient().parse_document_url(
                preview["temp_url"],
                filename=document.original_filename,
                mime_type=document.mime_type,
            )
            payload = normalize_textin_ocr_payload(raw_response, request_snapshot=request_snapshot)
            return await self.update_document(
                document_id,
                ocr_status="completed",
                status="ocr_completed",
                ocr_text=payload.get("markdown") or "",
                ocr_payload_json=payload,
            )
        except Exception as exc:
            failed_payload = {
                "provider": "textin",
                "request": {
                    "api_url": config.TEXTIN_API_URL,
                    "document_id": document_id,
                    "file_name": document.original_filename,
                    "mime_type": document.mime_type,
                },
                "errors": [{"message": str(exc), "type": exc.__class__.__name__}],
            }
            return await self.update_document(
                document_id,
                ocr_status="failed",
                status="failed",
                ocr_payload_json=failed_payload,
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
        document = await self.get_document(document_id)
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

        patient = await self.patient_repository.get_active_by_id(patient_id)
        if patient is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

        document.patient_id = patient_id
        document.status = "archived"
        document.archived_at = datetime.utcnow()
        document.updated_at = datetime.utcnow()
        document = await self.document_repository.save(document)

        schema_version = await self.schema_service.get_latest_published("ehr")
        if schema_version is not None:
            context = await self.ehr_service.get_or_create_patient_ehr_context(
                patient_id=patient_id,
                schema_version=schema_version,
                created_by=requested_by,
            )
            if create_extraction_job:
                await self.extraction_job_repository.create(
                    {
                        "job_type": "patient_ehr",
                        "status": "pending",
                        "priority": 0,
                        "patient_id": patient_id,
                        "document_id": document.id,
                        "context_id": context.id,
                        "schema_version_id": schema_version.id,
                        "input_json": {"source": "document_archive"},
                        "progress": 0,
                        "requested_by": requested_by,
                    }
                )

        return document

    @Transactional()
    async def unarchive_document(self, document_id: str) -> Document:
        document = await self.get_document(document_id)
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

        document.patient_id = None
        document.status = "uploaded"
        document.archived_at = None
        document.updated_at = datetime.utcnow()
        return await self.document_repository.save(document)

    @Transactional()
    async def delete_document(self, document_id: str) -> None:
        document = await self.get_document(document_id)
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

        if await self.document_repository.has_evidence(document_id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Document is used as field evidence and cannot be deleted",
            )

        document.status = "deleted"
        document.updated_at = datetime.utcnow()
        await self.document_repository.save(document)

    async def list_patient_documents(self, patient_id: str, *, limit: int = 100) -> list[Document]:
        return await self.document_repository.list_by_patient(patient_id, limit=limit)
