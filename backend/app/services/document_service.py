import uuid
from datetime import datetime
import json
from pathlib import Path
from urllib.parse import quote
from typing import Any

from fastapi import HTTPException, UploadFile, status

from app.integrations.textin_ocr import TextInOcrClient, build_textin_api_url
from app.core.auth import CurrentUser, uuid_user_id_or_none
from app.models import Document
from app.repositories import DocumentRepository, ExtractionJobRepository, PatientRepository
from app.services.document_upload_validation import read_upload_bytes, validate_upload_file
from app.services.document_preview_utils import (
    document_uses_ocr_page_preview,
    find_ocr_page_storage_path,
    first_persisted_ocr_page_path,
    get_ocr_page_count,
)
from app.services.extraction_strategy import extraction_queue_for_job, with_default_extraction_strategy
from app.services.ocr_page_asset_service import OcrPageAssetService
from app.services.ocr_payload_normalizer import normalize_textin_ocr_payload
from app.services.archive_grouping_service import ArchiveGroupingService, extract_id_card_from_result, get_metadata_result, is_pending_process_document, parse_document_identity
from app.services.ehr_service import EhrService
from app.services.schema_service import SchemaService
from app.storage.document_storage import AliyunOssDocumentStorage, DocumentStorage, build_document_storage
from core.config import config
from core.db import Transactional, session
from core.helpers.redis import redis_client


