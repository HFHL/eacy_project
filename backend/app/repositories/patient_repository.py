from datetime import datetime

from sqlalchemy import func, select

from app.models import Document, Patient, ProjectPatient
from core.db import session
from core.repository.base import BaseRepo


class PatientRepository(BaseRepo[Patient]):
    def __init__(self):
        super().__init__(Patient)

    async def search_by_name(self, name: str, *, limit: int = 20) -> list[Patient]:
        query = (
            select(Patient)
            .where(Patient.deleted_at.is_(None))
            .where(Patient.name.ilike(f"%{name}%"))
            .limit(limit)
        )
        result = await session.execute(query)
        return list(result.scalars().all())

    async def list_active(
        self,
        *,
        offset: int = 0,
        limit: int = 20,
        keyword: str | None = None,
        department: str | None = None,
    ) -> list[Patient]:
        query = select(Patient).where(Patient.deleted_at.is_(None))
        if keyword:
            like_keyword = f"%{keyword}%"
            query = query.where(
                Patient.name.ilike(like_keyword)
                | Patient.main_diagnosis.ilike(like_keyword)
                | Patient.doctor_name.ilike(like_keyword)
            )
        if department:
            query = query.where(Patient.department == department)

        query = query.order_by(Patient.created_at.desc()).offset(offset).limit(limit)
        result = await session.execute(query)
        return list(result.scalars().all())

    async def count_active(
        self,
        *,
        keyword: str | None = None,
        department: str | None = None,
    ) -> int:
        query = select(func.count()).select_from(Patient).where(Patient.deleted_at.is_(None))
        if keyword:
            like_keyword = f"%{keyword}%"
            query = query.where(
                Patient.name.ilike(like_keyword)
                | Patient.main_diagnosis.ilike(like_keyword)
                | Patient.doctor_name.ilike(like_keyword)
            )
        if department:
            query = query.where(Patient.department == department)

        result = await session.execute(query)
        return int(result.scalar_one())

    async def get_active_by_id(self, patient_id: str) -> Patient | None:
        query = select(Patient).where(Patient.id == patient_id).where(Patient.deleted_at.is_(None))
        result = await session.execute(query)
        return result.scalars().first()

    async def has_business_data(self, patient_id: str) -> bool:
        checks = [
            select(Document.id).where(Document.patient_id == patient_id).limit(1),
            select(ProjectPatient.id).where(ProjectPatient.patient_id == patient_id).limit(1),
        ]
        for query in checks:
            result = await session.execute(query)
            if result.scalar_one_or_none() is not None:
                return True
        return False

    async def soft_delete(self, patient: Patient) -> Patient:
        patient.deleted_at = datetime.utcnow()
        return await self.save(patient)
