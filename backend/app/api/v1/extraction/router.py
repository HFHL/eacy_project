from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field

from app.core.auth import CurrentUser, get_current_user
from app.services.extraction_service import ExtractionConflictError, ExtractionNotFoundError, ExtractionService

router = APIRouter(prefix="/extraction-jobs", tags=["extraction-jobs"])


class ExtractionJobCreate(BaseModel):
    job_type: str = Field(default="patient_ehr", max_length=50)
    priority: int = 0
    patient_id: str | None = None
    document_id: str | None = None
    project_id: str | None = None
    project_patient_id: str | None = None
    context_id: str | None = None
    schema_version_id: str | None = None
    target_form_key: str | None = Field(default=None, max_length=100)
    input_json: dict[str, Any] | None = None


class ExtractionJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    job_type: str
    status: str
    priority: int | None = None
    patient_id: str | None = None
    document_id: str | None = None
    project_id: str | None = None
    project_patient_id: str | None = None
    context_id: str | None = None
    schema_version_id: str | None = None
    target_form_key: str | None = None
    input_json: dict[str, Any] | None = None
    progress: int | None = None
    error_message: str | None = None
    requested_by: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ExtractionRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    job_id: str
    run_no: int
    status: str
    model_name: str | None = None
    prompt_version: str | None = None
    input_snapshot_json: dict[str, Any] | None = None
    raw_output_json: dict[str, Any] | None = None
    parsed_output_json: dict[str, Any] | None = None
    validation_status: str | None = None
    error_message: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime


def get_extraction_service() -> ExtractionService:
    return ExtractionService()


def _raise_extraction_error(error: ExtractionNotFoundError | ExtractionConflictError) -> None:
    if isinstance(error, ExtractionNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error))
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error))


@router.post("", response_model=ExtractionJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_extraction_job(
    payload: ExtractionJobCreate,
    current_user: CurrentUser = Depends(get_current_user),
    service: ExtractionService = Depends(get_extraction_service),
) -> ExtractionJobResponse:
    try:
        job = await service.create_and_process_job(
            requested_by=current_user.id,
            **payload.model_dump(exclude_none=True),
        )
    except (ExtractionNotFoundError, ExtractionConflictError) as error:
        _raise_extraction_error(error)
    return ExtractionJobResponse.model_validate(job)


@router.get("/{job_id}", response_model=ExtractionJobResponse)
async def get_extraction_job(
    job_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: ExtractionService = Depends(get_extraction_service),
) -> ExtractionJobResponse:
    job = await service.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Extraction job not found")
    return ExtractionJobResponse.model_validate(job)


@router.get("/{job_id}/runs", response_model=list[ExtractionRunResponse])
async def list_extraction_runs(
    job_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: ExtractionService = Depends(get_extraction_service),
) -> list[ExtractionRunResponse]:
    try:
        runs = await service.list_runs(job_id)
    except (ExtractionNotFoundError, ExtractionConflictError) as error:
        _raise_extraction_error(error)
    return [ExtractionRunResponse.model_validate(run) for run in runs]


@router.post("/{job_id}/cancel", response_model=ExtractionJobResponse)
async def cancel_extraction_job(
    job_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: ExtractionService = Depends(get_extraction_service),
) -> ExtractionJobResponse:
    try:
        job = await service.cancel_job(job_id)
    except (ExtractionNotFoundError, ExtractionConflictError) as error:
        _raise_extraction_error(error)
    return ExtractionJobResponse.model_validate(job)


@router.post("/{job_id}/retry", response_model=ExtractionJobResponse)
async def retry_extraction_job(
    job_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: ExtractionService = Depends(get_extraction_service),
) -> ExtractionJobResponse:
    try:
        job = await service.retry_job(job_id)
    except (ExtractionNotFoundError, ExtractionConflictError) as error:
        _raise_extraction_error(error)
    return ExtractionJobResponse.model_validate(job)


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_extraction_job(
    job_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: ExtractionService = Depends(get_extraction_service),
) -> Response:
    try:
        await service.delete_job(job_id)
    except (ExtractionNotFoundError, ExtractionConflictError) as error:
        _raise_extraction_error(error)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
