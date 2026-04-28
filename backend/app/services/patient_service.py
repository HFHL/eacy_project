from typing import Any

from fastapi import HTTPException, status

from app.models import Patient
from app.repositories import PatientRepository
from app.services.ehr_service import EhrService
from app.services.schema_service import SchemaService
from core.db import Transactional


class PatientService:
    def __init__(
        self,
        patient_repository: PatientRepository | None = None,
        schema_service: SchemaService | None = None,
        ehr_service: EhrService | None = None,
    ):
        self.patient_repository = patient_repository or PatientRepository()
        self.schema_service = schema_service or SchemaService()
        self.ehr_service = ehr_service or EhrService()

    @Transactional()
    async def create_patient(
        self,
        *,
        name: str,
        created_by: str | None = None,
        initialize_ehr: bool = True,
        **params: Any,
    ) -> Patient:
        patient = await self.patient_repository.create({"name": name, **params})
        if initialize_ehr:
            schema_version = await self.schema_service.get_latest_published("ehr")
            if schema_version is not None:
                await self.ehr_service.get_or_create_patient_ehr_context(
                    patient_id=patient.id,
                    schema_version=schema_version,
                    created_by=created_by,
                )
        return patient

    async def get_patient(self, patient_id: str) -> Patient | None:
        return await self.patient_repository.get_active_by_id(patient_id)

    async def list_patients(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        keyword: str | None = None,
        department: str | None = None,
    ) -> tuple[list[Patient], int]:
        offset = (page - 1) * page_size
        patients = await self.patient_repository.list_active(
            offset=offset,
            limit=page_size,
            keyword=keyword,
            department=department,
        )
        total = await self.patient_repository.count_active(keyword=keyword, department=department)
        return patients, total

    @Transactional()
    async def update_patient(self, patient_id: str, **params: Any) -> Patient:
        patient = await self.get_patient(patient_id)
        if patient is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

        for key, value in params.items():
            setattr(patient, key, value)
        return await self.patient_repository.save(patient)

    @Transactional()
    async def delete_patient(self, patient_id: str) -> None:
        patient = await self.get_patient(patient_id)
        if patient is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

        if await self.patient_repository.has_business_data(patient_id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Patient has related business data and cannot be deleted in phase 3",
            )

        await self.patient_repository.soft_delete(patient)

    async def search_patients(self, name: str, *, limit: int = 20) -> list[Patient]:
        return await self.patient_repository.search_by_name(name, limit=limit)
