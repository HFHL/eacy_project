from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.auth import CurrentUser, get_current_user
from app.services.patient_summary_service import PatientSummaryService

from .dependencies import get_patient_summary_service, user_scope_id
from .schemas import PatientAiSummaryResponse, PatientAiSummarySaveRequest

router = APIRouter()


@router.get("/{patient_id}/ai-summary", response_model=PatientAiSummaryResponse)
async def get_patient_ai_summary(
    patient_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: PatientSummaryService = Depends(get_patient_summary_service),
) -> PatientAiSummaryResponse:
    payload = await service.get_summary(patient_id, owner_id=user_scope_id(current_user))
    return PatientAiSummaryResponse.model_validate(payload)


@router.post("/{patient_id}/ai-summary/generate", response_model=PatientAiSummaryResponse)
async def generate_patient_ai_summary(
    patient_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service: PatientSummaryService = Depends(get_patient_summary_service),
) -> PatientAiSummaryResponse:
    payload = await service.generate_summary(patient_id, owner_id=user_scope_id(current_user))
    return PatientAiSummaryResponse.model_validate(payload)


@router.put("/{patient_id}/ai-summary", response_model=PatientAiSummaryResponse)
async def save_patient_ai_summary(
    patient_id: str,
    payload: PatientAiSummarySaveRequest,
    current_user: CurrentUser = Depends(get_current_user),
    service: PatientSummaryService = Depends(get_patient_summary_service),
) -> PatientAiSummaryResponse:
    result = await service.save_summary(
        patient_id,
        payload.content,
        owner_id=user_scope_id(current_user),
    )
    return PatientAiSummaryResponse.model_validate(result)
