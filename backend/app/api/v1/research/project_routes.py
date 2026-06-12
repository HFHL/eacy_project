from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.core.auth import CurrentUser, get_current_user, uuid_user_id_or_none
from app.services.research_project_export_service import ExportRequest, ResearchProjectExportService
from app.services.research_project_service import (
    ResearchProjectConflictError,
    ResearchProjectNotFoundError,
    ResearchProjectService,
)

from .dependencies import (
    get_research_project_export_service,
    get_research_project_service,
    project_response,
    raise_research_error,
    user_scope_id,
)
from .project_schemas import (
    ProjectCrfExportRequest,
    ResearchProjectCreate,
    ResearchProjectListResponse,
    ResearchProjectResponse,
    ResearchProjectUpdate,
    TemplateBindingCreate,
    TemplateBindingResponse,
)

router = APIRouter()


@router.get("", response_model=ResearchProjectListResponse)
@router.get("/", response_model=ResearchProjectListResponse, include_in_schema=False)
async def list_projects(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status_filter: str | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None, max_length=200),
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> ResearchProjectListResponse:
    projects, total, stats_by_id = await service.list_projects_with_stats(
        page=page,
        page_size=page_size,
        status=status_filter,
        search=search,
        owner_id=user_scope_id(current_user),
    )
    items = [project_response(project, stats_by_id.get(project.id)) for project in projects]
    return ResearchProjectListResponse(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=ResearchProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ResearchProjectCreate,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> ResearchProjectResponse:
    try:
        project = await service.create_project(
            owner_id=uuid_user_id_or_none(current_user),
            **payload.model_dump(exclude_none=True),
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        raise_research_error(error)
    stats = await service.get_project_stats(project)
    return project_response(project, stats)


@router.get("/{project_id}", response_model=ResearchProjectResponse)
async def get_project(
    project_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> ResearchProjectResponse:
    project = await service.get_project(project_id, owner_id=user_scope_id(current_user))
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Research project not found")
    stats = await service.get_project_stats(project)
    return project_response(project, stats)


@router.patch("/{project_id}", response_model=ResearchProjectResponse)
async def update_project(
    project_id: str,
    payload: ResearchProjectUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> ResearchProjectResponse:
    try:
        project = await service.update_project(
            project_id,
            owner_id=user_scope_id(current_user),
            **payload.model_dump(exclude_unset=True),
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        raise_research_error(error)
    stats = await service.get_project_stats(project)
    return project_response(project, stats)


@router.delete("/{project_id}", response_model=ResearchProjectResponse)
async def archive_project(
    project_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> ResearchProjectResponse:
    try:
        project = await service.archive_project(project_id, owner_id=user_scope_id(current_user))
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        raise_research_error(error)
    stats = await service.get_project_stats(project)
    return project_response(project, stats)


@router.post("/{project_id}/export")
async def export_project_crf_file(
    project_id: str,
    payload: ProjectCrfExportRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectExportService = Depends(get_research_project_export_service),
) -> Response:
    if payload.format not in {"excel", "xlsx"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only xlsx export is supported")
    if payload.scope not in {"all", "selected"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported export scope")
    if payload.scope == "selected" and not payload.patient_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="patient_ids is required when scope is selected")
    try:
        content = await service.export_crf_xlsx(
            project_id,
            ExportRequest(
                scope=payload.scope,
                patient_ids=tuple(payload.patient_ids or ()),
                expand_repeatable_rows=payload.expand_repeatable_rows,
            ),
            owner_id=user_scope_id(current_user),
        )
    except ResearchProjectNotFoundError as error:
        raise_research_error(error)
    filename = quote(f"project_{project_id}_crf_export.xlsx")
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )


@router.get("/{project_id}/template-bindings", response_model=list[TemplateBindingResponse])
async def list_project_template_bindings(
    project_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> list[TemplateBindingResponse]:
    try:
        bindings = await service.list_template_bindings(
            project_id=project_id,
            owner_id=user_scope_id(current_user),
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        raise_research_error(error)
    return [TemplateBindingResponse.model_validate(binding) for binding in bindings]


@router.post("/{project_id}/template-bindings", response_model=TemplateBindingResponse, status_code=status.HTTP_201_CREATED)
async def create_template_binding(
    project_id: str,
    payload: TemplateBindingCreate,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> TemplateBindingResponse:
    try:
        binding = await service.bind_crf_template(
            project_id=project_id,
            owner_id=user_scope_id(current_user),
            **payload.model_dump(),
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        raise_research_error(error)
    return TemplateBindingResponse.model_validate(binding)


@router.delete("/{project_id}/template-bindings/{binding_id}", response_model=TemplateBindingResponse)
async def disable_template_binding(
    project_id: str,
    binding_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> TemplateBindingResponse:
    try:
        binding = await service.disable_template_binding(
            project_id=project_id,
            binding_id=binding_id,
            owner_id=user_scope_id(current_user),
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        raise_research_error(error)
    return TemplateBindingResponse.model_validate(binding)
