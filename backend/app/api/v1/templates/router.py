from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field

from app.core.auth import CurrentUser, get_current_user, is_admin_user, uuid_user_id_or_none
from app.services.schema_service import SchemaConflictError, SchemaNotFoundError, SchemaService

router = APIRouter(tags=["schema-templates"])


class SchemaTemplateCreate(BaseModel):
    template_code: str | None = Field(default=None, min_length=1, max_length=100)
    template_name: str = Field(..., min_length=1, max_length=200)
    template_type: str = Field(..., min_length=1, max_length=50)
    description: str | None = None
    status: str = Field(default="active", max_length=50)




class SchemaTemplateUpdate(BaseModel):
    template_name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    status: str | None = Field(default=None, max_length=50)


class SchemaTemplateVersionCreate(BaseModel):
    version_no: int = Field(..., ge=1)
    version_name: str | None = Field(default=None, max_length=100)
    schema_: dict[str, Any] = Field(alias="schema_json")
    status: str = Field(default="draft", max_length=50)


class SchemaTemplateVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    template_id: str
    version_no: int
    version_name: str | None = None
    schema_: dict[str, Any] = Field(alias="schema_json")
    status: str
    published_at: datetime | None = None
    created_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SchemaTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    template_code: str
    template_name: str
    template_type: str
    description: str | None = None
    status: str
    created_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SchemaTemplateDetailResponse(SchemaTemplateResponse):
    versions: list[SchemaTemplateVersionResponse] = Field(default_factory=list)


class SchemaTemplateListResponse(BaseModel):
    items: list[SchemaTemplateResponse]
    total: int
    page: int
    page_size: int


def get_schema_service() -> SchemaService:
    return SchemaService()


def user_scope_id(current_user: CurrentUser) -> str | None:
    if is_admin_user(current_user):
        return None
    return uuid_user_id_or_none(current_user)


def _raise_schema_error(error: SchemaNotFoundError | SchemaConflictError) -> None:
    if isinstance(error, SchemaNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error))
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error))


@router.get("/schema-templates", response_model=SchemaTemplateListResponse)
@router.get("/schema-templates/", response_model=SchemaTemplateListResponse, include_in_schema=False)
async def list_schema_templates(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    template_type: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    current_user: CurrentUser = Depends(get_current_user),
    service: SchemaService = Depends(get_schema_service),
) -> SchemaTemplateListResponse:
    templates, total = await service.list_templates(
        page=page,
        page_size=page_size,
        template_type=template_type,
        status=status_filter,
        created_by=user_scope_id(current_user),
    )
    return SchemaTemplateListResponse(items=templates, total=total, page=page, page_size=page_size)


@router.post("/schema-templates", response_model=SchemaTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_schema_template(
    payload: SchemaTemplateCreate,
    current_user: CurrentUser = Depends(get_current_user),
    service: SchemaService = Depends(get_schema_service),
) -> SchemaTemplateResponse:
    try:
        template = await service.create_template(
            created_by=uuid_user_id_or_none(current_user),
            **payload.model_dump(exclude_none=True),
        )
    except (SchemaNotFoundError, SchemaConflictError) as error:
        _raise_schema_error(error)
    return SchemaTemplateResponse.model_validate(template)


@router.get("/schema-templates/{template_id}", response_model=SchemaTemplateDetailResponse)
async def get_schema_template(
    template_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: SchemaService = Depends(get_schema_service),
) -> SchemaTemplateDetailResponse:
    template = await service.get_template(template_id, created_by=user_scope_id(current_user))
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schema template not found")
    versions = await service.list_versions(template_id)
    response = SchemaTemplateDetailResponse.model_validate(template)
    response.versions = [SchemaTemplateVersionResponse.model_validate(version) for version in versions]
    return response




@router.patch("/schema-templates/{template_id}", response_model=SchemaTemplateResponse)
async def update_schema_template(
    template_id: str,
    payload: SchemaTemplateUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    service: SchemaService = Depends(get_schema_service),
) -> SchemaTemplateResponse:
    try:
        template = await service.update_template(
            template_id=template_id,
            **payload.model_dump(exclude_none=True),
        )
    except (SchemaNotFoundError, SchemaConflictError) as error:
        _raise_schema_error(error)
    return SchemaTemplateResponse.model_validate(template)

@router.delete("/schema-templates/{template_id}", response_model=SchemaTemplateResponse)
async def archive_schema_template(
    template_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: SchemaService = Depends(get_schema_service),
) -> SchemaTemplateResponse:
    try:
        template = await service.archive_template(template_id)
    except (SchemaNotFoundError, SchemaConflictError) as error:
        _raise_schema_error(error)
    return SchemaTemplateResponse.model_validate(template)


@router.post(
    "/schema-templates/{template_id}/versions",
    response_model=SchemaTemplateVersionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_schema_template_version(
    template_id: str,
    payload: SchemaTemplateVersionCreate,
    current_user: CurrentUser = Depends(get_current_user),
    service: SchemaService = Depends(get_schema_service),
) -> SchemaTemplateVersionResponse:
    try:
        version = await service.create_version(
            template_id=template_id,
            created_by=uuid_user_id_or_none(current_user),
            **payload.model_dump(by_alias=True, exclude_none=True),
        )
    except (SchemaNotFoundError, SchemaConflictError) as error:
        _raise_schema_error(error)
    return SchemaTemplateVersionResponse.model_validate(version)


@router.post("/schema-template-versions/{version_id}/publish", response_model=SchemaTemplateVersionResponse)
async def publish_schema_template_version(
    version_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: SchemaService = Depends(get_schema_service),
) -> SchemaTemplateVersionResponse:
    try:
        version = await service.publish_version(version_id)
    except (SchemaNotFoundError, SchemaConflictError) as error:
        _raise_schema_error(error)
    return SchemaTemplateVersionResponse.model_validate(version)


@router.delete("/schema-template-versions/{version_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schema_template_version(
    version_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: SchemaService = Depends(get_schema_service),
) -> Response:
    try:
        await service.delete_version(version_id)
    except (SchemaNotFoundError, SchemaConflictError) as error:
        _raise_schema_error(error)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
