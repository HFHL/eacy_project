from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.core.auth import CurrentUser, get_current_user, uuid_user_id_or_none
from app.services.ehr_service import EhrService
from app.services.extraction_service import (
    ExtractionConflictError,
    ExtractionNotFoundError,
    ExtractionService,
    ExtractionTargetValidationError,
)

from .dependencies import get_ehr_service, get_extraction_service, user_scope_id
from .schemas import (
    EhrCandidatesResponse,
    EhrCurrentValueResponse,
    EhrEventResponse,
    EhrEvidenceResponse,
    EhrFieldUpdate,
    EhrFolderUpdateRequest,
    EhrFolderUpdateResponse,
    EhrRecordCreate,
    EhrRecordResponse,
    EhrResponse,
    EhrSchemaResponse,
    EhrSelectCandidateRequest,
    EhrSelectEventRequest,
)

router = APIRouter()


@router.get("/{patient_id}/ehr/schema", response_model=EhrSchemaResponse)
async def get_patient_ehr_schema(
    patient_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: EhrService = Depends(get_ehr_service),
) -> EhrSchemaResponse:
    schema_payload = await service.get_patient_ehr_schema(patient_id, owner_id=user_scope_id(current_user))
    return EhrSchemaResponse.model_validate(schema_payload)


@router.get("/{patient_id}/ehr", response_model=EhrResponse)
async def get_patient_ehr(
    patient_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: EhrService = Depends(get_ehr_service),
) -> EhrResponse:
    owner_id = user_scope_id(current_user)
    ehr = await service.get_patient_ehr(
        patient_id,
        created_by=uuid_user_id_or_none(current_user),
        owner_id=owner_id,
    )
    return EhrResponse.model_validate(ehr)


@router.post("/{patient_id}/ehr/update-folder", response_model=EhrFolderUpdateResponse, status_code=status.HTTP_202_ACCEPTED)
async def update_patient_ehr_folder(
    patient_id: str,
    payload: EhrFolderUpdateRequest | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    service: ExtractionService = Depends(get_extraction_service),
) -> EhrFolderUpdateResponse:
    body = payload or EhrFolderUpdateRequest()
    try:
        result = await service.update_patient_ehr_folder(
            patient_id=patient_id,
            requested_by=uuid_user_id_or_none(current_user),
            target_form_keys=body.target_form_keys,
            mode=body.mode,
        )
    except ExtractionNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error))
    except ExtractionTargetValidationError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error.to_detail())
    except ExtractionConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error))
    return EhrFolderUpdateResponse.model_validate(
        {
            **result,
            "job_ids": [job.id for job in result.get("jobs", [])],
        }
    )


@router.patch("/{patient_id}/ehr/fields/{field_path}", response_model=EhrCurrentValueResponse)
async def update_patient_ehr_field(
    patient_id: str,
    field_path: str,
    payload: EhrFieldUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    service: EhrService = Depends(get_ehr_service),
) -> EhrCurrentValueResponse:
    values = payload.model_dump(
        include={"value_text", "value_number", "value_date", "value_datetime", "value_json", "unit"},
        exclude_none=True,
    )
    current = await service.manual_update_field(
        patient_id=patient_id,
        field_path=field_path,
        record_instance_id=payload.record_instance_id,
        field_key=payload.field_key,
        value_type=payload.value_type,
        edited_by=uuid_user_id_or_none(current_user),
        note=payload.note,
        values=values,
        owner_id=user_scope_id(current_user),
    )
    return EhrCurrentValueResponse.model_validate(current)


@router.get("/{patient_id}/ehr/fields/{field_path}/events", response_model=list[EhrEventResponse])
async def list_patient_ehr_field_events(
    patient_id: str,
    field_path: str,
    record_instance_id: str | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    service: EhrService = Depends(get_ehr_service),
) -> list[EhrEventResponse]:
    events = await service.list_field_events(
        patient_id=patient_id,
        field_path=field_path,
        record_instance_id=record_instance_id,
        owner_id=user_scope_id(current_user),
    )
    return [EhrEventResponse.model_validate(event) for event in events]


