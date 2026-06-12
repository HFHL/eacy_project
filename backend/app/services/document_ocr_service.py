from __future__ import annotations

import json
from datetime import datetime

from fastapi import HTTPException, status

from app.integrations.textin_ocr import TextInOcrClient, build_textin_api_url
from app.services.document_preview_utils import document_uses_ocr_page_preview
from app.services.document_service_runtime import document_service_session
from app.services.ocr_page_asset_service import OcrPageAssetService
from app.services.ocr_payload_normalizer import normalize_textin_ocr_payload
from app.storage.document_storage import AliyunOssDocumentStorage
from core.config import config


class DocumentOcrMixin:
    def _enqueue_ocr_task(self, document_id: str) -> None:
        from app.workers.celery_app import OCR_QUEUE, OCR_TASK_NAME, celery_app

        celery_app.send_task(
            OCR_TASK_NAME,
            args=[document_id],
            queue=OCR_QUEUE,
            routing_key=OCR_QUEUE,
        )

    async def queue_document_ocr(self, document_id: str, *, requested_by: str | None = None):
        session = document_service_session()
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

    async def _mark_ocr_enqueue_failed(self, document_id: str, exc: Exception, *, uploaded_by: str | None = None):
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

    async def _record_ocr_postprocess_warning(self, document_id: str, stage: str, exc: Exception):
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

    async def process_document_ocr(self, document_id: str):
        existing_document = await self.get_document(document_id)
        keep_archived = bool(
            existing_document
            and (getattr(existing_document, "status", None) == "archived" or getattr(existing_document, "patient_id", None))
        )
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
            completed_status = (
                "archived"
                if getattr(latest_document, "patient_id", None) or getattr(latest_document, "status", None) == "archived"
                else "ocr_completed"
            )
            completed_document = await self.update_document(
                document_id,
                ocr_status="completed",
                status=completed_status,
                is_parsed=True,
                parsed_content=json.dumps(payload, ensure_ascii=False),
                parsed_data=payload,
                ocr_text=payload.get("markdown") or "",
                ocr_payload_json=payload,
                archived_at=getattr(latest_document, "archived_at", None)
                or (datetime.utcnow() if getattr(latest_document, "patient_id", None) else None),
            )
            await self.invalidate_archive_tree_cache(getattr(completed_document, "uploaded_by", None))
            await self._run_ocr_postprocess(completed_document)
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

    async def _run_ocr_postprocess(self, completed_document) -> None:
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

    def _enqueue_metadata_task(self, document_id: str) -> None:
        from app.workers.celery_app import METADATA_QUEUE, METADATA_TASK_NAME, celery_app

        celery_app.send_task(
            METADATA_TASK_NAME,
            args=[document_id],
            queue=METADATA_QUEUE,
            routing_key=METADATA_QUEUE,
        )
