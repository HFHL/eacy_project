from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field

from app.core.auth import CurrentUser, get_current_user, uuid_user_id_or_none
from app.services.extraction_service import ExtractionConflictError, ExtractionNotFoundError, ExtractionService
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


class PatientProjectItem(BaseModel):
    id: str
    project_code: str | None = None
    project_name: str | None = None
    status: str | None = None
    enroll_no: str | None = None
    enrolled_at: datetime | None = None


class PatientResponse(PatientBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
    deleted_at: datetime | None = None
    projects: list[PatientProjectItem] = Field(default_factory=list)
    # 后端聚合的统计字段（患者池/患者详情共用）
    document_count: int = 0
    data_completeness: float = 0.0


class PatientListStatistics(BaseModel):
    total_documents: int = 0
    average_completeness: float = 0.0
    recently_added_today: int = 0


class PatientListResponse(BaseModel):
    items: list[PatientResponse]
    total: int
    page: int
    page_size: int
    # 当前页的聚合统计（前端患者池顶部卡片读取此字段）
    statistics: PatientListStatistics = Field(default_factory=PatientListStatistics)


class EhrExtractionStatusRequest(BaseModel):
    patient_ids: list[str] = Field(default_factory=list, max_length=200)


class EhrExtractionStatusItem(BaseModel):
    patient_id: str
    active: bool
    job_count: int
    latest_started_at: datetime | None = None
    latest_updated_at: datetime | None = None
    latest_status: str | None = None


class EhrExtractionStatusResponse(BaseModel):
    items: list[EhrExtractionStatusItem]


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


class EhrSelectCandidateRequest(BaseModel):
    candidate_id: str


class EhrRecordCreate(BaseModel):
    form_key: str = Field(..., min_length=1, max_length=100)
    form_title: str | None = Field(default=None, max_length=200)
    group_key: str | None = Field(default=None, max_length=100)
    group_title: str | None = Field(default=None, max_length=200)
    instance_label: str | None = Field(default=None, max_length=200)


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
    source_page: int | None = None
    source_text: str | None = None
    source_location: dict[str, Any] | list[Any] | None = None
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


class EhrCandidateResponse(BaseModel):
    id: str
    event_id: str
    value: Any = None
    value_type: str
    review_status: str
    confidence: float | None = None
    source_document_id: str | None = None
    source_page: int | None = None
    source_text: str | None = None
    source_location: dict[str, Any] | list[Any] | None = None
    created_at: datetime


class EhrCandidatesResponse(BaseModel):
    candidates: list[EhrCandidateResponse]
    selected_candidate_id: str | None = None
    selected_value: Any = None
    has_value_conflict: bool = False
    distinct_value_count: int = 0


class EhrResponse(BaseModel):
    context: EhrContextResponse | None
    schema_: dict[str, Any] | None = Field(default=None, alias="schema")
    records: list[EhrRecordResponse]
    current_values: dict[str, EhrCurrentValueResponse]


class EhrFolderUpdateResponse(BaseModel):
    batch_id: str | None = None
    patient_id: str
    documents_total: int
    eligible_documents: int
    already_extracted_documents: int
    planned_documents: int
    created_jobs: int
    submitted_jobs: int = 0
    completed_jobs: int = 0
    failed_jobs: int = 0
    job_ids: list[str]
    skipped: list[dict[str, str]] = Field(default_factory=list)


def get_patient_service() -> PatientService:
    return PatientService()


def user_scope_id(current_user: CurrentUser) -> str | None:
    return uuid_user_id_or_none(current_user)


def get_ehr_service() -> EhrService:
    return EhrService()


def get_extraction_service() -> ExtractionService:
    return ExtractionService()


def _patient_response(patient, stats: dict[str, Any] | None) -> PatientResponse:
    response = PatientResponse.model_validate(patient)
    stats = stats or {}
    response.document_count = int(stats.get("document_count", 0) or 0)
    response.data_completeness = float(stats.get("data_completeness", 0.0) or 0.0)
    return response


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
    items = [_patient_response(patient, stats_by_id.get(patient.id)) for patient in patients]
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
    return _patient_response(patient, stats)


@router.post("/ehr-extraction-status", response_model=EhrExtractionStatusResponse)
async def get_ehr_extraction_status_batch(
    payload: EhrExtractionStatusRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: ExtractionService = Depends(get_extraction_service),
) -> EhrExtractionStatusResponse:
    """批量返回若干患者当前是否有活跃 (pending/running) 的 patient_ehr 抽取任务。

    用于左侧患者 rail 的"病历夹更新中"指示器，前端定期轮询此端点。
    """
    _ = current_user  # 暂未启用按用户范围过滤；patient_id 列表已由前端限制为可见集合
    patient_ids = [str(pid) for pid in (payload.patient_ids or []) if pid]
    status_map = await service.list_active_ehr_status_by_patients(patient_ids)
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
    projects = await service.list_patient_projects(patient_id)
    stats = await service.get_patient_stats(patient, owner_id=user_scope_id(current_user))
    response = _patient_response(patient, stats)
    response.projects = [PatientProjectItem.model_validate(item) for item in projects]
    return response


@router.get("/{patient_id}/ehr", response_model=EhrResponse)
async def get_patient_ehr(
    patient_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: EhrService = Depends(get_ehr_service),
) -> EhrResponse:
    ehr = await service.get_patient_ehr(patient_id, created_by=uuid_user_id_or_none(current_user))
    return EhrResponse.model_validate(ehr)


@router.post("/{patient_id}/ehr/update-folder", response_model=EhrFolderUpdateResponse, status_code=status.HTTP_202_ACCEPTED)
async def update_patient_ehr_folder(
    patient_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: ExtractionService = Depends(get_extraction_service),
) -> EhrFolderUpdateResponse:
    try:
        result = await service.update_patient_ehr_folder(patient_id=patient_id, requested_by=uuid_user_id_or_none(current_user))
    except ExtractionNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error))
    except ExtractionConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error))
    return EhrFolderUpdateResponse.model_validate(
        {
            **result,
            "job_ids": [job.id for job in result.get("jobs", [])],
        }
    )


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
        edited_by=uuid_user_id_or_none(current_user),
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


