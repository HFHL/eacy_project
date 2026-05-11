from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.core.auth import CurrentUser, get_current_user
from app.services.task_progress_service import TaskProgressService

router = APIRouter(prefix="/task-batches", tags=["task-batches"])


class TaskItemResponse(BaseModel):
    task_id: str
    id: str
    batch_id: str | None = None
    task_type: str
    status: str
    progress: int
    stage: str | None = None
    stage_label: str | None = None
    message: str | None = None
    document_id: str | None = None
    patient_id: str | None = None
    project_id: str | None = None
    project_patient_id: str | None = None
    target_form_key: str | None = None
    extraction_job_id: str | None = None
    extraction_run_id: str | None = None
    error_message: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None


class TaskBatchResponse(BaseModel):
    batch_id: str
    id: str
    task_type: str
    title: str | None = None
    status: str
    progress: int
    total_items: int
    running_items: int
    queued_items: int
    succeeded_items: int
    failed_items: int
    cancelled_items: int
    message: str | None = None
    error_message: str | None = None
    patient_id: str | None = None
    document_id: str | None = None
    project_id: str | None = None
    project_patient_id: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    items: list[TaskItemResponse]


class TaskEventResponse(BaseModel):
    id: str
    batch_id: str | None = None
    item_id: str | None = None
    event_type: str
    status: str | None = None
    progress: int | None = None
    stage: str | None = None
    message: str | None = None
    payload_json: dict[str, Any] | None = None
    created_at: datetime


def get_task_progress_service() -> TaskProgressService:
    return TaskProgressService()


@router.get("/{batch_id}", response_model=TaskBatchResponse)
async def get_task_batch(
    batch_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: TaskProgressService = Depends(get_task_progress_service),
) -> TaskBatchResponse:
    payload = await service.get_batch_payload(batch_id)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task batch not found")
    return TaskBatchResponse.model_validate(payload)


@router.get("/{batch_id}/events", response_model=list[TaskEventResponse])
async def list_task_batch_events(
    batch_id: str,
    after_id: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    current_user: CurrentUser = Depends(get_current_user),
    service: TaskProgressService = Depends(get_task_progress_service),
) -> list[TaskEventResponse]:
    payload = await service.get_batch_payload(batch_id)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task batch not found")
    events = await service.list_batch_events(batch_id, after_id=after_id, limit=limit)
    return [TaskEventResponse.model_validate(event, from_attributes=True) for event in events]
