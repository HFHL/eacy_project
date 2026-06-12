from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.v1.tasks.router import TaskBatchResponse
from app.core.auth import CurrentUser, get_current_user, uuid_user_id_or_none
from app.services.extraction_service import (
    ExtractionConflictError,
    ExtractionNotFoundError,
    ExtractionService,
    ExtractionTargetValidationError,
)
from app.services.research_project_service import ResearchProjectService
from app.services.task_progress_service import TaskProgressService

from .crf_schemas import (
    CrfFolderUpdateRequest,
    CrfFolderUpdateResponse,
    ProjectCrfFolderBatchRequest,
    ProjectCrfFolderBatchResponse,
)
from .dependencies import get_extraction_service, get_research_project_service, get_task_progress_service

router = APIRouter()


@router.post(
    "/{project_id}/patients/{project_patient_id}/crf/update-folder",
    response_model=CrfFolderUpdateResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def update_project_patient_crf_folder(
    project_id: str,
    project_patient_id: str,
    payload: CrfFolderUpdateRequest | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    service: ExtractionService = Depends(get_extraction_service),
) -> CrfFolderUpdateResponse:
    body = payload or CrfFolderUpdateRequest()
    try:
        result = await service.update_project_crf_folder(
            project_id=project_id,
            project_patient_id=project_patient_id,
            requested_by=uuid_user_id_or_none(current_user),
            target_form_keys=body.target_form_keys,
            mode=body.mode,
        )
    except ExtractionNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error))
    except ExtractionTargetValidationError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error.to_detail())
    except ExtractionConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error))
    return CrfFolderUpdateResponse.model_validate(
        {
            **result,
            "job_ids": [job.id for job in result.get("jobs", [])],
        }
    )


@router.post(
    "/{project_id}/crf/update-folder",
    response_model=ProjectCrfFolderBatchResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def update_project_crf_folder_batch(
    project_id: str,
    payload: ProjectCrfFolderBatchRequest | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    service: ExtractionService = Depends(get_extraction_service),
) -> ProjectCrfFolderBatchResponse:
    body = payload or ProjectCrfFolderBatchRequest()
    try:
        result = await service.update_project_crf_folder_batch(
            project_id=project_id,
            project_patient_ids=body.project_patient_ids,
            requested_by=uuid_user_id_or_none(current_user),
            target_form_keys=body.target_form_keys,
            mode=body.mode,
        )
    except ExtractionNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error))
    except ExtractionTargetValidationError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error.to_detail())
    except ExtractionConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error))
    return ProjectCrfFolderBatchResponse.model_validate(
        {
            **result,
            "job_ids": [job.id for job in result.get("jobs", [])],
        }
    )


@router.get(
    "/{project_id}/crf/extraction-batches/active",
    response_model=list[TaskBatchResponse],
)
async def list_active_project_extraction_batches(
    project_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    research_service: ResearchProjectService = Depends(get_research_project_service),
    task_service: TaskProgressService = Depends(get_task_progress_service),
) -> list[TaskBatchResponse]:
    project = await research_service.get_project(project_id, owner_id=uuid_user_id_or_none(current_user))
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Research project not found")
    payloads = await task_service.list_active_batches_for_project(
        project_id,
        requested_by=uuid_user_id_or_none(current_user),
    )
    return [TaskBatchResponse.model_validate(payload) for payload in payloads]
