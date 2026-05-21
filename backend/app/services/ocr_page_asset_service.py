from __future__ import annotations

import logging
from typing import Any

import httpx

from app.integrations.textin_ocr import TextInOcrClient, TextInOcrError
from app.services.textin_image_bytes import TextInImageDecodeError, decode_binary_image_content
from app.models import Document
from app.services.document_preview_utils import document_uses_ocr_page_preview
from app.storage.document_storage import AliyunOssDocumentStorage
from core.config import config

logger = logging.getLogger(__name__)

TEXTIN_IMAGE_DOWNLOAD_URL = "https://api.textin.com/ocr_image/download"


class OcrPageAssetService:
    def __init__(self, *, storage_backend: AliyunOssDocumentStorage | None = None):
        self.storage_backend = storage_backend

    def _resolve_storage(self) -> AliyunOssDocumentStorage:
        if isinstance(self.storage_backend, AliyunOssDocumentStorage):
            return self.storage_backend
        return AliyunOssDocumentStorage(
            access_key_id=config.OSS_ACCESS_KEY_ID or "",
            access_key_secret=config.OSS_ACCESS_KEY_SECRET or "",
            bucket_name=config.OSS_BUCKET_NAME or "",
            endpoint=config.OSS_ENDPOINT or "",
            base_prefix=config.OSS_BASE_PREFIX,
            public_base_url=config.OSS_PUBLIC_BASE_URL,
        )

    def _object_key(self, document_id: str, page_no: int, *, suffix: str) -> str:
        prefix = (config.OSS_BASE_PREFIX or "documents").strip("/")
        return f"{prefix}/ocr-pages/{document_id}/page-{page_no}{suffix}"

    async def _download_page_bytes(
        self,
        client: TextInOcrClient,
        http_client: httpx.AsyncClient,
        page: dict[str, Any],
    ) -> tuple[bytes, str] | None:
        page_image_url = page.get("page_image_url")
        if isinstance(page_image_url, str) and page_image_url.strip():
            response = await http_client.get(page_image_url.strip())
            if response.status_code >= 200 and response.status_code < 300 and response.content:
                content_type = (response.headers.get("content-type") or "image/jpeg").split(";")[0].strip()
                try:
                    return decode_binary_image_content(response.content, content_type=content_type)
                except TextInImageDecodeError as exc:
                    raise TextInOcrError(str(exc)) from exc

        image_id = page.get("image_id")
        if isinstance(image_id, str) and image_id.strip():
            content = await client.download_image(image_id.strip())
            if content:
                try:
                    return decode_binary_image_content(content, content_type="image/jpeg")
                except TextInImageDecodeError as exc:
                    raise TextInOcrError(str(exc)) from exc
        return None

    async def persist_page_assets(self, *, document: Document, payload: dict[str, Any]) -> dict[str, Any]:
        if not document_uses_ocr_page_preview(document):
            return payload

        pages = payload.get("pages")
        if not isinstance(pages, list) or not pages:
            return payload

        storage = self._resolve_storage()
        textin_client = TextInOcrClient()
        assets: list[dict[str, Any]] = []
        errors: list[dict[str, Any]] = list(payload.get("errors") or [])

        async with httpx.AsyncClient(follow_redirects=True, timeout=config.TEXTIN_TIMEOUT_SECONDS) as http_client:
            for page in pages:
                if not isinstance(page, dict):
                    continue
                try:
                    page_no = int(page.get("page_no") or 0)
                except (TypeError, ValueError):
                    continue
                if page_no <= 0:
                    continue
                if page.get("local_page_image_path"):
                    assets.append(
                        {
                            "page_no": page_no,
                            "storage_path": page["local_page_image_path"],
                            "source": "existing",
                        }
                    )
                    continue

                try:
                    downloaded = await self._download_page_bytes(textin_client, http_client, page)
                    if not downloaded:
                        errors.append(
                            {
                                "type": "ocr_page_asset_missing",
                                "page_no": page_no,
                                "message": "TextIn page image was not available for persistence",
                            }
                        )
                        continue
                    content, content_type = downloaded
                    suffix = ".jpg" if "jpeg" in content_type.lower() else ".png"
                    storage_path = self._object_key(str(document.id), page_no, suffix=suffix)
                    storage.put_object(storage_path, content, content_type=content_type)
                    page["local_page_image_path"] = storage_path
                    assets.append(
                        {
                            "page_no": page_no,
                            "storage_path": storage_path,
                            "content_type": content_type,
                            "source": "textin",
                        }
                    )
                except Exception as exc:
                    logger.warning(
                        "Failed to persist OCR page image document=%s page=%s: %s",
                        document.id,
                        page_no,
                        exc,
                    )
                    errors.append(
                        {
                            "type": "ocr_page_asset_failed",
                            "page_no": page_no,
                            "message": str(exc),
                        }
                    )

        payload["assets"] = {"pages": assets}
        if errors:
            payload["errors"] = errors
        return payload
