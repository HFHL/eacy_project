from fastapi import APIRouter, Depends

from app.core.auth import CurrentUser, get_current_user

router = APIRouter(prefix="/ehr", tags=["ehr"])


@router.get("/")
async def ehr_status(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, str]:
    return {"module": "ehr", "status": "ready"}
