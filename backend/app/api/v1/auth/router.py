from fastapi import APIRouter, Depends

from app.core.auth import CurrentUser, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/")
async def auth_status(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, str]:
    return {"module": "auth", "status": "ready"}


@router.get("/me")
async def auth_me(
    current_user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    return current_user
