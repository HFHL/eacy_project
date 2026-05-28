from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.core.auth import CurrentUser, get_current_user, is_admin_user
from app.services.admin_extraction_trace_service import AdminExtractionTraceService
from app.services.admin_task_service import (
    AdminTemplateNotFoundError,
    AdminTaskNotFoundError,
    AdminTaskService,
    AdminUserNotFoundError,
    VALID_USER_ROLES,
)
from app.services.extraction_service import ExtractionService, ExtractionServiceError


class UpdateUserStatusRequest(BaseModel):
    is_active: bool = Field(..., description="Whether the user account is active")


class UpdateUserRoleRequest(BaseModel):
    role: str = Field(..., description="User role: admin or user")


class UpdateTemplateVisibilityRequest(BaseModel):
    is_system: bool = Field(..., description="Whether the template is visible to all users")


router = APIRouter(prefix="/admin", tags=["admin"])


def get_admin_task_service() -> AdminTaskService:
    return AdminTaskService()


def get_admin_extraction_trace_service() -> AdminExtractionTraceService:
    return AdminExtractionTraceService()


def get_extraction_service() -> ExtractionService:
    return ExtractionService()


async def require_admin_user(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not is_admin_user(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin permission required")
    return current_user


@router.get("/")
async def admin_status(
    current_user: CurrentUser = Depends(require_admin_user),
) -> dict[str, str]:
    return {"module": "admin", "status": "ready"}


@router.get("/stats")
async def admin_stats(
    current_user: CurrentUser = Depends(require_admin_user),
    service: AdminTaskService = Depends(get_admin_task_service),
) -> dict[str, Any]:
    return await service.get_stats()


@router.get("/users")
async def admin_users(
    current_user: CurrentUser = Depends(require_admin_user),
    service: AdminTaskService = Depends(get_admin_task_service),
) -> dict[str, Any]:
    users = await service.list_users()
    return {"users": users, "items": users, "total": len(users)}


@router.patch("/users/{user_id}/status")
async def admin_update_user_status(
    user_id: str,
    payload: UpdateUserStatusRequest,
    current_user: CurrentUser = Depends(require_admin_user),
    service: AdminTaskService = Depends(get_admin_task_service),
) -> dict[str, Any]:
    if user_id == current_user.id and not payload.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot disable your own account",
        )
    try:
        return await service.update_user_status(user_id, is_active=payload.is_active)
    except AdminUserNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error


@router.patch("/users/{user_id}/role")
async def admin_update_user_role(
    user_id: str,
    payload: UpdateUserRoleRequest,
    current_user: CurrentUser = Depends(require_admin_user),
    service: AdminTaskService = Depends(get_admin_task_service),
) -> dict[str, Any]:
    if payload.role not in VALID_USER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role. Allowed: {sorted(VALID_USER_ROLES)}",
        )
    if user_id == current_user.id and payload.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot demote your own admin role",
        )
    try:
        return await service.update_user_role(user_id, role=payload.role)
    except AdminUserNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error


@router.get("/projects")
async def admin_projects(
    current_user: CurrentUser = Depends(require_admin_user),
    service: AdminTaskService = Depends(get_admin_task_service),
) -> dict[str, Any]:
    projects = await service.list_projects()
    return {"projects": projects, "items": projects, "total": len(projects)}


@router.get("/templates")
async def admin_templates(
    current_user: CurrentUser = Depends(require_admin_user),
    service: AdminTaskService = Depends(get_admin_task_service),
) -> dict[str, Any]:
    templates = await service.list_templates()
    return {"templates": templates, "items": templates, "total": len(templates)}


@router.patch("/templates/{template_id}/visibility")
async def admin_update_template_visibility(
    template_id: str,
    payload: UpdateTemplateVisibilityRequest,
    current_user: CurrentUser = Depends(require_admin_user),
    service: AdminTaskService = Depends(get_admin_task_service),
) -> dict[str, Any]:
    try:
        return await service.update_template_visibility(template_id, is_system=payload.is_system)
    except AdminTemplateNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error


@router.get("/documents")
async def admin_documents(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: CurrentUser = Depends(require_admin_user),
    service: AdminTaskService = Depends(get_admin_task_service),
) -> dict[str, Any]:
    return await service.list_documents(page=page, page_size=page_size)


@router.get("/extraction-tasks")
async def admin_extraction_tasks(
    task_type: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    keyword: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(require_admin_user),
    service: AdminTaskService = Depends(get_admin_task_service),
) -> dict[str, Any]:
    return await service.list_extraction_tasks(
        task_type=task_type,
        status=status_filter,
        keyword=keyword,
        limit=limit,
        offset=offset,
    )


@router.get("/extraction-tasks/{task_id}")
async def admin_extraction_task_detail(
    task_id: str,
    current_user: CurrentUser = Depends(require_admin_user),
    service: AdminTaskService = Depends(get_admin_task_service),
) -> dict[str, Any]:
    try:
        return await service.get_extraction_task_detail(task_id)
    except AdminTaskNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error


@router.get("/extraction-tasks/{task_id}/trace")
async def admin_extraction_task_trace(
    task_id: str,
    document_id: str | None = Query(default=None),
    job_id: str | None = Query(default=None),
    include_prompts: bool = Query(default=False),
    current_user: CurrentUser = Depends(require_admin_user),
    service: AdminExtractionTraceService = Depends(get_admin_extraction_trace_service),
) -> dict[str, Any]:
    try:
        return await service.get_extraction_task_trace(
            task_id,
            document_id=document_id,
            job_id=job_id,
            include_prompts=include_prompts,
        )
    except AdminTaskNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error


@router.get("/extraction-tasks/{task_id}/events")
async def admin_extraction_task_events(
    task_id: str,
    after_id: str | None = Query(default=None),
    item_id: str | None = Query(default=None),
    job_id: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    current_user: CurrentUser = Depends(require_admin_user),
    trace_service: AdminExtractionTraceService = Depends(get_admin_extraction_trace_service),
) -> list[dict[str, Any]]:
    try:
        return await trace_service.list_extraction_task_events(
            task_id,
            after_id=after_id,
            item_id=item_id,
            job_id=job_id,
            limit=limit,
        )
    except AdminTaskNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error


@router.get("/llm-calls/{call_id}")
async def admin_llm_call_detail(
    call_id: str,
    current_user: CurrentUser = Depends(require_admin_user),
    service: AdminExtractionTraceService = Depends(get_admin_extraction_trace_service),
) -> dict[str, Any]:
    try:
        return await service.get_llm_call_detail(call_id)
    except AdminTaskNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error


@router.post("/extraction-jobs/abandon-stale-pending")
async def abandon_stale_pending_extraction_jobs(
    older_than_hours: int = Query(default=24, ge=0, le=24 * 30),
    limit: int = Query(default=500, ge=1, le=2000),
    dry_run: bool = Query(default=False),
    current_user: CurrentUser = Depends(require_admin_user),
    service: ExtractionService = Depends(get_extraction_service),
) -> dict[str, Any]:
    """Mark idle pending extraction jobs as failed (retryable via extraction-jobs retry API)."""
    try:
        return await service.abandon_stale_pending_jobs(
            older_than_hours=older_than_hours,
            limit=limit,
            dry_run=dry_run,
        )
    except ExtractionServiceError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
