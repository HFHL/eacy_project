import base64
import hashlib
import hmac
import os
from datetime import datetime, timedelta
from typing import Any

import jwt
from fastapi import HTTPException, status

from app.models import User
from app.repositories.user_repository import UserRepository
from app.services.verification_code_service import VerificationCodeService
from core.config import config
from core.db import Transactional

ACCESS_TOKEN_SECONDS = 60 * 60 * 8
REFRESH_TOKEN_SECONDS = 60 * 60 * 24 * 14
PASSWORD_ITERATIONS = 120_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(
        PASSWORD_ITERATIONS,
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(digest).decode("ascii"),
    )


def verify_password(password: str, password_hash: str) -> bool:
    try:
        scheme, iterations, salt_b64, digest_b64 = password_hash.split("$", 3)
        if scheme != "pbkdf2_sha256":
            return False
        salt = base64.b64decode(salt_b64.encode("ascii"))
        expected = base64.b64decode(digest_b64.encode("ascii"))
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations))
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


def _permissions_to_list(value: str | None) -> list[str]:
    return [item.strip() for item in (value or "").split(",") if item.strip()]


class AuthService:
    def __init__(
        self,
        user_repository: UserRepository | None = None,
        verification_code_service: VerificationCodeService | None = None,
    ):
        self.user_repository = user_repository or UserRepository()
        self.verification_code_service = verification_code_service or VerificationCodeService()

    def build_user_payload(self, user: User) -> dict[str, Any]:
        return {
            "id": user.id,
            "user_id": user.id,
            "username": user.username,
            "name": user.name or user.username,
            "email": user.email,
            "role": user.role,
            "permissions": _permissions_to_list(user.permissions),
        }

    def create_token(self, user: User, *, token_type: str, expires_in: int) -> str:
        now = datetime.utcnow()
        return jwt.encode(
            {
                **self.build_user_payload(user),
                "sub": user.id,
                "type": token_type,
                "iat": now,
                "exp": now + timedelta(seconds=expires_in),
            },
            config.JWT_SECRET_KEY,
            algorithm=config.JWT_ALGORITHM,
        )

    def build_token_response(self, user: User) -> dict[str, Any]:
        return {
            "access_token": self.create_token(user, token_type="access", expires_in=ACCESS_TOKEN_SECONDS),
            "refresh_token": self.create_token(user, token_type="refresh", expires_in=REFRESH_TOKEN_SECONDS),
            "token_type": "bearer",
            "expires_in": ACCESS_TOKEN_SECONDS,
            "user": self.build_user_payload(user),
        }

    @Transactional()
    async def register(
        self,
        *,
        email: str,
        password: str,
        code: str,
        username: str | None = None,
        name: str | None = None,
        phone: str | None = None,
        organization: str | None = None,
        department: str | None = None,
        job_title: str | None = None,
    ) -> dict[str, Any]:
        normalized_email = email.strip().lower()
        # 1. 先校验验证码（错误码 / 过期 → 400）
        await self.verification_code_service.verify(
            email=normalized_email, purpose="register", code=code,
        )
        resolved_username = (username or normalized_email.split("@", 1)[0]).strip()
        if await self.user_repository.get_by_email(normalized_email):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
        if await self.user_repository.get_by_username(resolved_username):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already registered")
        user = await self.user_repository.create(
            {
                "email": normalized_email,
                "username": resolved_username,
                "name": name or resolved_username,
                "password_hash": hash_password(password),
                "role": "user",
                "permissions": "",
                "is_active": True,
                "phone": (phone or None),
                "organization": (organization or None),
                "department": (department or None),
                "job_title": (job_title or None),
            }
        )
        # 2. 成功后消费掉验证码（防重放）
        await self.verification_code_service.consume(email=normalized_email, purpose="register")
        return self.build_token_response(user)

    @Transactional()
    async def reset_password(self, *, email: str, code: str, new_password: str) -> dict[str, Any]:
        normalized_email = email.strip().lower()
        await self.verification_code_service.verify(
            email=normalized_email, purpose="reset", code=code,
        )
        user = await self.user_repository.get_by_email(normalized_email)
        if user is None or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="该邮箱未注册或账号已停用",
            )
        user.password_hash = hash_password(new_password)
        await self.user_repository.save(user)
        await self.verification_code_service.consume(email=normalized_email, purpose="reset")
        return self.build_token_response(user)

    @Transactional()
    async def login(self, *, email: str, password: str) -> dict[str, Any]:
        user = await self.user_repository.get_by_email(email.strip().lower())
        if user is None or not user.is_active or not verify_password(password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
        user.last_login_at = datetime.utcnow()
        await self.user_repository.save(user)
        return self.build_token_response(user)

    async def refresh(self, *, refresh_token: str) -> dict[str, Any]:
        try:
            payload = jwt.decode(refresh_token, config.JWT_SECRET_KEY, algorithms=[config.JWT_ALGORITHM])
        except jwt.exceptions.PyJWTError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
        user_id = payload.get("user_id") or payload.get("sub")
        user = await self.user_repository.get_by_id(str(user_id)) if user_id else None
        if user is None or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
        return self.build_token_response(user)
