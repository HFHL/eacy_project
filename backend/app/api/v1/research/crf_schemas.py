from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


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
    record_instance_id: str | None = None


class CrfSelectCandidateRequest(BaseModel):
    candidate_id: str
    record_instance_id: str | None = None


class CrfRecordCreate(BaseModel):
    form_key: str = Field(..., min_length=1, max_length=100)
    form_title: str | None = Field(default=None, max_length=200)
    group_key: str | None = Field(default=None, max_length=100)
    group_title: str | None = Field(default=None, max_length=200)
    instance_label: str | None = Field(default=None, max_length=200)


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
    source_page: int | None = None
    source_text: str | None = None
    source_location: dict[str, Any] | list[Any] | None = None
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


class CrfCandidateResponse(BaseModel):
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


class CrfCandidatesResponse(BaseModel):
    candidates: list[CrfCandidateResponse]
    selected_candidate_id: str | None = None
    selected_value: Any = None
    has_value_conflict: bool = False
    distinct_value_count: int = 0


class CrfResponse(BaseModel):
    context: CrfContextResponse | None
    schema_: dict[str, Any] | None = Field(default=None, alias="schema")
    records: list[CrfRecordResponse]
    current_values: dict[str, CrfCurrentValueResponse]


class CrfFolderUpdateResponse(BaseModel):
    batch_id: str | None = None
    project_id: str
    project_patient_id: str
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
    planning_submitted: bool = False
    message: str | None = None


class CrfFolderUpdateRequest(BaseModel):
    target_form_keys: list[str] | None = None
    mode: str = Field(default="incremental", max_length=20)


class ProjectCrfFolderBatchRequest(BaseModel):
    project_patient_ids: list[str] | None = None
    target_form_keys: list[str] | None = None
    mode: str = Field(default="incremental", max_length=20)


class ProjectCrfFolderBatchResponse(BaseModel):
    batch_id: str | None = None
    project_id: str
    total_project_patients: int
    processed_patients: int
    documents_total: int
    eligible_documents: int
    already_extracted_documents: int
    planned_documents: int
    created_jobs: int
    submitted_jobs: int = 0
    completed_jobs: int = 0
    failed_jobs: int = 0
    job_ids: list[str]
    skipped_patients: list[dict[str, str]] = Field(default_factory=list)
    skipped_documents: list[dict[str, str]] = Field(default_factory=list)
    planning_submitted: bool = False
    message: str | None = None
