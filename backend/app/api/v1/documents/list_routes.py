from __future__ import annotations

from importlib import import_module

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status

from app.core.auth import CurrentUser, get_current_user
from app.services.document_service import DocumentService

from .dependencies import get_document_service, user_scope_id
from .presenters import (
    document_response,
    document_summary_response,
)
from .schemas import (
    DocumentArchiveCountsResponse,
    DocumentArchiveTreeResponse,
    DocumentBatchArchiveRequest,
    DocumentBatchArchiveResponse,
    DocumentGroupArchiveResponse,
    DocumentGroupDocumentsResponse,
    DocumentListResponse,
    DocumentResponse,
    DocumentStatusesRequest,
    DocumentStatusesResponse,
)

router = APIRouter()


def _router_helper(name: str):
    return getattr(import_module("app.api.v1.documents.router"), name)


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    patient_id: str | None = Form(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentResponse:
    document = await service.upload_document(file=file, patient_id=patient_id, uploaded_by=current_user.id)
    return document_response(document)


@router.get("/", response_model=DocumentListResponse)
@router.get("", response_model=DocumentListResponse, include_in_schema=False)
async def list_documents(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    patient_id: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    tab: str | None = Query(default=None, description="Semantic tab filter: all, parse, todo, archived"),
    task_stage: str | None = Query(default=None, description="Processing stage filter: processing, error, pending_archive, archived"),
    keyword: str | None = Query(default=None),
    document_types: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    order_by: str = Query(default="created_at"),
    order_direction: str = Query(default="desc"),
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentListResponse:
    documents, total = await service.list_documents(
        page=page,
        page_size=page_size,
        patient_id=patient_id,
        status=status_filter,
        tab=tab,
        task_stage=task_stage,
        keyword=keyword,
        document_types=document_types,
        date_from=date_from,
        date_to=date_to,
        order_by=order_by,
        order_direction=order_direction,
        uploaded_by=user_scope_id(current_user),
    )
    extract_status_map = await _router_helper("build_extract_status_map")(documents)
    bound_patient_map = await _router_helper("build_bound_patient_map")(documents, owner_id=user_scope_id(current_user))
    return DocumentListResponse(
        items=[
            document_summary_response(
                document,
                extract_status_map=extract_status_map,
                bound_patient_map=bound_patient_map,
            )
            for document in documents
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/v2/tree", response_model=DocumentArchiveTreeResponse)
async def get_file_list_tree(
    refresh: bool = Query(default=False),
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentArchiveTreeResponse:
    payload = await service.get_archive_tree(refresh=refresh, uploaded_by=user_scope_id(current_user))
    return DocumentArchiveTreeResponse.model_validate(payload)


@router.get("/v2/counts", response_model=DocumentArchiveCountsResponse)
async def get_file_list_counts(
    refresh: bool = Query(default=False),
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentArchiveCountsResponse:
    payload = await service.get_archive_counts(refresh=refresh, uploaded_by=user_scope_id(current_user))
    return DocumentArchiveCountsResponse.model_validate(payload)


@router.post("/statuses", response_model=DocumentStatusesResponse)
async def get_document_statuses(
    payload: DocumentStatusesRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentStatusesResponse:
    documents = await service.list_documents_by_ids(payload.document_ids, uploaded_by=user_scope_id(current_user))
    extract_status_map = await _router_helper("build_extract_status_map")(documents)
    bound_patient_map = await _router_helper("build_bound_patient_map")(documents, owner_id=user_scope_id(current_user))
    return DocumentStatusesResponse(
        items=[
            document_summary_response(
                document,
                extract_status_map=extract_status_map,
                bound_patient_map=bound_patient_map,
            )
            for document in documents
        ]
    )


@router.get("/v2/groups/{group_id}/documents", response_model=DocumentGroupDocumentsResponse)
async def get_group_documents(
    group_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentGroupDocumentsResponse:
    payload = await service.get_archive_group_documents(group_id, uploaded_by=user_scope_id(current_user))
    extract_status_map = await _router_helper("build_extract_status_map")(payload["items"])
    bound_patient_map = await _router_helper("build_bound_patient_map")(payload["items"], owner_id=user_scope_id(current_user))
    return DocumentGroupDocumentsResponse(
        items=[
            document_summary_response(
                document,
                extract_status_map=extract_status_map,
                bound_patient_map=bound_patient_map,
            )
            for document in payload["items"]
        ],
        group=payload["group"],
        match_info=payload["match_info"],
        pagination=payload["pagination"],
    )


@router.post("/v2/groups/{group_id}/confirm-archive", response_model=DocumentGroupArchiveResponse)
async def confirm_group_archive(
    group_id: str,
    patient_id: str = Query(...),
    auto_merge_ehr: bool = Query(default=True),
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentGroupArchiveResponse:
    documents = await service.archive_group_to_patient(
        group_id=group_id,
        patient_id=patient_id,
        requested_by=user_scope_id(current_user),
        create_extraction_job=auto_merge_ehr,
    )
    return DocumentGroupArchiveResponse(
        archived_count=len(documents),
        archived_document_ids=[document.id for document in documents],
    )


@router.post("/batch-archive", response_model=DocumentBatchArchiveResponse)
async def batch_archive_documents(
    payload: DocumentBatchArchiveRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: DocumentService = Depends(get_document_service),
) -> DocumentBatchArchiveResponse:
    documents = await service.batch_archive_to_patient(
        document_ids=payload.document_ids,
        patient_id=payload.patient_id,
        requested_by=user_scope_id(current_user),
        create_extraction_job=payload.create_extraction_job,
    )
    return DocumentBatchArchiveResponse(
        items=[document_response(document) for document in documents],
        total=len(documents),
    )
