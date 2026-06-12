from __future__ import annotations

from fastapi import HTTPException, status

from app.core.auth import CurrentUser, uuid_user_id_or_none
from app.services.extraction_service import ExtractionService
from app.services.research_project_export_service import ResearchProjectExportService
from app.services.research_project_service import (
    ResearchProjectConflictError,
    ResearchProjectNotFoundError,
    ResearchProjectService,
)
from app.services.task_progress_service import TaskProgressService

from .project_schemas import ResearchProjectResponse


def get_research_project_service() -> ResearchProjectService:
    return ResearchProjectService()


def user_scope_id(current_user: CurrentUser) -> str | None:
    return uuid_user_id_or_none(current_user)


def get_extraction_service() -> ExtractionService:
    return ExtractionService()


def get_task_progress_service() -> TaskProgressService:
    return TaskProgressService()


def get_research_project_export_service() -> ResearchProjectExportService:
    return ResearchProjectExportService()


def raise_research_error(error: ResearchProjectNotFoundError | ResearchProjectConflictError) -> None:
    if isinstance(error, ResearchProjectNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error))
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error))


def project_response(project, stats: dict | None) -> ResearchProjectResponse:
    response = ResearchProjectResponse.model_validate(project)
    stats = stats or {}
    response.actual_patient_count = int(stats.get("actual_patient_count", 0) or 0)
    response.expected_patient_count = stats.get("expected_patient_count")
    response.avg_completeness = float(stats.get("avg_completeness", 0.0) or 0.0)
    response.principal_investigator_name = str(stats.get("principal_investigator_name", "") or "")
    return response
