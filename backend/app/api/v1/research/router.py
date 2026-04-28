from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field

from app.core.auth import CurrentUser, get_current_user
from app.services.research_project_service import (
    ResearchProjectConflictError,
    ResearchProjectNotFoundError,
    ResearchProjectService,
)

router = APIRouter(prefix="/projects", tags=["projects"])


class ResearchProjectCreate(BaseModel):
    project_code: str = Field(..., min_length=1, max_length=100)
    project_name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    status: str = Field(default="active", max_length=50)
    start_date: date | None = None
    end_date: date | None = None
    extra_json: dict[str, Any] | None = None


class ResearchProjectUpdate(BaseModel):
    project_name: str | None = Field(default=None, max_length=200)
    description: str | None = None
    status: str | None = Field(default=None, max_length=50)
    start_date: date | None = None
    end_date: date | None = None
    extra_json: dict[str, Any] | None = None


class TemplateBindingCreate(BaseModel):
    template_id: str
    schema_version_id: str
    binding_type: str = Field(default="primary_crf", max_length=50)


class ProjectPatientCreate(BaseModel):
    patient_id: str
    enroll_no: str | None = Field(default=None, max_length=100)
    extra_json: dict[str, Any] | None = None


class CrfFieldValue(BaseModel):
    value_text: str | None = None
    value_number: float | None = None
    value_date: date | None = None
    value_datetime: datetime | None = None
    value_json: dict[str, Any] | list[Any] | None = None
    unit: str | None = None


class CrfFieldUpdate(CrfFieldValue):
    record_instance_id: str | None = None
    field_key: str | None = None
    value_type: str = Field(default="text", max_length=50)
    note: str | None = None


class CrfSelectEventRequest(BaseModel):
    event_id: str


class ResearchProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_code: str
    project_name: str
    description: str | None = None
    status: str
    owner_id: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    extra_json: dict[str, Any] | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ResearchProjectListResponse(BaseModel):
    items: list[ResearchProjectResponse]
    total: int
    page: int
    page_size: int


class TemplateBindingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    template_id: str
    schema_version_id: str
    binding_type: str
    status: str
    locked_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ProjectPatientResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    patient_id: str
    enroll_no: str | None = None
    status: str
    enrolled_at: datetime | None = None
    withdrawn_at: datetime | None = None
    extra_json: dict[str, Any] | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class CrfContextResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    context_type: str
    patient_id: str
    project_id: str | None = None
    project_patient_id: str | None = None
    schema_version_id: str
    status: str
    created_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class CrfRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    context_id: str
    group_key: str | None = None
    group_title: str | None = None
    form_key: str
    form_title: str
    repeat_index: int
    instance_label: str | None = None
    anchor_json: dict[str, Any] | None = None
    source_document_id: str | None = None
    created_by_run_id: str | None = None
    review_status: str
    created_at: datetime | None = None
    updated_at: datetime | None = None


class CrfCurrentValueResponse(CrfFieldValue):
    model_config = ConfigDict(from_attributes=True)

    id: str
    context_id: str
    record_instance_id: str
    field_key: str
    field_path: str
    selected_event_id: str | None = None
    value_type: str
    selected_by: str | None = None
    selected_at: datetime | None = None
    review_status: str
    updated_at: datetime | None = None


class CrfEventResponse(CrfFieldValue):
    model_config = ConfigDict(from_attributes=True)

    id: str
    context_id: str
    record_instance_id: str
    field_key: str
    field_path: str
    field_title: str | None = None
    event_type: str
    value_type: str
    normalized_text: str | None = None
    confidence: float | None = None
    extraction_run_id: str | None = None
    source_document_id: str | None = None
    source_event_id: str | None = None
    review_status: str
    created_by: str | None = None
    created_at: datetime
    note: str | None = None


class CrfEvidenceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    value_event_id: str
    document_id: str
    page_no: int | None = None
    bbox_json: dict[str, Any] | list[Any] | None = None
    quote_text: str | None = None
    evidence_type: str
    row_key: str | None = None
    cell_key: str | None = None
    start_offset: int | None = None
    end_offset: int | None = None
    evidence_score: float | None = None
    created_at: datetime


class CrfResponse(BaseModel):
    context: CrfContextResponse | None
    schema_: dict[str, Any] | None = Field(default=None, alias="schema")
    records: list[CrfRecordResponse]
    current_values: dict[str, CrfCurrentValueResponse]


def get_research_project_service() -> ResearchProjectService:
    return ResearchProjectService()


def _raise_research_error(error: ResearchProjectNotFoundError | ResearchProjectConflictError) -> None:
    if isinstance(error, ResearchProjectNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error))
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error))


