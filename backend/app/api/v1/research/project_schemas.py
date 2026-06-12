from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


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
    actual_patient_count: int = 0
    expected_patient_count: int | None = None
    avg_completeness: float = 0.0
    principal_investigator_name: str = ""


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


class CrfGroupStatsItem(BaseModel):
    group_name: str = ""
    filled: int = 0
    total: int = 0
    percent: int = 0


class ProjectPatientListItemResponse(ProjectPatientResponse):
    patient_name: str = ""
    patient_gender: str | None = None
    patient_age: int | None = None
    patient_birth_date: str | None = None
    document_count: int = 0
    crf_completeness: float = 0
    crf_group_stats: dict[str, CrfGroupStatsItem] = Field(default_factory=dict)


class ProjectPatientListResponse(BaseModel):
    items: list[ProjectPatientListItemResponse]
    total: int
    page: int
    page_size: int


class ProjectPatientCrfGroupFieldsRequest(BaseModel):
    group_id: str = Field(..., min_length=1)
    project_patient_ids: list[str] = Field(default_factory=list, max_length=200)


class ProjectPatientCrfGroupFieldsItem(BaseModel):
    project_patient_id: str
    fields: dict[str, dict[str, Any]] = Field(default_factory=dict)


class ProjectPatientCrfGroupFieldsResponse(BaseModel):
    items: list[ProjectPatientCrfGroupFieldsItem] = Field(default_factory=list)


class ProjectCrfExportRequest(BaseModel):
    format: str = Field(default="excel", max_length=20)
    scope: str = Field(default="all", max_length=20)
    patient_ids: list[str] | None = None
    expand_repeatable_rows: bool = True
