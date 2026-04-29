from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, status

from app.core.auth import CurrentUser, get_current_user
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(..., min_length=6, max_length=128)
    username: str | None = Field(default=None, max_length=100)
    name: str | None = Field(default=None, max_length=100)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(..., min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., min_length=1)


class UserResponse(BaseModel):
    id: str
    user_id: str
    username: str
    name: str
    email: str | None = None
    role: str
    permissions: list[str]


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


def get_auth_service() -> AuthService:
    return AuthService()


@router.get("/")
async def auth_status(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, str]:
    return {"module": "auth", "status": "ready"}


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    service: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    data = await service.register(
        email=payload.email,
        password=payload.password,
        username=payload.username,
        name=payload.name,
    )
    return TokenResponse.model_validate(data)


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    service: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    data = await service.login(email=payload.email, password=payload.password)
    return TokenResponse.model_validate(data)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    payload: RefreshRequest,
    service: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    data = await service.refresh(refresh_token=payload.refresh_token)
    return TokenResponse.model_validate(data)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    current_user: CurrentUser = Depends(get_current_user),
) -> None:
    return None


@router.get("/me")
async def auth_me(
    current_user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    return current_user
