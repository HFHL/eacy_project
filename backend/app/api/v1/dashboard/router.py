from fastapi import APIRouter, Depends

from app.core.auth import CurrentUser, get_current_user, is_admin_user, uuid_user_id_or_none
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def get_dashboard_service() -> DashboardService:
    return DashboardService()


def user_scope_id(current_user: CurrentUser) -> str | None:
    if is_admin_user(current_user):
        return None
    return uuid_user_id_or_none(current_user)


@router.get("/stats")
async def get_dashboard_stats(
    current_user: CurrentUser = Depends(get_current_user),
    service: DashboardService = Depends(get_dashboard_service),
) -> dict:
    return await service.get_dashboard(user_id=user_scope_id(current_user))


@router.get("/active-tasks")
async def get_active_tasks(
    current_user: CurrentUser = Depends(get_current_user),
    service: DashboardService = Depends(get_dashboard_service),
) -> dict:
    return await service.get_active_tasks(user_id=user_scope_id(current_user))
