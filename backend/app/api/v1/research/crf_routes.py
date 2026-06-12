from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response, status

from app.core.auth import CurrentUser, get_current_user, uuid_user_id_or_none
from app.services.research_project_service import (
    ResearchProjectConflictError,
    ResearchProjectNotFoundError,
    ResearchProjectService,
)

from .crf_schemas import (
    CrfCandidatesResponse,
    CrfCurrentValueResponse,
    CrfEventResponse,
    CrfEvidenceResponse,
    CrfFieldUpdate,
    CrfRecordCreate,
    CrfRecordResponse,
    CrfResponse,
    CrfSelectCandidateRequest,
    CrfSelectEventRequest,
)
from .dependencies import get_research_project_service, raise_research_error, user_scope_id

router = APIRouter()


@router.get("/{project_id}/patients/{project_patient_id}/crf", response_model=CrfResponse)
async def get_project_patient_crf(
    project_id: str,
    project_patient_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> CrfResponse:
    try:
        crf = await service.get_project_crf(
            project_id=project_id,
            project_patient_id=project_patient_id,
            created_by=uuid_user_id_or_none(current_user),
            owner_id=user_scope_id(current_user),
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        raise_research_error(error)
    return CrfResponse.model_validate(crf)


@router.patch("/{project_id}/patients/{project_patient_id}/crf/fields/{field_path}", response_model=CrfCurrentValueResponse)
async def update_project_patient_crf_field(
    project_id: str,
    project_patient_id: str,
    field_path: str,
    payload: CrfFieldUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> CrfCurrentValueResponse:
    values = payload.model_dump(
        include={"value_text", "value_number", "value_date", "value_datetime", "value_json", "unit"},
        exclude_none=True,
    )
    try:
        current = await service.manual_update_crf_field(
            project_id=project_id,
            project_patient_id=project_patient_id,
            field_path=field_path,
            record_instance_id=payload.record_instance_id,
            field_key=payload.field_key,
            value_type=payload.value_type,
            edited_by=uuid_user_id_or_none(current_user),
            note=payload.note,
            values=values,
            owner_id=user_scope_id(current_user),
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        raise_research_error(error)
    return CrfCurrentValueResponse.model_validate(current)


@router.get("/{project_id}/patients/{project_patient_id}/crf/fields/{field_path}/events", response_model=list[CrfEventResponse])
async def list_project_patient_crf_field_events(
    project_id: str,
    project_patient_id: str,
    field_path: str,
    record_instance_id: str | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> list[CrfEventResponse]:
    try:
        events = await service.list_crf_field_events(
            project_id=project_id,
            project_patient_id=project_patient_id,
            field_path=field_path,
            record_instance_id=record_instance_id,
            owner_id=user_scope_id(current_user),
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        raise_research_error(error)
    return [CrfEventResponse.model_validate(event) for event in events]


@router.get(
    "/{project_id}/patients/{project_patient_id}/crf/fields/{field_path}/candidates",
    response_model=CrfCandidatesResponse,
)
async def list_project_patient_crf_field_candidates(
    project_id: str,
    project_patient_id: str,
    field_path: str,
    record_instance_id: str | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> CrfCandidatesResponse:
    try:
        candidates = await service.list_crf_field_candidates(
            project_id=project_id,
            project_patient_id=project_patient_id,
            field_path=field_path,
            record_instance_id=record_instance_id,
            owner_id=user_scope_id(current_user),
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        raise_research_error(error)
    return CrfCandidatesResponse.model_validate(candidates)


@router.post(
    "/{project_id}/patients/{project_patient_id}/crf/fields/{field_path}/select-event",
    response_model=CrfCurrentValueResponse,
)
async def select_project_patient_crf_field_event(
    project_id: str,
    project_patient_id: str,
    field_path: str,
    payload: CrfSelectEventRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> CrfCurrentValueResponse:
    try:
        current = await service.select_crf_field_event(
            project_id=project_id,
            project_patient_id=project_patient_id,
            field_path=field_path,
            event_id=payload.event_id,
            record_instance_id=payload.record_instance_id,
            selected_by=uuid_user_id_or_none(current_user),
            owner_id=user_scope_id(current_user),
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        raise_research_error(error)
    return CrfCurrentValueResponse.model_validate(current)


@router.post(
    "/{project_id}/patients/{project_patient_id}/crf/fields/{field_path}/select-candidate",
    response_model=CrfCurrentValueResponse,
)
async def select_project_patient_crf_field_candidate(
    project_id: str,
    project_patient_id: str,
    field_path: str,
    payload: CrfSelectCandidateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> CrfCurrentValueResponse:
    try:
        current = await service.select_crf_field_event(
            project_id=project_id,
            project_patient_id=project_patient_id,
            field_path=field_path,
            event_id=payload.candidate_id,
            record_instance_id=payload.record_instance_id,
            selected_by=uuid_user_id_or_none(current_user),
            owner_id=user_scope_id(current_user),
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        raise_research_error(error)
    return CrfCurrentValueResponse.model_validate(current)


@router.delete("/{project_id}/patients/{project_patient_id}/crf/fields/{field_path}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_patient_crf_field(
    project_id: str,
    project_patient_id: str,
    field_path: str,
    record_instance_id: str | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> Response:
    try:
        await service.delete_crf_field_value(
            project_id=project_id,
            project_patient_id=project_patient_id,
            field_path=field_path,
            record_instance_id=record_instance_id,
            owner_id=user_scope_id(current_user),
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        raise_research_error(error)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{project_id}/patients/{project_patient_id}/crf/records", response_model=CrfRecordResponse, status_code=status.HTTP_201_CREATED)
async def create_project_patient_crf_record(
    project_id: str,
    project_patient_id: str,
    payload: CrfRecordCreate,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> CrfRecordResponse:
    try:
        record = await service.create_crf_record_instance(
            project_id=project_id,
            project_patient_id=project_patient_id,
            owner_id=user_scope_id(current_user),
            **payload.model_dump(exclude_none=True),
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        raise_research_error(error)
    return CrfRecordResponse.model_validate(record)


@router.delete("/{project_id}/patients/{project_patient_id}/crf/records/{record_instance_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_patient_crf_record(
    project_id: str,
    project_patient_id: str,
    record_instance_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> Response:
    try:
        await service.delete_crf_record_instance(
            project_id=project_id,
            project_patient_id=project_patient_id,
            record_instance_id=record_instance_id,
            owner_id=user_scope_id(current_user),
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        raise_research_error(error)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{project_id}/patients/{project_patient_id}/crf/fields/{field_path}/evidence", response_model=list[CrfEvidenceResponse])
async def list_project_patient_crf_field_evidence(
    project_id: str,
    project_patient_id: str,
    field_path: str,
    record_instance_id: str | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    service: ResearchProjectService = Depends(get_research_project_service),
) -> list[CrfEvidenceResponse]:
    try:
        evidences = await service.list_crf_field_evidence(
            project_id=project_id,
            project_patient_id=project_patient_id,
            field_path=field_path,
            record_instance_id=record_instance_id,
            owner_id=user_scope_id(current_user),
        )
    except (ResearchProjectNotFoundError, ResearchProjectConflictError) as error:
        raise_research_error(error)
    return [CrfEvidenceResponse.model_validate(evidence) for evidence in evidences]