def document_user_scope(current_user: CurrentUser | None) -> str | None:
    if current_user is None:
        return None
    return uuid_user_id_or_none(current_user)


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
                patient = await self.patient_repository.get_active_by_id(patient_id, owner_id=self._normalize_optional_uuid(uploaded_by))
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

    async def get_preview_url(
        self,
        document_id: str,
        *,
        expires_in: int = 3600,
        page_no: int | None = None,
        prefer_native: bool = False,
        uploaded_by: str | None = None,
    ) -> dict[str, Any]:
        document = await self.get_document(document_id, uploaded_by=uploaded_by)
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

        ocr_payload = document.ocr_payload_json if isinstance(document.ocr_payload_json, dict) else None
        uses_ocr_pages = document_uses_ocr_page_preview(document)
        ocr_page_count = get_ocr_page_count(ocr_payload) if uses_ocr_pages else 0

        if uses_ocr_pages and ocr_page_count > 0 and not prefer_native:
            resolved_page_no = page_no
            storage_path: str | None = None
            if resolved_page_no is not None:
                storage_path = find_ocr_page_storage_path(ocr_payload, resolved_page_no)
            else:
                first_page = first_persisted_ocr_page_path(ocr_payload)
                if first_page is not None:
                    resolved_page_no, storage_path = first_page

            if storage_path and resolved_page_no is not None:
                preview_url = self._get_oss_object_preview_url(
                    storage_path,
                    filename=f"page-{resolved_page_no}.jpg",
                    content_type="image/jpeg",
                    expires_in=expires_in,
                )
                return {
                    "document_id": document.id,
                    "url": preview_url,
                    "temp_url": preview_url,
                    "preview_url": preview_url,
                    "expires_in": expires_in,
                    "storage_provider": document.storage_provider,
                    "mime_type": "image/jpeg",
                    "file_name": document.original_filename,
                    "file_type": document.file_ext or document.file_type,
                    "preview_source": "ocr_page",
                    "page_no": resolved_page_no,
                    "ocr_page_count": ocr_page_count,
                }

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
            "file_type": document.file_ext or document.file_type,
            "preview_source": "native",
            "page_no": None,
            "ocr_page_count": ocr_page_count if uses_ocr_pages else None,
        }

    async def get_stream_document(self, document_id: str, *, uploaded_by: str | None = None) -> Document:
        document = await self.get_document(document_id, uploaded_by=uploaded_by)
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        return document

    def _get_oss_preview_url(self, document: Document, *, expires_in: int = 3600) -> str:
        filename = Path(document.original_filename or document.file_name or "document.pdf").name
        content_disposition = f"inline; filename*=UTF-8''{quote(filename, safe='')}"
        if isinstance(self.storage_backend, AliyunOssDocumentStorage):
            return self.storage_backend.get_signed_url(
                document.storage_path,
                expires_in=expires_in,
                response_content_disposition=content_disposition,
            )
        if config.OSS_ACCESS_KEY_ID and config.OSS_ACCESS_KEY_SECRET and config.OSS_BUCKET_NAME and config.OSS_ENDPOINT:
            return AliyunOssDocumentStorage(
                access_key_id=config.OSS_ACCESS_KEY_ID,
                access_key_secret=config.OSS_ACCESS_KEY_SECRET,
                bucket_name=config.OSS_BUCKET_NAME,
                endpoint=config.OSS_ENDPOINT,
                base_prefix=config.OSS_BASE_PREFIX,
                public_base_url=config.OSS_PUBLIC_BASE_URL,
            ).get_signed_url(
                document.storage_path,
                expires_in=expires_in,
                response_content_disposition=content_disposition,
            )
        if document.file_url:
            return document.file_url
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document preview URL not available")

    def _get_oss_object_preview_url(
        self,
        storage_path: str,
        *,
        filename: str,
        content_type: str,
        expires_in: int = 3600,
    ) -> str:
        content_disposition = f"inline; filename*=UTF-8''{quote(filename, safe='')}"
        if isinstance(self.storage_backend, AliyunOssDocumentStorage):
            return self.storage_backend.get_signed_url(
                storage_path,
                expires_in=expires_in,
                response_content_disposition=content_disposition,
            )
        if config.OSS_ACCESS_KEY_ID and config.OSS_ACCESS_KEY_SECRET and config.OSS_BUCKET_NAME and config.OSS_ENDPOINT:
            return AliyunOssDocumentStorage(
                access_key_id=config.OSS_ACCESS_KEY_ID,
                access_key_secret=config.OSS_ACCESS_KEY_SECRET,
                bucket_name=config.OSS_BUCKET_NAME,
                endpoint=config.OSS_ENDPOINT,
                base_prefix=config.OSS_BASE_PREFIX,
                public_base_url=config.OSS_PUBLIC_BASE_URL,
            ).get_signed_url(
                storage_path,
                expires_in=expires_in,
                response_content_disposition=content_disposition,
            )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document preview URL not available")

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

    def _enqueue_ocr_task(self, document_id: str) -> None:
        from app.workers.celery_app import OCR_QUEUE, OCR_TASK_NAME, celery_app

        celery_app.send_task(
            OCR_TASK_NAME,
            args=[document_id],
            queue=OCR_QUEUE,
            routing_key=OCR_QUEUE,
        )

    async def queue_document_ocr(self, document_id: str, *, requested_by: str | None = None) -> Document:
        try:
            document = await self.get_document(document_id, uploaded_by=requested_by)
            if document is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
            if document.ocr_status == "running":
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Document OCR is already running")

            document.ocr_status = "queued"
            document.status = "ocr_pending"
            document.updated_at = datetime.utcnow()
            document = await self.document_repository.save(document)
            await session.commit()
            await self.invalidate_archive_tree_cache(requested_by)
        except Exception:
            await session.rollback()
            raise

        try:
            self._enqueue_ocr_task(document.id)
        except Exception as exc:
            document = await self._mark_ocr_enqueue_failed(document.id, exc, uploaded_by=requested_by)
        return document

    async def _mark_ocr_enqueue_failed(self, document_id: str, exc: Exception, *, uploaded_by: str | None = None) -> Document:
        document = await self.get_document(document_id, uploaded_by=uploaded_by)
        if document is None:
            raise exc
        payload = {
            "provider": "textin",
            "request": {"document_id": document_id},
            "errors": [{"message": str(exc), "type": "EnqueueFailed"}],
        }
        return await self.update_document(
            document_id,
            uploaded_by=uploaded_by,
            ocr_status="failed",
            status="archived" if getattr(document, "patient_id", None) else "failed",
            ocr_payload_json=payload,
        )

    async def _record_ocr_postprocess_warning(self, document_id: str, stage: str, exc: Exception) -> Document | None:
        document = await self.get_document(document_id)
        if document is None:
            return None
        payload = dict(document.ocr_payload_json or {}) if isinstance(document.ocr_payload_json, dict) else {}
        warnings = list(payload.get("postprocess_warnings") or [])
        warnings.append(
            {
                "stage": stage,
                "type": exc.__class__.__name__,
                "message": str(exc),
                "created_at": datetime.utcnow().isoformat(),
            }
        )
        payload["postprocess_warnings"] = warnings[-10:]
        return await self.update_document(
            document_id,
            uploaded_by=getattr(document, "uploaded_by", None),
            ocr_payload_json=payload,
        )

    async def process_document_ocr(self, document_id: str) -> Document:
        existing_document = await self.get_document(document_id)
        keep_archived = bool(existing_document and (getattr(existing_document, "status", None) == "archived" or getattr(existing_document, "patient_id", None)))
        document = await self.update_document(
            document_id,
            ocr_status="running",
            status="archived" if keep_archived else "ocr_pending",
            ocr_payload_json={
                "provider": "textin",
                "errors": [],
                "request": {"document_id": document_id},
            },
            archived_at=getattr(existing_document, "archived_at", None) if keep_archived and existing_document else None,
        )

        try:
            preview = await self.get_preview_url(document_id, expires_in=3600, prefer_native=True)
            request_snapshot = {
                "api_url": build_textin_api_url(config.TEXTIN_API_URL),
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
            latest_document = await self.get_document(document_id) or document
            if document_uses_ocr_page_preview(latest_document):
                storage = self.storage_backend if isinstance(self.storage_backend, AliyunOssDocumentStorage) else None
                payload = await OcrPageAssetService(storage_backend=storage).persist_page_assets(
                    document=latest_document,
                    payload=payload,
                )
            completed_status = "archived" if getattr(latest_document, "patient_id", None) or getattr(latest_document, "status", None) == "archived" else "ocr_completed"
            completed_document = await self.update_document(
                document_id,
                ocr_status="completed",
                status=completed_status,
                is_parsed=True,
                parsed_content=json.dumps(payload, ensure_ascii=False),
                parsed_data=payload,
                ocr_text=payload.get("markdown") or "",
                ocr_payload_json=payload,
                archived_at=getattr(latest_document, "archived_at", None) or (datetime.utcnow() if getattr(latest_document, "patient_id", None) else None),
            )
            await self.invalidate_archive_tree_cache(getattr(completed_document, "uploaded_by", None))
            try:
                self._enqueue_metadata_task(completed_document.id)
            except Exception as exc:
                try:
                    await self._record_ocr_postprocess_warning(completed_document.id, "metadata_enqueue", exc)
                except Exception:
                    pass
            try:
                enqueued_count = await self.enqueue_ready_extraction_jobs(completed_document.id)
                if enqueued_count == 0 and getattr(completed_document, "patient_id", None):
                    await self.create_and_enqueue_patient_ehr_extraction(
                        document=completed_document,
                        source="document_upload_patient_bound",
                        requested_by=getattr(completed_document, "uploaded_by", None),
                    )
            except Exception as exc:
                try:
                    await self._record_ocr_postprocess_warning(completed_document.id, "extraction_enqueue", exc)
                except Exception:
                    pass
            return completed_document
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
            failed_document = await self.update_document(
                document_id,
                ocr_status="failed",
                status="archived" if keep_archived else "failed",
                archived_at=getattr(existing_document, "archived_at", None) if keep_archived and existing_document else None,
                ocr_payload_json=failed_payload,
            )
            await self.invalidate_archive_tree_cache(getattr(failed_document, "uploaded_by", None))
            return failed_document

    def _enqueue_metadata_task(self, document_id: str) -> None:
        from app.workers.celery_app import METADATA_QUEUE, METADATA_TASK_NAME, celery_app

        celery_app.send_task(
            METADATA_TASK_NAME,
            args=[document_id],
            queue=METADATA_QUEUE,
            routing_key=METADATA_QUEUE,
        )

    async def _enqueue_extraction_task(self, job_id: str) -> None:
        from app.workers.celery_app import EXTRACTION_QUEUE, EXTRACTION_TASK_NAME, celery_app

        job = await self.extraction_job_repository.get_by_id(job_id)
        queue = extraction_queue_for_job(job) if job is not None else EXTRACTION_QUEUE
        if config.EXTRACTION_SCHEDULER_ENABLED:
            if job is not None:
                job.status = "pending"
                await self.extraction_job_repository.save(job)
                from app.services.task_progress_service import TaskProgressService

                await TaskProgressService().mark_job_waiting_for_scheduler(
                    job,
                    message="任务正在等待公平调度",
                    commit=True,
                )
            return

        try:
            celery_app.send_task(
                EXTRACTION_TASK_NAME,
                args=[job_id],
                queue=queue,
                routing_key=queue,
            )
        except Exception as exc:
            if job is not None:
                job.status = "failed"
                job.error_type = "enqueue_failed"
                job.error_message = f"Extraction task could not be queued: {exc}"
                job.finished_at = datetime.utcnow()
                await self.extraction_job_repository.save(job)
                from app.services.task_progress_service import TaskProgressService

                await TaskProgressService().mark_job_failed(job, error_message=job.error_message)
                await session.commit()
            raise
        job = await self.extraction_job_repository.get_by_id(job_id)
        if job is not None:
            job.status = "queued"
            job.progress = max(int(job.progress or 0), 5)
            await self.extraction_job_repository.save(job)
            await session.commit()

    async def enqueue_ready_extraction_jobs(self, document_id: str) -> int:
        jobs = await self.extraction_job_repository.list_pending_waiting_for_document(document_id)
        if not jobs:
            return 0
        for job in jobs:
            input_json = dict(job.input_json or {})
            input_json["wait_for_document_ready"] = False
            input_json["document_ready_at"] = datetime.utcnow().isoformat()
            job.input_json = input_json
            await self.extraction_job_repository.save(job)
        await session.commit()

        for job in jobs:
            await self._enqueue_extraction_task(job.id)
        return len(jobs)

    async def create_and_enqueue_patient_ehr_extraction(
        self,
        *,
        document: Document,
        source: str,
        requested_by: str | None = None,
    ) -> str | None:
        if not document.patient_id:
            return None

        schema_version = await self.schema_service.get_latest_published("ehr")
        if schema_version is None:
            return None

        context = await self.ehr_service.get_or_create_patient_ehr_context(
            patient_id=document.patient_id,
            schema_version=schema_version,
            created_by=requested_by,
        )
        job = await self.extraction_job_repository.create(
            {
                "job_type": "patient_ehr",
                "status": "pending",
                "priority": 0,
                "patient_id": document.patient_id,
                "document_id": document.id,
                "context_id": context.id,
                "schema_version_id": schema_version.id,
                "input_json": with_default_extraction_strategy(
                    job_type="patient_ehr",
                    input_json={"source": source},
                ),
                "progress": 0,
                "requested_by": requested_by,
            }
        )
        await session.commit()
        await self._enqueue_extraction_task(job.id)
        return job.id


    async def get_archive_tree(self, *, include_raw_documents: bool = False, refresh: bool = False, uploaded_by: str | None = None) -> dict[str, Any]:
        cache_key = self._archive_cache_key(uploaded_by)
        if not include_raw_documents and not refresh:
            try:
                cached = await redis_client.get(cache_key)
                if cached:
                    return json.loads(cached)
            except Exception:
                pass

        documents = await self.document_repository.list_visible_documents(uploaded_by=uploaded_by)
        total = len(documents)
        patients = await self.patient_repository.list_all_active(owner_id=uploaded_by)
        groups = ArchiveGroupingService().build_groups(
            [document for document in documents if document.status != "archived"],
            patients,
            include_raw_documents=include_raw_documents,
        )

        todo_groups = []
        for group in groups:
            # `pending_process` 表示"OCR / 元数据抽取尚未完成"，应归入"待解析"统计，
            # 不应出现在"待归档" todo_groups 里（与 parse_total 重复计数、视觉错位）。
            if group.get("status") == "pending_process":
                continue
            active_documents = [document for document in group["documents"] if document.get("status") != "archived"]
            if not active_documents:
                continue
            status_set = []
            group_status = group["status"]
            if group_status == "matched_existing":
                status_set = ["auto_archived"]
            elif group_status == "needs_confirmation":
                status_set = ["pending_confirm_review"]
            elif group_status == "new_patient_candidate":
                status_set = ["pending_confirm_new"]
            else:
                status_set = ["pending_confirm_uncertain"]

            snapshot = group.get("patientSnapshot") or {}
            todo_groups.append(
                {
                    "group_id": group["groupId"],
                    "label": {
                        "name": snapshot.get("name") or group.get("displayName") or "未知患者",
                        "gender": snapshot.get("gender") or "--",
                        "age": snapshot.get("age") or "--",
                    },
                    "count": len(active_documents),
                    "document_ids": [document["id"] for document in active_documents],
                    "status_set": status_set,
                    "matched_patient_id": group.get("matched_patient_id"),
                }
            )

        archived_by_patient: dict[str, list[Document]] = {}
        for document in documents:
            if document.status == "archived" and document.patient_id:
                archived_by_patient.setdefault(document.patient_id, []).append(document)

        patient_map = {patient.id: patient for patient in patients}
        archived_patients = []
        for patient_id, patient_documents in archived_by_patient.items():
            patient = patient_map.get(patient_id)
            archived_patients.append(
                {
                    "patient_id": patient_id,
                    "patient_code": patient_id[:8],
                    "label": {
                        "name": patient.name if patient else "未知患者",
                        "gender": patient.gender if patient and patient.gender else "--",
                        "age": patient.age if patient and patient.age is not None else "--",
                    },
                    "count": len(patient_documents),
                    "patient_status": "active" if patient else "inactive",
                }
            )

        # parse_total / todo_total / archived_total 三者互斥：
        #  · parse_total: 文档尚未完成 OCR 或元数据抽取（is_pending_process_document）
        #  · todo_total : 已完成解析、等待人工归档的文档数（todo_groups 已去除 pending_process）
        #  · archived_total: 已归档
        # 这样左侧目录栏的三档徽标加起来 = total，避免同一份文档同时计入"待解析"+"待归档"。
        parse_total = len([document for document in documents if is_pending_process_document(document)])
        todo_total = sum(group["count"] for group in todo_groups)
        archived_total = len([document for document in documents if document.status == "archived"])
        payload = {
            "total": total,
            "counts": {
                "parse_total": parse_total,
                "todo_total": todo_total,
                "archived_total": archived_total,
            },
            "todo_groups": todo_groups,
            "archived_patients": archived_patients,
        }
        if not include_raw_documents:
            try:
                await redis_client.set(cache_key, json.dumps(payload, ensure_ascii=False), ex=300)
            except Exception:
                pass
        return payload

    async def get_archive_counts(self, *, refresh: bool = False, uploaded_by: str | None = None) -> dict[str, Any]:
        """仅返回归档树各 Tab 计数，优先读 Redis 缓存，避免 MainLayout 等场景拉整棵树。"""
        cache_key = self._archive_cache_key(uploaded_by)
        if not refresh:
            try:
                cached = await redis_client.get(cache_key)
                if cached:
                    data = json.loads(cached)
                    return {
                        "total": int(data.get("total") or 0),
                        "counts": data.get("counts") or {},
                    }
            except Exception:
                pass
        tree = await self.get_archive_tree(refresh=refresh, uploaded_by=uploaded_by)
        return {
            "total": int(tree.get("total") or 0),
            "counts": tree.get("counts") or {},
        }

    @staticmethod
    def _build_group_match_info(group: dict[str, Any]) -> dict[str, Any]:
        group_status = group.get("status") or "insufficient_info"
        candidates = group.get("candidatePatients") or group.get("candidate_patients") or []
        matched_patient_id = group.get("matched_patient_id")
        top_candidate_id = None
        if candidates:
            top_candidate = candidates[0]
            top_candidate_id = top_candidate.get("patientId") or top_candidate.get("patient_id") or top_candidate.get("id")

        if group_status == "pending_process":
            match_result = "pending"
        elif group_status == "matched_existing":
            match_result = "matched"
        elif group_status == "needs_confirmation":
            match_result = "review"
        elif group_status == "new_patient_candidate":
            match_result = "new"
        else:
            match_result = "uncertain"

        if group_status == "matched_existing":
            ai_recommendation = matched_patient_id
        elif group_status == "needs_confirmation":
            ai_recommendation = top_candidate_id
        else:
            ai_recommendation = matched_patient_id or None

        match_score = candidates[0].get("similarity", 0) if candidates else 0
        return {
            "matched_patient_id": matched_patient_id,
            "match_score": match_score,
            "confidence": match_score,
            "match_result": match_result,
            "candidates": candidates,
            "ai_recommendation": ai_recommendation,
            "ai_reason": group.get("matchReason") or group.get("match_reason"),
        }

    @staticmethod
    def _build_document_extracted_info(document: Document) -> dict[str, Any]:
        identity = parse_document_identity(document)
        result = get_metadata_result(document.metadata_json)
        id_number = extract_id_card_from_result(result)
        return {
            "name": identity.name,
            "patient_name": identity.name,
            "gender": identity.gender,
            "patient_gender": identity.gender,
            "age": identity.age,
            "patient_age": identity.age,
            "birth_date": identity.birth_date,
            "phone": identity.phone,
            "address": identity.address,
            "id_number": id_number,
            "id_card": id_number,
        }

    async def _build_archive_groups(
        self,
        *,
        uploaded_by: str | None = None,
        include_raw_documents: bool = True,
    ) -> tuple[list[Document], list[dict[str, Any]]]:
        documents = await self.document_repository.list_visible_documents(uploaded_by=uploaded_by)
        patients = await self.patient_repository.list_all_active(owner_id=uploaded_by)
        groups = ArchiveGroupingService().build_groups(
            [document for document in documents if document.status != "archived"],
            patients,
            include_raw_documents=include_raw_documents,
        )
        return documents, groups

    async def get_document_match_info(self, document_id: str, *, uploaded_by: str | None = None) -> dict[str, Any]:
        document = await self.get_document(document_id, uploaded_by=uploaded_by)
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

        metadata = document.metadata_json if isinstance(document.metadata_json, dict) else {}
        extracted_info = self._build_document_extracted_info(document)
        _, groups = await self._build_archive_groups(uploaded_by=uploaded_by, include_raw_documents=True)

        group = next(
            (
                item
                for item in groups
                if any(doc.get("id") == document_id for doc in item.get("documents") or [])
            ),
            None,
        )
        if group is None:
            return {
                "document_id": document_id,
                "group_id": None,
                "document_metadata": metadata,
                "extracted_info": extracted_info,
                "matched_patient_id": None,
                "match_score": 0,
                "confidence": 0,
                "match_result": "uncertain",
                "candidates": [],
                "ai_recommendation": None,
                "ai_reason": "未找到所属分组或文档尚未完成解析",
            }

        match_info = self._build_group_match_info(group)
        return {
            "document_id": document_id,
            "group_id": group.get("groupId"),
            "document_metadata": metadata,
            "extracted_info": extracted_info,
            **match_info,
        }

    async def refresh_document_match_info(self, document_id: str, *, uploaded_by: str | None = None) -> dict[str, Any]:
        await self.invalidate_archive_tree_cache(uploaded_by)
        return await self.get_document_match_info(document_id, uploaded_by=uploaded_by)

    async def get_archive_group_documents(self, group_id: str, *, uploaded_by: str | None = None) -> dict[str, Any]:
        _, groups = await self._build_archive_groups(uploaded_by=uploaded_by, include_raw_documents=True)
        group = next((item for item in groups if item["groupId"] == group_id), None)
        if group is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

        active_documents = [item["raw_document"] for item in group["documents"] if item.get("status") != "archived"]
        match_info = self._build_group_match_info(group)
        response_group = {**group}
        response_group["documents"] = [
            {key: value for key, value in document.items() if key != "raw_document"}
            for document in group["documents"]
        ]
        return {
            "items": active_documents,
            "group": response_group,
            "match_info": match_info,
            "pagination": {"page": 1, "page_size": len(active_documents), "total": len(active_documents), "total_pages": 1},
        }

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

        # 允许软删除已被字段证据引用的文档：
        # - 文档行保留（仅 status='deleted'），文件 blob 保留 → 证据仍可解析查看
        # - 病历字段值不变，仅来源标注为"已删除文档"
        # - 永久清理（含 evidence 链）应走单独的管理员入口，不在这里
        document.status = "deleted"
        document.updated_at = datetime.utcnow()
        await self.document_repository.save(document)
        await self.invalidate_archive_tree_cache(requested_by)

    async def list_patient_documents(self, patient_id: str, *, limit: int = 100, uploaded_by: str | None = None) -> list[Document]:
        return await self.document_repository.list_by_patient(patient_id, limit=limit, uploaded_by=uploaded_by)