@router.get("", response_model=ResearchProjectListResponse)
@router.get("/", response_model=ResearchProjectListResponse, include_in_schema=False)
async def list_projects(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status_filter: str | None = Query(default=None, alias="status"),
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> ResearchProjectListResponse:
    projects, total = await service.list_projects(page=page, page_size=page_size, status=status_filter)
    return ResearchProjectListResponse(items=projects, total=total, page=page, page_size=page_size)


@router.post("", response_model=ResearchProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ResearchProjectCreate,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> ResearchProjectResponse:
    try:
        project = await service.create_project(
            owner_id=current_user.id,
            **payload.model_dump(exclude_none=True),
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        _raise_research_error(error)
    return ResearchProjectResponse.model_validate(project)


@router.get("/{project_id}", response_model=ResearchProjectResponse)
async def get_project(
    project_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> ResearchProjectResponse:
    project = await service.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Research project not found")
    return ResearchProjectResponse.model_validate(project)


@router.patch("/{project_id}", response_model=ResearchProjectResponse)
async def update_project(
    project_id: str,
    payload: ResearchProjectUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> ResearchProjectResponse:
    try:
        project = await service.update_project(project_id, **payload.model_dump(exclude_unset=True))
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        _raise_research_error(error)
    return ResearchProjectResponse.model_validate(project)


@router.delete("/{project_id}", response_model=ResearchProjectResponse)
async def archive_project(
    project_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> ResearchProjectResponse:
    try:
        project = await service.archive_project(project_id)
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        _raise_research_error(error)
    return ResearchProjectResponse.model_validate(project)


@router.post("/{project_id}/template-bindings", response_model=TemplateBindingResponse, status_code=status.HTTP_201_CREATED)
async def create_template_binding(
    project_id: str,
    payload: TemplateBindingCreate,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> TemplateBindingResponse:
    try:
        binding = await service.bind_crf_template(project_id=project_id, **payload.model_dump())
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        _raise_research_error(error)
    return TemplateBindingResponse.model_validate(binding)


@router.delete("/{project_id}/template-bindings/{binding_id}", response_model=TemplateBindingResponse)
async def disable_template_binding(
    project_id: str,
    binding_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> TemplateBindingResponse:
    try:
        binding = await service.disable_template_binding(project_id=project_id, binding_id=binding_id)
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        _raise_research_error(error)
    return TemplateBindingResponse.model_validate(binding)


@router.get("/{project_id}/patients", response_model=list[ProjectPatientResponse])
async def list_project_patients(
    project_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> list[ProjectPatientResponse]:
    try:
        patients = await service.list_project_patients(project_id)
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        _raise_research_error(error)
    return [ProjectPatientResponse.model_validate(patient) for patient in patients]


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
            created_by=current_user.id,
            **payload.model_dump(exclude_none=True),
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        _raise_research_error(error)
    return ProjectPatientResponse.model_validate(project_patient)


@router.get("/{project_id}/patients/{project_patient_id}/crf", response_model=CrfResponse)
async def get_project_patient_crf(
    project_id: str,
    project_patient_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> CrfResponse:
    try:
        crf = await service.get_project_crf(
            project_id=project_id,
            project_patient_id=project_patient_id,
            created_by=current_user.id,
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        _raise_research_error(error)
    return CrfResponse.model_validate(crf)


@router.patch("/{project_id}/patients/{project_patient_id}/crf/fields/{field_path}", response_model=CrfCurrentValueResponse)
async def update_project_patient_crf_field(
    project_id: str,
    project_patient_id: str,
    field_path: str,
    payload: CrfFieldUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> CrfCurrentValueResponse:
    values = payload.model_dump(
        include={"value_text", "value_number", "value_date", "value_datetime", "value_json", "unit"},
        exclude_none=True,
    )
    try:
        current = await service.manual_update_crf_field(
            project_id=project_id,
            project_patient_id=project_patient_id,
            field_path=field_path,
            record_instance_id=payload.record_instance_id,
            field_key=payload.field_key,
            value_type=payload.value_type,
            edited_by=current_user.id,
            note=payload.note,
            values=values,
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        _raise_research_error(error)
    return CrfCurrentValueResponse.model_validate(current)


@router.get("/{project_id}/patients/{project_patient_id}/crf/fields/{field_path}/events", response_model=list[CrfEventResponse])
async def list_project_patient_crf_field_events(
    project_id: str,
    project_patient_id: str,
    field_path: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> list[CrfEventResponse]:
    try:
        events = await service.list_crf_field_events(
            project_id=project_id,
            project_patient_id=project_patient_id,
            field_path=field_path,
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        _raise_research_error(error)
    return [CrfEventResponse.model_validate(event) for event in events]


@router.post(
    "/{project_id}/patients/{project_patient_id}/crf/fields/{field_path}/select-event",
    response_model=CrfCurrentValueResponse,
)
async def select_project_patient_crf_field_event(
    project_id: str,
    project_patient_id: str,
    field_path: str,
    payload: CrfSelectEventRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> CrfCurrentValueResponse:
    try:
        current = await service.select_crf_field_event(
            project_id=project_id,
            project_patient_id=project_patient_id,
            field_path=field_path,
            event_id=payload.event_id,
            selected_by=current_user.id,
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        _raise_research_error(error)
    return CrfCurrentValueResponse.model_validate(current)


@router.get("/{project_id}/patients/{project_patient_id}/crf/fields/{field_path}/evidence", response_model=list[CrfEvidenceResponse])
async def list_project_patient_crf_field_evidence(
    project_id: str,
    project_patient_id: str,
    field_path: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> list[CrfEvidenceResponse]:
    try:
        evidences = await service.list_crf_field_evidence(
            project_id=project_id,
            project_patient_id=project_patient_id,
            field_path=field_path,
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        _raise_research_error(error)
    return [CrfEvidenceResponse.model_validate(evidence) for evidence in evidences]


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
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        _raise_research_error(error)
    return ProjectPatientResponse.model_validate(project_patient)
