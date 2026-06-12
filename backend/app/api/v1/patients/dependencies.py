from __future__ import annotations

from app.core.auth import CurrentUser, uuid_user_id_or_none
from app.services.ehr_service import EhrService
from app.services.extraction_service import ExtractionService
from app.services.patient_service import PatientService
from app.services.patient_summary_service import PatientSummaryService


def get_patient_service() -> PatientService:
    return PatientService()


def get_patient_summary_service() -> PatientSummaryService:
    return PatientSummaryService()


def get_ehr_service() -> EhrService:
    return EhrService()


def get_extraction_service() -> ExtractionService:
    return ExtractionService()


def user_scope_id(current_user: CurrentUser) -> str | None:
    return uuid_user_id_or_none(current_user)
