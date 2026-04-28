from pydantic import BaseModel, Field
from fastapi import Depends, HTTPException, Request, status

from app.core.security import decode_authorization_header
from core.config import config


class CurrentUser(BaseModel):
    id: str = Field(..., description="User ID")
    username: str = Field(..., description="Username")
    role: str = Field(..., description="User role")
    permissions: list[str] = Field(default_factory=list, description="Permissions")


DEV_ADMIN_USER = CurrentUser(
    id="dev_admin",
    username="dev_admin",
    role="admin",
    permissions=["*"],
)


async def get_current_user(request: Request) -> CurrentUser:
    if not config.ENABLE_AUTH:
        request.state.current_user = DEV_ADMIN_USER
        return DEV_ADMIN_USER

    payload = decode_authorization_header(request)
    user_id = payload.get("user_id") or payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization token missing user identity",
        )

    current_user = CurrentUser(
        id=str(user_id),
        username=str(payload.get("username") or payload.get("name") or user_id),
        role=str(payload.get("role") or "user"),
        permissions=list(payload.get("permissions") or []),
    )
    request.state.current_user = current_user
    return current_user


def require_permissions(required_permissions: list[str]):
    async def dependency(
        current_user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        if "*" in current_user.permissions:
            return current_user

        allowed = set(current_user.permissions)
        if not set(required_permissions).issubset(allowed):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied",
            )

        return current_user

    return dependency
