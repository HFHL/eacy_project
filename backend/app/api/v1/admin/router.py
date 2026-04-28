from fastapi import APIRouter, Depends

from app.core.auth import CurrentUser, get_current_user

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/")
async def admin_status(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, str]:
    return {"module": "admin", "status": "ready"}
