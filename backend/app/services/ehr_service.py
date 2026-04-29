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
from app.services.schema_field_planner import schema_top_level_forms
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
        if not records:
            records = await self.initialize_default_record_instances(context_id=context.id, schema_json=schema_version.schema_json)
        current_values = await self.current_repository.list_by_context(context.id)
        return {
            "context": context,
            "schema": schema_version.schema_json,
            "records": records,
            "current_values": {value.field_path: value for value in current_values},
        }

    async def list_field_events(self, *, patient_id: str, field_path: str) -> list[FieldValueEvent]:
        context = await self._get_patient_context_or_404(patient_id)
        for query_path in self._field_path_aliases(field_path):
            events = await self.event_repository.list_by_field(context_id=context.id, field_path=query_path)
            if events:
                evidences = await self.evidence_repository.list_by_field(context_id=context.id, field_path=query_path)
                evidence_by_event_id: dict[str, FieldValueEvidence] = {}
                for evidence in evidences:
                    evidence_by_event_id.setdefault(evidence.value_event_id, evidence)
                for event in events:
                    evidence = evidence_by_event_id.get(event.id)
                    if evidence is not None:
                        setattr(event, "source_page", evidence.page_no)
                        setattr(event, "source_text", evidence.quote_text)
                        setattr(event, "source_location", self._source_location_from_evidence(evidence))
                return events
        return []

    async def list_field_candidates(self, *, patient_id: str, field_path: str) -> dict[str, Any]:
        context = await self._get_patient_context_or_404(patient_id)
        query_path = await self._resolve_existing_field_path(context_id=context.id, field_path=field_path)
        events = await self.event_repository.list_candidates_by_context_field(
            context_id=context.id,
            field_path=query_path,
        )
        current_values = await self.current_repository.list_by_context(context.id)
        current = next((value for value in current_values if value.field_path == query_path), None)
        evidences = await self.evidence_repository.list_by_field(context_id=context.id, field_path=query_path)
        evidence_by_event_id: dict[str, FieldValueEvidence] = {}
        for evidence in evidences:
            evidence_by_event_id.setdefault(evidence.value_event_id, evidence)

        candidates = []
        distinct_values: set[str] = set()
        for event in events:
            value = self._event_display_value(event)
            distinct_values.add(str(value))
            evidence = evidence_by_event_id.get(event.id)
            candidates.append(
                {
                    "id": event.id,
                    "event_id": event.id,
                    "value": value,
                    "value_type": event.value_type,
                    "review_status": event.review_status,
                    "confidence": float(event.confidence) if event.confidence is not None else None,
                    "source_document_id": event.source_document_id,
                    "source_page": evidence.page_no if evidence is not None else None,
                    "source_text": evidence.quote_text if evidence is not None else None,
                    "source_location": self._source_location_from_evidence(evidence) if evidence is not None else None,
                    "created_at": event.created_at,
                }
            )

        selected_value = self._current_display_value(current) if current is not None else None
        return {
            "candidates": candidates,
            "selected_candidate_id": current.selected_event_id if current is not None else None,
            "selected_value": selected_value,
            "has_value_conflict": len(distinct_values) > 1,
            "distinct_value_count": len(distinct_values),
        }

    def _event_display_value(self, event: FieldValueEvent) -> Any:
        if event.value_json is not None:
            return event.value_json
        if event.value_number is not None:
            return float(event.value_number)
        if event.value_date is not None:
            return event.value_date.isoformat()
        if event.value_datetime is not None:
            return event.value_datetime.isoformat()
        return event.value_text

    def _current_display_value(self, current: FieldCurrentValue) -> Any:
        if current.value_json is not None:
            return current.value_json
        if current.value_number is not None:
            return float(current.value_number)
        if current.value_date is not None:
            return current.value_date.isoformat()
        if current.value_datetime is not None:
            return current.value_datetime.isoformat()
        return current.value_text

    async def list_field_evidence(self, *, patient_id: str, field_path: str) -> list[FieldValueEvidence]:
        context = await self._get_patient_context_or_404(patient_id)
        query_path = await self._resolve_existing_field_path(context_id=context.id, field_path=field_path)
        return await self.evidence_repository.list_by_field(context_id=context.id, field_path=query_path)

    def _source_location_from_evidence(self, evidence: FieldValueEvidence) -> dict[str, Any] | list[Any] | None:
        location = evidence.bbox_json
        if isinstance(location, dict):
            next_location = dict(location)
            next_location.setdefault("page", evidence.page_no or next_location.get("page_no") or 1)
            next_location.setdefault("page_no", evidence.page_no or next_location.get("page") or 1)
            if "position" not in next_location and isinstance(next_location.get("polygon"), list):
                next_location["position"] = next_location["polygon"]
            return next_location
        return location

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
        normalized_field_path = self._canonical_field_path(field_path)
        record = await self._resolve_record(context.id, record_instance_id)
        return await self.value_service.manual_edit(
            context_id=context.id,
            record_instance_id=record.id,
            field_key=field_key or normalized_field_path.split(".")[-1],
            field_path=normalized_field_path,
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
        allowed_paths = set(self._field_path_aliases(field_path))
        if event is None or event.context_id != context.id or event.field_path not in allowed_paths:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field event not found")
        return await self.value_service.select_current_value(event=event, selected_by=selected_by)

    def _canonical_field_path(self, field_path: str) -> str:
        parts = [part for part in str(field_path or "").split(".") if part and not part.isdigit()]
        return ".".join(parts)

    def _field_path_aliases(self, field_path: str) -> list[str]:
        raw_path = str(field_path or "").strip()
        canonical_path = self._canonical_field_path(raw_path)
        return list(dict.fromkeys(path for path in [raw_path, canonical_path] if path))

    async def _resolve_existing_field_path(self, *, context_id: str, field_path: str) -> str:
        current_values = await self.current_repository.list_by_context(context_id)
        existing_paths = {value.field_path for value in current_values}
        for query_path in self._field_path_aliases(field_path):
            if query_path in existing_paths:
                return query_path
        return self._canonical_field_path(field_path)

    @Transactional()
    async def create_record_instance(
        self,
        *,
        patient_id: str,
        form_key: str,
        form_title: str | None = None,
        group_key: str | None = None,
        group_title: str | None = None,
        instance_label: str | None = None,
    ) -> RecordInstance:
        context = await self._get_patient_context_or_404(patient_id)
        repeat_index = await self.record_repository.next_repeat_index(context_id=context.id, form_key=form_key)
        return await self.record_repository.create(
            {
                "context_id": context.id,
                "group_key": group_key,
                "group_title": group_title,
                "form_key": form_key,
                "form_title": form_title or form_key,
                "repeat_index": repeat_index,
                "instance_label": instance_label or f"{form_title or form_key} #{repeat_index + 1}",
                "review_status": "unreviewed",
            }
        )

    @Transactional()
    async def delete_record_instance(self, *, patient_id: str, record_instance_id: str) -> None:
        context = await self._get_patient_context_or_404(patient_id)
        record = await self.record_repository.get_by_id(record_instance_id)
        if record is None or record.context_id != context.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record instance not found")

        events = await self.event_repository.list_by_record(record_instance_id)
        await self.evidence_repository.delete_by_event_ids([event.id for event in events])
        await self.current_repository.delete_by_record(record_instance_id)
        await self.event_repository.delete_by_record(record_instance_id)
        await self.record_repository.delete(record)

    @Transactional()
    async def delete_field_value(self, *, patient_id: str, field_path: str) -> None:
        context = await self._get_patient_context_or_404(patient_id)
        for query_path in self._field_path_aliases(field_path):
            await self.evidence_repository.delete_by_context_field(context_id=context.id, field_path=query_path)
            await self.current_repository.delete_by_context_field(context_id=context.id, field_path=query_path)
            await self.event_repository.delete_by_context_field(context_id=context.id, field_path=query_path)

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
        for form in schema_top_level_forms(schema_json):
            existing = await self.record_repository.get_by_form(
                context_id=context_id,
                form_key=form["form_key"],
                repeat_index=0,
            )
            if existing is not None:
                continue
            created.append(
                await self.record_repository.create(
                    {
                        "context_id": context_id,
                        "group_key": form.get("group_key"),
                        "group_title": form.get("group_title"),
                        "form_key": form["form_key"],
                        "form_title": form["form_title"] or form["form_key"],
                        "repeat_index": 0,
                        "instance_label": form["form_title"] or form["form_key"],
                        "review_status": "unreviewed",
                    }
                )
            )
        return created
