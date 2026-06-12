from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select, text

from app.models import (
    DataContext,
    FieldCurrentValue,
    FieldValueEvent,
    FieldValueEvidence,
    ProjectPatient,
    ProjectTemplateBinding,
    RecordInstance,
    ResearchProject,
    User,
)
from app.repositories import DataContextRepository
from app.services.record_instance_label import record_instance_label
from app.services.research_project_errors import ResearchProjectConflictError, ResearchProjectNotFoundError
from app.services.schema_field_planner import schema_dataset_group_paths, schema_leaf_paths, schema_top_level_forms
from core.db import Transactional, session


class ResearchProjectEnrollmentMixin:
    @Transactional()
    async def enroll_patient(
        self,
        *,
        project_id: str,
        patient_id: str,
        enroll_no: str | None = None,
        extra_json: dict[str, Any] | None = None,
        created_by: str | None = None,
        owner_id: str | None = None,
    ) -> ProjectPatient:
        project = await self.get_project(project_id, owner_id=owner_id)
        if project is None or project.status == "archived":
            raise ResearchProjectNotFoundError("Research project not found")

        patient = await self.patient_repository.get_active_by_id(patient_id, owner_id=owner_id)
        if patient is None:
            raise ResearchProjectNotFoundError("Patient not found")

        existing = await self.project_patient_repository.get_by_project_patient(project_id, patient_id)
        now = datetime.utcnow()
        if existing is not None:
            project_patient = existing
            if project_patient.status == "withdrawn":
                project_patient.status = "enrolled"
                project_patient.withdrawn_at = None
                project_patient.enrolled_at = now
                project_patient.updated_at = now
                project_patient = await self.project_patient_repository.save(project_patient)
        else:
            project_patient = await self.project_patient_repository.create(
                {
                    "project_id": project_id,
                    "patient_id": patient_id,
                    "enroll_no": enroll_no,
                    "status": "enrolled",
                    "enrolled_at": now,
                    "extra_json": extra_json,
                    "created_at": now,
                    "updated_at": now,
                }
            )

        binding = await self.binding_repository.get_active_primary_crf(project_id)
        if binding is not None:
            await self.get_or_create_project_crf_context(
                project_patient=project_patient,
                binding=binding,
                created_by=created_by,
            )

        return project_patient

    @Transactional()
    async def withdraw_project_patient(
        self,
        *,
        project_id: str,
        project_patient_id: str,
        owner_id: str | None = None,
    ) -> ProjectPatient:
        project_patient = await self._get_project_patient_or_404(
            project_id,
            project_patient_id,
            owner_id=owner_id,
            include_withdrawn=True,
        )
        now = datetime.utcnow()
        project_patient.status = "withdrawn"
        project_patient.withdrawn_at = now
        project_patient.updated_at = now
        return await self.project_patient_repository.save(project_patient)
