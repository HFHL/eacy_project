from fastapi import APIRouter

from app.api.v1.admin.router import router as admin_router
from app.api.v1.auth.router import router as auth_router
from app.api.v1.dashboard.router import router as dashboard_router
from app.api.v1.documents.router import router as documents_router
from app.api.v1.ehr.router import router as ehr_router
from app.api.v1.extraction.router import router as extraction_router
from app.api.v1.patients.router import router as patients_router
from app.api.v1.research.router import router as research_router
from app.api.v1.templates.router import router as templates_router

api_router = APIRouter(prefix="/api/v1")


@api_router.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


api_router.include_router(auth_router)
api_router.include_router(patients_router)
api_router.include_router(documents_router)
api_router.include_router(dashboard_router)
api_router.include_router(extraction_router)
api_router.include_router(ehr_router)
api_router.include_router(templates_router)
api_router.include_router(research_router)
api_router.include_router(admin_router)
