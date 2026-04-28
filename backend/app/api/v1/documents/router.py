from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, Field

from app.core.auth import CurrentUser, get_current_user
from app.services.document_service import DocumentService

router = APIRouter(prefix="/documents", tags=["documents"])


class DocumentUpdate(BaseModel):
    doc_type: str | None = Field(default=None, max_length=100)
    doc_subtype: str | None = Field(default=None, max_length=100)
    doc_title: str | None = Field(default=None, max_length=255)
    effective_at: datetime | None = None
    metadata_json: dict[str, Any] | None = None
    meta_status: str | None = Field(default=None, max_length=50)
    ocr_text: str | None = None
    ocr_payload_json: dict[str, Any] | None = None
    ocr_status: str | None = Field(default=None, max_length=50)


class DocumentArchiveRequest(BaseModel):
    patient_id: str
    create_extraction_job: bool = True


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    patient_id: str | None = None
    original_filename: str
    file_ext: str | None = None
    mime_type: str | None = None
    file_size: int | None = None
    storage_provider: str | None = None
    storage_path: str
    file_url: str | None = None
    status: str
    ocr_status: str | None = None
    ocr_text: str | None = None
    ocr_payload_json: dict[str, Any] | None = None
    meta_status: str | None = None
    metadata_json: dict[str, Any] | None = None
    doc_type: str | None = None
    doc_subtype: str | None = None
    doc_title: str | None = None
    effective_at: datetime | None = None
    uploaded_by: str | None = None
    archived_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class DocumentListResponse(BaseModel):
    items: list[DocumentResponse]
    total: int
    page: int
    page_size: int


class DocumentPreviewUrlResponse(BaseModel):
    document_id: str
    url: str
    temp_url: str
    preview_url: str
    expires_in: int
    storage_provider: str | None = None
    mime_type: str | None = None
    file_name: str


def get_document_service() -> DocumentService:
    return DocumentService()


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    patient_id: str | None = Form(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentResponse:
    document = await service.upload_document(file=file, patient_id=patient_id, uploaded_by=current_user.id)
    return DocumentResponse.model_validate(document)


@router.get("/", response_model=DocumentListResponse)
@router.get("", response_model=DocumentListResponse, include_in_schema=False)
async def list_documents(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    patient_id: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentListResponse:
    documents, total = await service.list_documents(
        page=page,
        page_size=page_size,
        patient_id=patient_id,
        status=status_filter,
    )
    return DocumentListResponse(items=documents, total=total, page=page, page_size=page_size)


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentResponse:
    document = await service.get_document(document_id)
    if document is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return DocumentResponse.model_validate(document)


@router.get("/{document_id}/preview-url", response_model=DocumentPreviewUrlResponse)
async def get_document_preview_url(
    document_id: str,
    expires_in: int = Query(default=3600, ge=1, le=86400),
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentPreviewUrlResponse:
    payload = await service.get_preview_url(document_id, expires_in=expires_in)
    return DocumentPreviewUrlResponse.model_validate(payload)


@router.get("/{document_id}/stream")
async def stream_document(
    document_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
):
    await service.get_stream_document(document_id)
    preview = await service.get_preview_url(document_id)
    return RedirectResponse(preview["temp_url"], status_code=status.HTTP_302_FOUND)


@router.patch("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: str,
    payload: DocumentUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentResponse:
    document = await service.update_document(document_id, **payload.model_dump(exclude_unset=True))
    return DocumentResponse.model_validate(document)


@router.post("/{document_id}/ocr", response_model=DocumentResponse, status_code=status.HTTP_202_ACCEPTED)
async def trigger_document_ocr(
    document_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentResponse:
    document = await service.queue_document_ocr(document_id)
    return DocumentResponse.model_validate(document)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> Response:
    await service.delete_document(document_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{document_id}/archive", response_model=DocumentResponse)
async def archive_document(
    document_id: str,
    payload: DocumentArchiveRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentResponse:
    document = await service.archive_to_patient(
        document_id=document_id,
        patient_id=payload.patient_id,
        requested_by=current_user.id,
        create_extraction_job=payload.create_extraction_job,
    )
    return DocumentResponse.model_validate(document)


@router.post("/{document_id}/unarchive", response_model=DocumentResponse)
async def unarchive_document(
    document_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentResponse:
    document = await service.unarchive_document(document_id)
    return DocumentResponse.model_validate(document)
