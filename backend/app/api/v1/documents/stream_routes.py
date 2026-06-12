from __future__ import annotations

from importlib import import_module
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from app.core.auth import CurrentUser
from app.services.document_service import DocumentService
from app.services.textin_image_bytes import decode_binary_image_content

from .dependencies import get_document_service, get_stream_current_user, user_scope_id

router = APIRouter()


def _async_client(**kwargs):
    return import_module("app.api.v1.documents.router").httpx.AsyncClient(**kwargs)


async def stream_document_response(
    document_id: str,
    current_user: CurrentUser,
    service: DocumentService,
    *,
    page_no: int | None = None,
) -> StreamingResponse:
    document = await service.get_stream_document(document_id, uploaded_by=user_scope_id(current_user))
    preview = await service.get_preview_url(
        document_id,
        page_no=page_no,
        uploaded_by=user_scope_id(current_user),
    )
    filename = Path(document.original_filename or document.file_name or "document.pdf").name
    if preview.get("preview_source") == "ocr_page":
        page = preview.get("page_no") or page_no or 1
        filename = f"page-{page}.jpg"
        content_type = preview.get("mime_type") or "image/jpeg"
    else:
        content_type = preview.get("mime_type") or document.mime_type or "application/octet-stream"
        if (document.file_ext or "").lower() == ".pdf":
            content_type = "application/pdf"

    is_ocr_page = preview.get("preview_source") == "ocr_page"
    ocr_page_body: bytes | None = None
    if is_ocr_page:
        async with _async_client(follow_redirects=True, timeout=60) as client:
            response = await client.get(preview["temp_url"])
            response.raise_for_status()
            ocr_page_body, decoded_type = decode_binary_image_content(response.content, content_type=content_type)
            if decoded_type:
                content_type = decoded_type

    async def iter_file():
        if ocr_page_body is not None:
            yield ocr_page_body
            return
        async with _async_client(follow_redirects=True, timeout=60) as client:
            async with client.stream("GET", preview["temp_url"]) as upstream:
                upstream.raise_for_status()
                async for chunk in upstream.aiter_bytes():
                    if chunk:
                        yield chunk

    return StreamingResponse(
        iter_file(),
        media_type=content_type,
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(filename, safe='')}",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/{document_id}/stream")
async def stream_document(
    document_id: str,
    page: int | None = Query(default=None, ge=1),
    current_user: CurrentUser = Depends(get_stream_current_user),
    service: DocumentService = Depends(get_document_service),
):
    return await stream_document_response(document_id, current_user, service, page_no=page)


@router.get("/{document_id}/pdf-stream")
async def pdf_stream_document(
    document_id: str,
    page: int | None = Query(default=None, ge=1),
    current_user: CurrentUser = Depends(get_stream_current_user),
    service: DocumentService = Depends(get_document_service),
):
    return await stream_document_response(document_id, current_user, service, page_no=page)