@router.get("/{patient_id}/ehr/fields/{field_path}/candidates", response_model=EhrCandidatesResponse)
async def list_patient_ehr_field_candidates(
    patient_id: str,
    field_path: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: EhrService = Depends(get_ehr_service),
) -> EhrCandidatesResponse:
    candidates = await service.list_field_candidates(patient_id=patient_id, field_path=field_path)
    return EhrCandidatesResponse.model_validate(candidates)


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
        selected_by=uuid_user_id_or_none(current_user),
    )
    return EhrCurrentValueResponse.model_validate(current)


@router.post("/{patient_id}/ehr/fields/{field_path}/select-candidate", response_model=EhrCurrentValueResponse)
async def select_patient_ehr_field_candidate(
    patient_id: str,
    field_path: str,
    payload: EhrSelectCandidateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: EhrService = Depends(get_ehr_service),
) -> EhrCurrentValueResponse:
    current = await service.select_field_event(
        patient_id=patient_id,
        field_path=field_path,
        event_id=payload.candidate_id,
        selected_by=uuid_user_id_or_none(current_user),
    )
    return EhrCurrentValueResponse.model_validate(current)


@router.delete("/{patient_id}/ehr/fields/{field_path}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_patient_ehr_field(
    patient_id: str,
    field_path: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: EhrService = Depends(get_ehr_service),
) -> Response:
    await service.delete_field_value(patient_id=patient_id, field_path=field_path)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{patient_id}/ehr/records", response_model=EhrRecordResponse, status_code=status.HTTP_201_CREATED)
async def create_patient_ehr_record(
    patient_id: str,
    payload: EhrRecordCreate,
    current_user: CurrentUser = Depends(get_current_user),
    service: EhrService = Depends(get_ehr_service),
) -> EhrRecordResponse:
    record = await service.create_record_instance(patient_id=patient_id, **payload.model_dump(exclude_none=True))
    return EhrRecordResponse.model_validate(record)


@router.delete("/{patient_id}/ehr/records/{record_instance_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_patient_ehr_record(
    patient_id: str,
    record_instance_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: EhrService = Depends(get_ehr_service),
) -> Response:
    await service.delete_record_instance(patient_id=patient_id, record_instance_id=record_instance_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
        owner_id=user_scope_id(current_user),
        **payload.model_dump(exclude_unset=True),
    )
    projects = await service.list_patient_projects(patient_id)
    stats = await service.get_patient_stats(patient, owner_id=user_scope_id(current_user))
    response = _patient_response(patient, stats)
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
