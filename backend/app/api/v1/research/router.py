from __future__ import annotations

from fastapi import APIRouter

from .crf_routes import router as crf_router
from .crf_schemas import *  # noqa: F403
from .dependencies import (
    get_extraction_service,
    get_research_project_export_service,
    get_research_project_service,
    get_task_progress_service,
    project_response as _project_response,
    raise_research_error as _raise_research_error,
    user_scope_id,
)
from .extraction_routes import router as extraction_router
from .patient_routes import router as patient_router
from .project_routes import router as project_router
from .project_schemas import *  # noqa: F403

router = APIRouter()
router.include_router(project_router, prefix="/projects", tags=["projects"])
router.include_router(patient_router, prefix="/projects", tags=["projects"])
router.include_router(extraction_router, prefix="/projects", tags=["projects"])
router.include_router(crf_router, prefix="/projects", tags=["projects"])
