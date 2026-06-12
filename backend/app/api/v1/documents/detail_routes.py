from __future__ import annotations

from importlib import import_module

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.core.auth import CurrentUser, get_current_user
from app.repositories.field_value_repository import FieldValueEvidenceRepository
from app.services.document_metadata_service import DocumentMetadataService
from app.services.document_service import DocumentService

from .dependencies import get_document_metadata_service, get_document_service, user_scope_id
from .presenters import document_response
from .schemas import (
    DocumentArchiveRequest,
    DocumentEvidenceImpactResponse,
    DocumentMatchInfoResponse,
    DocumentPreviewUrlResponse,
    DocumentResponse,
    DocumentUpdate,
    EvidenceImpactField,
)

router = APIRouter()


def _router_helper(name: str):
    return getattr(import_module("app.api.v1.documents.router"), name)


@router.get("/{document_id}/match-info", response_model=DocumentMatchInfoResponse)
async def get_document_match_info(
    document_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentMatchInfoResponse:
    payload = await service.get_document_match_info(document_id, uploaded_by=user_scope_id(current_user))
    return DocumentMatchInfoResponse.model_validate(payload)


@router.post("/{document_id}/match-info/refresh", response_model=DocumentMatchInfoResponse)
async def refresh_document_match_info(
    document_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentMatchInfoResponse:
    payload = await service.refresh_document_match_info(document_id, uploaded_by=user_scope_id(current_user))
    return DocumentMatchInfoResponse.model_validate(payload)


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentResponse:
    document = await service.get_document(document_id, uploaded_by=user_scope_id(current_user))
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    linked_patients = await _router_helper("build_linked_patients")(document, owner_id=user_scope_id(current_user))
    extraction_records = await _router_helper("build_extraction_records")(document_id)
    return document_response(
        document,
        linked_patients=linked_patients,
        extraction_records=extraction_records,
    )


@router.get("/{document_id}/preview-url", response_model=DocumentPreviewUrlResponse)
async def get_document_preview_url(
    document_id: str,
    expires_in: int = Query(default=3600, ge=1, le=86400),
    page: int | None = Query(default=None, ge=1),
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentPreviewUrlResponse:
    payload = await service.get_preview_url(
        document_id,
        expires_in=expires_in,
        page_no=page,
        uploaded_by=user_scope_id(current_user),
    )
    return DocumentPreviewUrlResponse.model_validate(payload)


@router.patch("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: str,
    payload: DocumentUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentResponse:
    document = await service.update_document(
        document_id,
        uploaded_by=user_scope_id(current_user),
        **payload.model_dump(exclude_unset=True),
    )
    return document_response(document)


@router.post("/{document_id}/ocr", response_model=DocumentResponse, status_code=status.HTTP_202_ACCEPTED)
async def trigger_document_ocr(
    document_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentResponse:
    document = await service.queue_document_ocr(document_id, requested_by=user_scope_id(current_user))
    return document_response(document)


@router.post("/{document_id}/metadata", response_model=DocumentResponse, status_code=status.HTTP_202_ACCEPTED)
async def trigger_document_metadata(
    document_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentMetadataService = Depends(get_document_metadata_service),
) -> DocumentResponse:
    document = await service.queue_document_metadata(document_id, uploaded_by=user_scope_id(current_user))
    return document_response(document)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> Response:
    await service.delete_document(document_id, requested_by=user_scope_id(current_user))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{document_id}/evidence-impact", response_model=DocumentEvidenceImpactResponse)
async def get_document_evidence_impact(
    document_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentEvidenceImpactResponse:
    document = await service.get_document(document_id, uploaded_by=user_scope_id(current_user))
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文档不存在")

    summary = await FieldValueEvidenceRepository().summarize_by_document_id(document_id)
    return DocumentEvidenceImpactResponse(
        document_id=document_id,
        evidence_count=summary.get("evidence_count", 0),
        fields=[EvidenceImpactField(**field) for field in summary.get("fields", [])],
    )


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
        requested_by=user_scope_id(current_user),
        create_extraction_job=payload.create_extraction_job,
    )
    return document_response(document)


@router.post("/{document_id}/unarchive", response_model=DocumentResponse)
async def unarchive_document(
    document_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentResponse:
    document = await service.unarchive_document(document_id, requested_by=user_scope_id(current_user))
    return document_response(document)
