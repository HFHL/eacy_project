from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Query, Request, status

from app.core.auth import CurrentUser, get_current_user, uuid_user_id_or_none
from app.core.security import decode_access_token
from app.services.document_metadata_service import DocumentMetadataService
from app.services.document_service import DocumentService


def get_document_service() -> DocumentService:
    return DocumentService()


def get_document_metadata_service() -> DocumentMetadataService:
    return DocumentMetadataService()


def user_scope_id(current_user: CurrentUser) -> str | None:
    return uuid_user_id_or_none(current_user)


def current_user_from_payload(payload: dict[str, Any]) -> CurrentUser:
    user_id = payload.get("user_id") or payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization token missing user identity",
        )
    return CurrentUser(
        id=str(user_id),
        username=str(payload.get("username") or payload.get("name") or user_id),
        role=str(payload.get("role") or "user"),
        permissions=list(payload.get("permissions") or []),
    )


async def get_stream_current_user(
    request: Request,
    access_token: str | None = Query(default=None),
) -> CurrentUser:
    if access_token:
        current_user = current_user_from_payload(decode_access_token(access_token))
        request.state.current_user = current_user
        return current_user
    return await get_current_user(request)
