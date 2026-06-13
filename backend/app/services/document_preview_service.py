from __future__ import annotations

import mimetypes
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import HTTPException, status

from app.models import Document
from app.services.document_preview_utils import (
    document_uses_ocr_page_preview,
    find_ocr_page_storage_path,
    first_persisted_ocr_page_path,
    get_ocr_page_count,
)
from app.storage.document_storage import AliyunOssDocumentStorage
from core.config import config


class DocumentPreviewMixin:
    @staticmethod
    def _infer_preview_content_type(
        *,
        filename: str | None = None,
        file_ext: str | None = None,
        mime_type: str | None = None,
        fallback: str = "application/octet-stream",
    ) -> str:
        normalized_mime = (mime_type or "").strip().lower()
        if normalized_mime and normalized_mime != "application/octet-stream":
            return normalized_mime

        normalized_ext = (file_ext or "").strip().lower()
        if "/" in normalized_ext and normalized_ext != "application/octet-stream":
            return normalized_ext

        lookup_name = filename or ""
        if normalized_ext and "." not in Path(lookup_name).name:
            suffix = normalized_ext if normalized_ext.startswith(".") else f".{normalized_ext}"
            lookup_name = f"{lookup_name or 'document'}{suffix}"
        guessed_type = mimetypes.guess_type(lookup_name)[0]
        return guessed_type or normalized_mime or fallback

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
            "mime_type": self._infer_preview_content_type(
                filename=document.original_filename or document.file_name,
                file_ext=document.file_ext or document.file_type,
                mime_type=document.mime_type,
            ),
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
