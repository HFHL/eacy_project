from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


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

    @field_validator("effective_at", mode="before")
    @classmethod
    def parse_effective_at(cls, value: Any) -> datetime | None:
        if value is None or value == "":
            return None
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            text = value.strip()
            if len(text) == 10 and text[4] == "-" and text[7] == "-":
                return datetime.fromisoformat(f"{text}T00:00:00")
            normalized = text.replace("Z", "+00:00")
            if " " in normalized and "T" not in normalized:
                normalized = normalized.replace(" ", "T", 1)
            return datetime.fromisoformat(normalized)
        return value


class DocumentArchiveRequest(BaseModel):
    patient_id: str
    create_extraction_job: bool = True


class DocumentStatusesRequest(BaseModel):
    document_ids: list[str] = Field(default_factory=list, max_length=200)


class DocumentBatchArchiveRequest(BaseModel):
    document_ids: list[str] = Field(..., min_length=1)
    patient_id: str
    create_extraction_job: bool = True


class LinkedPatientSummary(BaseModel):
    patient_id: str
    patient_name: str
    patient_code: str | None = None
    gender: str | None = None
    age: int | None = None
    department: str | None = None
    main_diagnosis: str | None = None


class ExtractionRecordItem(BaseModel):
    extraction_id: str
    job_type: str | None = None
    status: str | None = None
    created_at: datetime | None = None
    extracted_ehr_data: dict[str, Any] = Field(default_factory=dict)
    is_merged: bool = False
    merged_at: datetime | None = None
    conflict_count: int = 0


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    patient_id: str | None = None
    original_filename: str
    file_ext: str | None = None
    mime_type: str | None = None
    file_size: int | None = None
    storage_provider: str | None = None
    storage_path: str | None = None
    file_url: str | None = None
    status: str
    ocr_status: str | None = None
    ocr_text: str | None = None
    ocr_payload_json: dict[str, Any] | None = None
    parsed_content: str | None = None
    parsed_data: dict[str, Any] | None = None
    content_list: list[dict[str, Any]] = Field(default_factory=list)
    meta_status: str | None = None
    metadata_json: dict[str, Any] | None = None
    document_metadata_summary: dict[str, Any] | None = None
    doc_type: str | None = None
    doc_subtype: str | None = None
    doc_title: str | None = None
    effective_at: datetime | None = None
    uploaded_by: str | None = None
    archived_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    linked_patients: list[LinkedPatientSummary] = Field(default_factory=list)
    extraction_records: list[ExtractionRecordItem] = Field(default_factory=list)
    extraction_count: int = 0
    preview_source: str | None = None
    ocr_page_count: int | None = None


class BoundPatientSummary(BaseModel):
    patient_id: str
    name: str | None = None
    gender: str | None = None
    age: int | None = None


class DocumentSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    patient_id: str | None = None
    original_filename: str
    file_ext: str | None = None
    mime_type: str | None = None
    file_size: int | None = None
    storage_provider: str | None = None
    storage_path: str | None = None
    file_url: str | None = None
    status: str
    ocr_status: str | None = None
    meta_status: str | None = None
    extract_status: str | None = None
    metadata_json: dict[str, Any] | None = None
    document_metadata_summary: dict[str, Any] | None = None
    doc_type: str | None = None
    doc_subtype: str | None = None
    doc_title: str | None = None
    effective_at: datetime | None = None
    uploaded_by: str | None = None
    archived_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    bound_patient: BoundPatientSummary | None = None


class DocumentListResponse(BaseModel):
    items: list[DocumentSummaryResponse]
    total: int
    page: int
    page_size: int


class DocumentStatusesResponse(BaseModel):
    items: list[DocumentSummaryResponse]


class DocumentBatchArchiveResponse(BaseModel):
    items: list[DocumentResponse]
    total: int


class EvidenceImpactField(BaseModel):
    code: str
    title: str


class DocumentEvidenceImpactResponse(BaseModel):
    document_id: str
    evidence_count: int = 0
    fields: list[EvidenceImpactField] = Field(default_factory=list)


class DocumentArchiveTreeResponse(BaseModel):
    total: int
    counts: dict[str, int]
    todo_groups: list[dict[str, Any]]
    archived_patients: list[dict[str, Any]]


class DocumentArchiveCountsResponse(BaseModel):
    total: int
    counts: dict[str, int]


class DocumentGroupDocumentsResponse(BaseModel):
    items: list[DocumentSummaryResponse]
    group: dict[str, Any]
    match_info: dict[str, Any]
    pagination: dict[str, Any]


class DocumentGroupArchiveResponse(BaseModel):
    archived_count: int
    failed_count: int = 0
    errors: list[dict[str, Any]] = Field(default_factory=list)
    archived_document_ids: list[str]


class DocumentMatchInfoResponse(BaseModel):
    document_id: str
    group_id: str | None = None
    document_metadata: dict[str, Any] = Field(default_factory=dict)
    extracted_info: dict[str, Any] = Field(default_factory=dict)
    matched_patient_id: str | None = None
    match_score: float | int = 0
    confidence: float | int = 0
    match_result: str = "uncertain"
    candidates: list[dict[str, Any]] = Field(default_factory=list)
    ai_recommendation: str | None = None
    ai_reason: str | None = None


class DocumentPreviewUrlResponse(BaseModel):
    document_id: str
    url: str
    temp_url: str
    preview_url: str
    expires_in: int
    storage_provider: str | None = None
    mime_type: str | None = None
    file_name: str
    file_type: str | None = None
    preview_source: str = "native"
    page_no: int | None = None
    ocr_page_count: int | None = None
