from __future__ import annotations

import httpx
from fastapi import APIRouter

from .dependencies import (
    current_user_from_payload,
    get_document_metadata_service,
    get_document_service,
    get_stream_current_user,
    user_scope_id,
)
from .detail_routes import router as detail_router
from .list_routes import router as list_router
from .presenters import *  # noqa: F403
from .schemas import *  # noqa: F403
from .stream_routes import router as stream_router

router = APIRouter()
router.include_router(list_router, prefix="/documents", tags=["documents"])
router.include_router(detail_router, prefix="/documents", tags=["documents"])
router.include_router(stream_router, prefix="/documents", tags=["documents"])
