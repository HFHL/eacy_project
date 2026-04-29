from typing import Any

import jwt
from fastapi import HTTPException, Request, status

from core.config import config


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(
            token.strip(),
            config.JWT_SECRET_KEY,
            algorithms=[config.JWT_ALGORITHM],
        )
    except jwt.exceptions.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization token",
        )


def decode_authorization_header(request: Request) -> dict[str, Any]:
    authorization = request.headers.get("Authorization")
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization token",
        )

    try:
        scheme, token = authorization.split(" ", 1)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header",
        )

    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header",
        )

    return decode_access_token(token)
