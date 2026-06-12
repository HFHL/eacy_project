from __future__ import annotations

from fastapi import APIRouter

from .dependencies import (
    get_ehr_service,
    get_extraction_service,
    get_patient_service,
    get_patient_summary_service,
    user_scope_id,
)
from .ehr_routes import router as ehr_router
from .patient_routes import router as patient_router
from .schemas import *  # noqa: F403
from .summary_routes import router as summary_router

router = APIRouter()
router.include_router(patient_router, prefix="/patients", tags=["patients"])
router.include_router(ehr_router, prefix="/patients", tags=["patients"])
router.include_router(summary_router, prefix="/patients", tags=["patients"])
