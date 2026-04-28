from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field

from app.core.auth import CurrentUser, get_current_user
from app.services.ehr_service import EhrService
from app.services.patient_service import PatientService

router = APIRouter(prefix="/patients", tags=["patients"])


class PatientBase(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    gender: str | None = Field(default=None, max_length=20)
    birth_date: date | None = None
    age: int | None = Field(default=None, ge=0, le=150)
    department: str | None = Field(default=None, max_length=100)
    main_diagnosis: str | None = Field(default=None, max_length=500)
    doctor_name: str | None = Field(default=None, max_length=100)
    extra_json: dict[str, Any] | None = None


class PatientCreate(PatientBase):
    name: str = Field(..., min_length=1, max_length=100)


class PatientUpdate(PatientBase):
    pass


class PatientResponse(PatientBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
    deleted_at: datetime | None = None


class PatientListResponse(BaseModel):
    items: list[PatientResponse]
    total: int
    page: int
    page_size: int


class EhrFieldValue(BaseModel):
    value_text: str | None = None
    value_number: float | None = None
    value_date: date | None = None
    value_datetime: datetime | None = None
    value_json: dict[str, Any] | list[Any] | None = None
    unit: str | None = None


class EhrFieldUpdate(EhrFieldValue):
    record_instance_id: str | None = None
    field_key: str | None = None
    value_type: str = Field(default="text", max_length=50)
    note: str | None = None


class EhrSelectEventRequest(BaseModel):
    event_id: str


class EhrContextResponse(BaseModel):
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


class EhrRecordResponse(BaseModel):
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


class EhrCurrentValueResponse(EhrFieldValue):
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


class EhrEventResponse(EhrFieldValue):
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


class EhrEvidenceResponse(BaseModel):
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


class EhrResponse(BaseModel):
    context: EhrContextResponse | None
    schema_: dict[str, Any] | None = Field(default=None, alias="schema")
    records: list[EhrRecordResponse]
    current_values: dict[str, EhrCurrentValueResponse]


def get_patient_service() -> PatientService:
    return PatientService()


def get_ehr_service() -> EhrService:
    return EhrService()


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
    patients, total = await service.list_patients(
        page=page,
        page_size=page_size,
        keyword=keyword,
        department=department,
    )
    return PatientListResponse(items=patients, total=total, page=page, page_size=page_size)


@router.post("", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
async def create_patient(
    payload: PatientCreate,
    current_user: CurrentUser = Depends(get_current_user),
    service: PatientService = Depends(get_patient_service),
) -> PatientResponse:
    patient = await service.create_patient(
        created_by=current_user.id,
        **payload.model_dump(exclude_none=True),
    )
    return PatientResponse.model_validate(patient)


@router.get("/{patient_id}", response_model=PatientResponse)
async def get_patient(
    patient_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: PatientService = Depends(get_patient_service),
) -> PatientResponse:
    patient = await service.get_patient(patient_id)
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    return PatientResponse.model_validate(patient)


@router.get("/{patient_id}/ehr", response_model=EhrResponse)
async def get_patient_ehr(
    patient_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: EhrService = Depends(get_ehr_service),
) -> EhrResponse:
    ehr = await service.get_patient_ehr(patient_id, created_by=current_user.id)
    return EhrResponse.model_validate(ehr)


@router.patch("/{patient_id}/ehr/fields/{field_path}", response_model=EhrCurrentValueResponse)
async def update_patient_ehr_field(
    patient_id: str,
    field_path: str,
    payload: EhrFieldUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    service: EhrService = Depends(get_ehr_service),
) -> EhrCurrentValueResponse:
    values = payload.model_dump(
        include={"value_text", "value_number", "value_date", "value_datetime", "value_json", "unit"},
        exclude_none=True,
    )
    current = await service.manual_update_field(
        patient_id=patient_id,
        field_path=field_path,
        record_instance_id=payload.record_instance_id,
        field_key=payload.field_key,
        value_type=payload.value_type,
        edited_by=current_user.id,
        note=payload.note,
        values=values,
    )
    return EhrCurrentValueResponse.model_validate(current)


@router.get("/{patient_id}/ehr/fields/{field_path}/events", response_model=list[EhrEventResponse])
async def list_patient_ehr_field_events(
    patient_id: str,
    field_path: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: EhrService = Depends(get_ehr_service),
) -> list[EhrEventResponse]:
    events = await service.list_field_events(patient_id=patient_id, field_path=field_path)
    return [EhrEventResponse.model_validate(event) for event in events]


@router.post("/{patient_id}/ehr/fields/{field_path}/select-event", response_model=EhrCurrentValueResponse)
async def select_patient_ehr_field_event(
    patient_id: str,
    field_path: str,
    payload: EhrSelectEventRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: EhrService = Depends(get_ehr_service),
) -> EhrCurrentValueResponse:
    current = await service.select_field_event(
        patient_id=patient_id,
        field_path=field_path,
        event_id=payload.event_id,
        selected_by=current_user.id,
    )
    return EhrCurrentValueResponse.model_validate(current)


@router.get("/{patient_id}/ehr/fields/{field_path}/evidence", response_model=list[EhrEvidenceResponse])
async def list_patient_ehr_field_evidence(
    patient_id: str,
    field_path: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: EhrService = Depends(get_ehr_service),
) -> list[EhrEvidenceResponse]:
    evidences = await service.list_field_evidence(patient_id=patient_id, field_path=field_path)
    return [EhrEvidenceResponse.model_validate(evidence) for evidence in evidences]


@router.patch("/{patient_id}", response_model=PatientResponse)
async def update_patient(
    patient_id: str,
    payload: PatientUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    service: PatientService = Depends(get_patient_service),
) -> PatientResponse:
    patient = await service.update_patient(
        patient_id,
        **payload.model_dump(exclude_unset=True),
    )
    return PatientResponse.model_validate(patient)


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_patient(
    patient_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: PatientService = Depends(get_patient_service),
) -> Response:
    await service.delete_patient(patient_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