@router.get("/{patient_id}/ehr/fields/{field_path}/candidates", response_model=EhrCandidatesResponse)
async def list_patient_ehr_field_candidates(
    patient_id: str,
    field_path: str,
    record_instance_id: str | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    service: EhrService = Depends(get_ehr_service),
) -> EhrCandidatesResponse:
    candidates = await service.list_field_candidates(
        patient_id=patient_id,
        field_path=field_path,
        record_instance_id=record_instance_id,
        owner_id=user_scope_id(current_user),
    )
    return EhrCandidatesResponse.model_validate(candidates)


@router.post("/{patient_id}/ehr/fields/{field_path}/select-event", response_model=EhrCurrentValueResponse)
async def select_patient_ehr_field_event(
    patient_id: str,
    field_path: str,
    payload: EhrSelectEventRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: EhrService = Depends(get_ehr_service),
) -> EhrCurrentValueResponse:
    current = await service.select_field_event(
        patient_id=patient_id,
        field_path=field_path,
        event_id=payload.event_id,
        record_instance_id=payload.record_instance_id,
        selected_by=uuid_user_id_or_none(current_user),
        owner_id=user_scope_id(current_user),
    )
    return EhrCurrentValueResponse.model_validate(current)


@router.post("/{patient_id}/ehr/fields/{field_path}/select-candidate", response_model=EhrCurrentValueResponse)
async def select_patient_ehr_field_candidate(
    patient_id: str,
    field_path: str,
    payload: EhrSelectCandidateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: EhrService = Depends(get_ehr_service),
) -> EhrCurrentValueResponse:
    current = await service.select_field_event(
        patient_id=patient_id,
        field_path=field_path,
        event_id=payload.candidate_id,
        record_instance_id=payload.record_instance_id,
        selected_by=uuid_user_id_or_none(current_user),
        owner_id=user_scope_id(current_user),
    )
    return EhrCurrentValueResponse.model_validate(current)


@router.delete("/{patient_id}/ehr/fields/{field_path}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_patient_ehr_field(
    patient_id: str,
    field_path: str,
    record_instance_id: str | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    service: EhrService = Depends(get_ehr_service),
) -> Response:
    await service.delete_field_value(
        patient_id=patient_id,
        field_path=field_path,
        record_instance_id=record_instance_id,
        owner_id=user_scope_id(current_user),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{patient_id}/ehr/records", response_model=EhrRecordResponse, status_code=status.HTTP_201_CREATED)
async def create_patient_ehr_record(
    patient_id: str,
    payload: EhrRecordCreate,
    current_user: CurrentUser = Depends(get_current_user),
    service: EhrService = Depends(get_ehr_service),
) -> EhrRecordResponse:
    record = await service.create_record_instance(
        patient_id=patient_id,
        owner_id=user_scope_id(current_user),
        **payload.model_dump(exclude_none=True),
    )
    return EhrRecordResponse.model_validate(record)


@router.delete("/{patient_id}/ehr/records/{record_instance_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_patient_ehr_record(
    patient_id: str,
    record_instance_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: EhrService = Depends(get_ehr_service),
) -> Response:
    await service.delete_record_instance(
        patient_id=patient_id,
        record_instance_id=record_instance_id,
        owner_id=user_scope_id(current_user),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{patient_id}/ehr/fields/{field_path}/evidence", response_model=list[EhrEvidenceResponse])
async def list_patient_ehr_field_evidence(
    patient_id: str,
    field_path: str,
    record_instance_id: str | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    service: EhrService = Depends(get_ehr_service),
) -> list[EhrEvidenceResponse]:
    evidences = await service.list_field_evidence(
        patient_id=patient_id,
        field_path=field_path,
        record_instance_id=record_instance_id,
        owner_id=user_scope_id(current_user),
    )
    return [EhrEvidenceResponse.model_validate(evidence) for evidence in evidences]
