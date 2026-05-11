from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.core.auth import CurrentUser, get_current_user, is_admin_user
from app.services.admin_task_service import AdminTaskConflictError, AdminTaskNotFoundError, AdminTaskService

router = APIRouter(prefix="/admin", tags=["admin"])


class ResubmitTaskRequest(BaseModel):
    source: str = Field(default="auto", max_length=40)
    only_failed: bool = True


def get_admin_task_service() -> AdminTaskService:
    return AdminTaskService()


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


@router.get("/extraction-tasks/{task_id}/events")
async def admin_extraction_task_events(
    task_id: str,
    after_id: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    current_user: CurrentUser = Depends(require_admin_user),
    service: AdminTaskService = Depends(get_admin_task_service),
) -> list[dict[str, Any]]:
    try:
        return await service.list_extraction_task_events(task_id, after_id=after_id, limit=limit)
    except AdminTaskNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error


@router.post("/extraction-tasks/{task_id}/resubmit")
async def admin_resubmit_extraction_task(
    task_id: str,
    payload: ResubmitTaskRequest,
    current_user: CurrentUser = Depends(require_admin_user),
    service: AdminTaskService = Depends(get_admin_task_service),
) -> dict[str, Any]:
    try:
        return await service.resubmit_extraction_task(
            task_id,
            source=payload.source,
            only_failed=payload.only_failed,
        )
    except AdminTaskNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except AdminTaskConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
