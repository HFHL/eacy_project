from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status

from app.core.auth import CurrentUser, get_current_user, uuid_user_id_or_none
from app.services.research_project_service import (
    ResearchProjectConflictError,
    ResearchProjectNotFoundError,
    ResearchProjectService,
)

from .dependencies import get_research_project_service, raise_research_error, user_scope_id
from .project_schemas import (
    ProjectPatientCreate,
    ProjectPatientCrfGroupFieldsItem,
    ProjectPatientCrfGroupFieldsRequest,
    ProjectPatientCrfGroupFieldsResponse,
    ProjectPatientListItemResponse,
    ProjectPatientListResponse,
    ProjectPatientResponse,
)

router = APIRouter()


@router.get(
    "/{project_id}/patients",
    response_model=ProjectPatientListResponse | list[ProjectPatientListItemResponse],
)
async def list_project_patients(
    project_id: str,
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> ProjectPatientListResponse | list[ProjectPatientListItemResponse]:
    try:
        if page is None and page_size is None:
            patients = await service.list_project_patients_with_summary(
                project_id,
                owner_id=user_scope_id(current_user),
            )
            return [ProjectPatientListItemResponse.model_validate(patient) for patient in patients]

        current_page = page or 1
        current_page_size = page_size or 20
        total = await service.count_project_patients(
            project_id,
            owner_id=user_scope_id(current_user),
        )
        patients = await service.list_project_patients_with_summary(
            project_id,
            owner_id=user_scope_id(current_user),
            limit=current_page_size,
            offset=(current_page - 1) * current_page_size,
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        raise_research_error(error)
    return ProjectPatientListResponse(
        items=[ProjectPatientListItemResponse.model_validate(patient) for patient in patients],
        total=total,
        page=current_page,
        page_size=current_page_size,
    )


@router.post("/{project_id}/patients/crf-group-fields", response_model=ProjectPatientCrfGroupFieldsResponse)
async def batch_project_patients_crf_group_fields(
    project_id: str,
    payload: ProjectPatientCrfGroupFieldsRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> ProjectPatientCrfGroupFieldsResponse:
    try:
        items = await service.batch_crf_group_fields(
            project_id=project_id,
            group_id=payload.group_id,
            project_patient_ids=payload.project_patient_ids,
            owner_id=user_scope_id(current_user),
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        raise_research_error(error)
    return ProjectPatientCrfGroupFieldsResponse(
        items=[ProjectPatientCrfGroupFieldsItem.model_validate(item) for item in items]
    )


@router.post("/{project_id}/patients", response_model=ProjectPatientResponse, status_code=status.HTTP_201_CREATED)
async def enroll_project_patient(
    project_id: str,
    payload: ProjectPatientCreate,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> ProjectPatientResponse:
    try:
        project_patient = await service.enroll_patient(
            project_id=project_id,
            created_by=uuid_user_id_or_none(current_user),
            owner_id=user_scope_id(current_user),
            **payload.model_dump(exclude_none=True),
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        raise_research_error(error)
    return ProjectPatientResponse.model_validate(project_patient)


@router.delete("/{project_id}/patients/{project_patient_id}", response_model=ProjectPatientResponse)
async def withdraw_project_patient(
    project_id: str,
    project_patient_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> ProjectPatientResponse:
    try:
        project_patient = await service.withdraw_project_patient(
            project_id=project_id,
            project_patient_id=project_patient_id,
            owner_id=user_scope_id(current_user),
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        raise_research_error(error)
    return ProjectPatientResponse.model_validate(project_patient)
