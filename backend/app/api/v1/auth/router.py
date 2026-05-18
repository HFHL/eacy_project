from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, status

from app.core.auth import CurrentUser, get_current_user
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class SendCodeRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255, pattern=EMAIL_PATTERN)
    purpose: str = Field(..., pattern=r"^(register|reset)$")


class SendCodeResponse(BaseModel):
    email: str
    purpose: str
    ttl_seconds: int
    cooldown_seconds: int


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255, pattern=EMAIL_PATTERN)
    password: str = Field(..., min_length=6, max_length=128)
    code: str = Field(..., min_length=4, max_length=10)
    username: str | None = Field(default=None, max_length=100)
    name: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=32)
    organization: str | None = Field(default=None, max_length=200)
    department: str | None = Field(default=None, max_length=200)
    job_title: str | None = Field(default=None, max_length=100)


class ResetPasswordRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255, pattern=EMAIL_PATTERN)
    code: str = Field(..., min_length=4, max_length=10)
    new_password: str = Field(..., min_length=6, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255, pattern=EMAIL_PATTERN)
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


@router.post("/send-code", response_model=SendCodeResponse)
async def send_code(
    payload: SendCodeRequest,
    service: AuthService = Depends(get_auth_service),
) -> SendCodeResponse:
    data = await service.verification_code_service.request_code(
        email=payload.email, purpose=payload.purpose,
    )
    return SendCodeResponse.model_validate(data)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    service: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    data = await service.register(
        email=payload.email,
        password=payload.password,
        code=payload.code,
        username=payload.username,
        name=payload.name,
        phone=payload.phone,
        organization=payload.organization,
        department=payload.department,
        job_title=payload.job_title,
    )
    return TokenResponse.model_validate(data)


@router.post("/reset-password", response_model=TokenResponse)
async def reset_password(
    payload: ResetPasswordRequest,
    service: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    data = await service.reset_password(
        email=payload.email,
        code=payload.code,
        new_password=payload.new_password,
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
