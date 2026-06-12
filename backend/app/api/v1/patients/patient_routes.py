from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.core.auth import CurrentUser, get_current_user, uuid_user_id_or_none
from app.services.extraction_service import ExtractionService
from app.services.patient_service import PatientService

from .dependencies import get_extraction_service, get_patient_service, user_scope_id
from .schemas import (
    EhrExtractionStatusItem,
    EhrExtractionStatusRequest,
    EhrExtractionStatusResponse,
    PatientCreate,
    PatientListResponse,
    PatientListStatistics,
    PatientProjectItem,
    PatientResponse,
    PatientUpdate,
    patient_response,
)

router = APIRouter()


@router.get("/", response_model=PatientListResponse)
@router.get("", response_model=PatientListResponse, include_in_schema=False)
async def list_patients(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    keyword: str | None = Query(default=None),
    department: str | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    service: PatientService = Depends(get_patient_service),
) -> PatientListResponse:
    patients, total, stats_by_id, page_statistics = await service.list_patients_with_stats(
        page=page,
        page_size=page_size,
        keyword=keyword,
        department=department,
        owner_id=user_scope_id(current_user),
    )
    items = [patient_response(patient, stats_by_id.get(patient.id)) for patient in patients]
    return PatientListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        statistics=PatientListStatistics(**page_statistics),
    )


@router.post("", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
async def create_patient(
    payload: PatientCreate,
    current_user: CurrentUser = Depends(get_current_user),
    service: PatientService = Depends(get_patient_service),
) -> PatientResponse:
    patient = await service.create_patient(
        created_by=uuid_user_id_or_none(current_user),
        **payload.model_dump(exclude_none=True),
    )
    stats = await service.get_patient_stats(patient, owner_id=user_scope_id(current_user))
    return patient_response(patient, stats)


@router.post("/ehr-extraction-status", response_model=EhrExtractionStatusResponse)
async def get_ehr_extraction_status_batch(
    payload: EhrExtractionStatusRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: ExtractionService = Depends(get_extraction_service),
) -> EhrExtractionStatusResponse:
    patient_ids = [str(pid) for pid in (payload.patient_ids or []) if pid]
    status_map = await service.list_active_ehr_status_by_patients(
        patient_ids,
        requested_by=user_scope_id(current_user),
    )
    items = [EhrExtractionStatusItem(patient_id=pid, **entry) for pid, entry in status_map.items()]
    return EhrExtractionStatusResponse(items=items)


@router.get("/{patient_id}", response_model=PatientResponse)
async def get_patient(
    patient_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: PatientService = Depends(get_patient_service),
) -> PatientResponse:
    patient = await service.get_patient(patient_id, owner_id=user_scope_id(current_user))
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    owner_id = user_scope_id(current_user)
    projects = await service.list_patient_projects(patient_id, owner_id=owner_id)
    stats = await service.get_patient_stats(patient, owner_id=owner_id)
    response = patient_response(patient, stats)
    response.projects = [PatientProjectItem.model_validate(item) for item in projects]
    return response


@router.patch("/{patient_id}", response_model=PatientResponse)
async def update_patient(
    patient_id: str,
    payload: PatientUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    service: PatientService = Depends(get_patient_service),
) -> PatientResponse:
    patient = await service.update_patient(
        patient_id,
        owner_id=user_scope_id(current_user),
        **payload.model_dump(exclude_unset=True),
    )
    owner_id = user_scope_id(current_user)
    projects = await service.list_patient_projects(patient_id)
    stats = await service.get_patient_stats(patient, owner_id=owner_id)
    response = patient_response(patient, stats)
    response.projects = [PatientProjectItem.model_validate(item) for item in projects]
    return response


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_patient(
    patient_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: PatientService = Depends(get_patient_service),
) -> Response:
    await service.delete_patient(patient_id, owner_id=user_scope_id(current_user))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
