from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


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


class PatientAiSummarySourceDocument(BaseModel):
    id: str
    name: str
    ref: str | None = None
    type: str | None = None


class PatientAiSummaryResponse(BaseModel):
    content: str = ""
    generated_at: datetime | None = None
    source_documents: list[PatientAiSummarySourceDocument] = Field(default_factory=list)


class PatientAiSummarySaveRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=20000)


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
    record_instance_id: str | None = None


class EhrSelectCandidateRequest(BaseModel):
    candidate_id: str
    record_instance_id: str | None = None


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


class EhrSchemaResponse(BaseModel):
    schema_: dict[str, Any] | None = Field(default=None, alias="schema")


class EhrFolderUpdateRequest(BaseModel):
    target_form_keys: list[str] | None = None
    mode: str = Field(default="incremental", max_length=20)


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


def patient_response(patient: Any, stats: dict[str, Any] | None) -> PatientResponse:
    response = PatientResponse.model_validate(patient)
    stats = stats or {}
    response.document_count = int(stats.get("document_count", 0) or 0)
    response.data_completeness = float(stats.get("data_completeness", 0.0) or 0.0)
    return response
