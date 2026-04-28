from typing import Any

from fastapi import HTTPException, status

from app.models import DataContext, FieldCurrentValue, FieldValueEvent, FieldValueEvidence, RecordInstance, SchemaTemplateVersion
from app.repositories import (
    DataContextRepository,
    FieldCurrentValueRepository,
    FieldValueEventRepository,
    FieldValueEvidenceRepository,
    PatientRepository,
    RecordInstanceRepository,
)
from app.services.schema_service import SchemaService
from app.services.structured_value_service import StructuredValueService
from core.db import Transactional


class EhrService:
    def __init__(
        self,
        context_repository: DataContextRepository | None = None,
        record_repository: RecordInstanceRepository | None = None,
        patient_repository: PatientRepository | None = None,
        schema_service: SchemaService | None = None,
        value_service: StructuredValueService | None = None,
        current_repository: FieldCurrentValueRepository | None = None,
        event_repository: FieldValueEventRepository | None = None,
        evidence_repository: FieldValueEvidenceRepository | None = None,
    ):
        self.context_repository = context_repository or DataContextRepository()
        self.record_repository = record_repository or RecordInstanceRepository()
        self.patient_repository = patient_repository or PatientRepository()
        self.schema_service = schema_service or SchemaService()
        self.value_service = value_service or StructuredValueService()
        self.current_repository = current_repository or FieldCurrentValueRepository()
        self.event_repository = event_repository or FieldValueEventRepository()
        self.evidence_repository = evidence_repository or FieldValueEvidenceRepository()

    async def get_or_create_patient_ehr_context(
        self,
        *,
        patient_id: str,
        schema_version: SchemaTemplateVersion,
        created_by: str | None = None,
    ) -> DataContext:
        context = await self.context_repository.get_patient_ehr(patient_id, schema_version.id)
        if context is not None:
            return context

        context = await self.context_repository.create(
            {
                "context_type": "patient_ehr",
                "patient_id": patient_id,
                "schema_version_id": schema_version.id,
                "status": "draft",
                "created_by": created_by,
            }
        )
        await self.initialize_default_record_instances(context_id=context.id, schema_json=schema_version.schema_json)
        return context

    async def get_patient_ehr(self, patient_id: str, *, created_by: str | None = None) -> dict[str, Any]:
        patient = await self.patient_repository.get_active_by_id(patient_id)
        if patient is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

        schema_version = await self.schema_service.get_latest_published("ehr")
        context = None
        if schema_version is not None:
            context = await self.get_or_create_patient_ehr_context(
                patient_id=patient_id,
                schema_version=schema_version,
                created_by=created_by,
            )
        else:
            context = await self.context_repository.get_latest_patient_ehr(patient_id)
            if context is not None:
                schema_version = await self.schema_service.get_version(context.schema_version_id)

        if context is None or schema_version is None:
            return {"context": None, "schema": None, "records": [], "current_values": {}}

        records = await self.record_repository.list_by_context(context.id)
        current_values = await self.current_repository.list_by_context(context.id)
        return {
            "context": context,
            "schema": schema_version.schema_json,
            "records": records,
            "current_values": {value.field_path: value for value in current_values},
        }

    async def list_field_events(self, *, patient_id: str, field_path: str) -> list[FieldValueEvent]:
        context = await self._get_patient_context_or_404(patient_id)
        return await self.event_repository.list_by_field(context_id=context.id, field_path=field_path)

    async def list_field_evidence(self, *, patient_id: str, field_path: str) -> list[FieldValueEvidence]:
        context = await self._get_patient_context_or_404(patient_id)
        return await self.evidence_repository.list_by_field(context_id=context.id, field_path=field_path)

    @Transactional()
    async def manual_update_field(
        self,
        *,
        patient_id: str,
        field_path: str,
        value_type: str,
        record_instance_id: str | None = None,
        field_key: str | None = None,
        edited_by: str | None = None,
        note: str | None = None,
        values: dict[str, Any],
    ) -> FieldCurrentValue:
        context = await self._get_patient_context_or_404(patient_id)
        record = await self._resolve_record(context.id, record_instance_id)
        return await self.value_service.manual_edit(
            context_id=context.id,
            record_instance_id=record.id,
            field_key=field_key or field_path.split(".")[-1],
            field_path=field_path,
            value_type=value_type,
            edited_by=edited_by,
            note=note,
            **values,
        )

    @Transactional()
    async def select_field_event(
        self,
        *,
        patient_id: str,
        field_path: str,
        event_id: str,
        selected_by: str | None = None,
    ) -> FieldCurrentValue:
        context = await self._get_patient_context_or_404(patient_id)
        event = await self.event_repository.get_by_id(event_id)
        if event is None or event.context_id != context.id or event.field_path != field_path:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field event not found")
        return await self.value_service.select_current_value(event=event, selected_by=selected_by)

    async def _get_patient_context_or_404(self, patient_id: str) -> DataContext:
        ehr = await self.get_patient_ehr(patient_id)
        context = ehr["context"]
        if context is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient EHR context not found")
        return context

    async def _resolve_record(self, context_id: str, record_instance_id: str | None) -> RecordInstance:
        if record_instance_id is not None:
            record = await self.record_repository.get_by_id(record_instance_id)
            if record is None or record.context_id != context_id:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record instance not found")
            return record

        records = await self.record_repository.list_by_context(context_id)
        if not records:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record instance not found")
        return records[0]

    async def initialize_default_record_instances(
        self,
        *,
        context_id: str,
        schema_json: dict[str, Any],
    ) -> list[RecordInstance]:
        created: list[RecordInstance] = []
        for group in schema_json.get("groups", []):
            for form in group.get("forms", []):
                if form.get("repeatable", False):
                    continue
                existing = await self.record_repository.get_by_form(
                    context_id=context_id,
                    form_key=form["key"],
                    repeat_index=0,
                )
                if existing is not None:
                    continue
                created.append(
                    await self.record_repository.create(
                        {
                            "context_id": context_id,
                            "group_key": group.get("key"),
                            "group_title": group.get("title"),
                            "form_key": form["key"],
                            "form_title": form.get("title", form["key"]),
                            "repeat_index": 0,
                            "instance_label": form.get("title", form["key"]),
                            "review_status": "unreviewed",
                        }
                    )
                )
        return created
