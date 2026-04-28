from datetime import datetime
from typing import Any

from app.models import FieldCurrentValue, FieldValueEvent, FieldValueEvidence
from app.repositories import (
    FieldCurrentValueRepository,
    FieldValueEventRepository,
    FieldValueEvidenceRepository,
)


VALUE_FIELDS = (
    "value_text",
    "value_number",
    "value_date",
    "value_datetime",
    "value_json",
    "unit",
)


class StructuredValueService:
    def __init__(
        self,
        event_repository: FieldValueEventRepository | None = None,
        current_repository: FieldCurrentValueRepository | None = None,
        evidence_repository: FieldValueEvidenceRepository | None = None,
    ):
        self.event_repository = event_repository or FieldValueEventRepository()
        self.current_repository = current_repository or FieldCurrentValueRepository()
        self.evidence_repository = evidence_repository or FieldValueEvidenceRepository()

    async def create_event(
        self,
        *,
        context_id: str,
        record_instance_id: str,
        field_key: str,
        field_path: str,
        event_type: str,
        value_type: str,
        review_status: str = "candidate",
        **params: Any,
    ) -> FieldValueEvent:
        return await self.event_repository.create(
            {
                "context_id": context_id,
                "record_instance_id": record_instance_id,
                "field_key": field_key,
                "field_path": field_path,
                "event_type": event_type,
                "value_type": value_type,
                "review_status": review_status,
                "created_at": datetime.utcnow(),
                **params,
            }
        )

    async def add_evidence(
        self,
        *,
        value_event_id: str,
        document_id: str,
        evidence_type: str,
        **params: Any,
    ) -> FieldValueEvidence:
        return await self.evidence_repository.create(
            {
                "value_event_id": value_event_id,
                "document_id": document_id,
                "evidence_type": evidence_type,
                "created_at": datetime.utcnow(),
                **params,
            }
        )

    async def select_current_value(
        self,
        *,
        event: FieldValueEvent,
        selected_by: str | None = None,
        review_status: str = "confirmed",
    ) -> FieldCurrentValue:
        current = await self.current_repository.get_by_field(
            context_id=event.context_id,
            record_instance_id=event.record_instance_id,
            field_path=event.field_path,
        )
        values = {field: getattr(event, field, None) for field in VALUE_FIELDS}
        now = datetime.utcnow()

        if current is None:
            current = await self.current_repository.create(
                {
                    "context_id": event.context_id,
                    "record_instance_id": event.record_instance_id,
                    "field_key": event.field_key,
                    "field_path": event.field_path,
                    "selected_event_id": event.id,
                    "value_type": event.value_type,
                    "selected_by": selected_by,
                    "selected_at": now,
                    "review_status": review_status,
                    "updated_at": now,
                    **values,
                }
            )
        else:
            current.selected_event_id = event.id
            current.value_type = event.value_type
            current.selected_by = selected_by
            current.selected_at = now
            current.review_status = review_status
            current.updated_at = now
            for field, value in values.items():
                setattr(current, field, value)
            await self.current_repository.save(current)

        event.review_status = "accepted"
        await self.event_repository.save(event)
        return current

    async def manual_edit(
        self,
        *,
        context_id: str,
        record_instance_id: str,
        field_key: str,
        field_path: str,
        value_type: str,
        edited_by: str | None = None,
        note: str | None = None,
        **values: Any,
    ) -> FieldCurrentValue:
        event = await self.create_event(
            context_id=context_id,
            record_instance_id=record_instance_id,
            field_key=field_key,
            field_path=field_path,
            event_type="manual_edit",
            value_type=value_type,
            review_status="accepted",
            created_by=edited_by,
            note=note,
            **values,
        )
        return await self.select_current_value(event=event, selected_by=edited_by)

    async def record_ai_extracted_value(
        self,
        *,
        context_id: str,
        record_instance_id: str,
        field_key: str,
        field_path: str,
        value_type: str,
        evidences: list[dict[str, Any]] | None = None,
        auto_select_if_empty: bool = True,
        **values: Any,
    ) -> FieldValueEvent:
        event = await self.create_event(
            context_id=context_id,
            record_instance_id=record_instance_id,
            field_key=field_key,
            field_path=field_path,
            event_type="ai_extracted",
            value_type=value_type,
            review_status="candidate",
            **values,
        )
        for evidence in evidences or []:
            await self.add_evidence(value_event_id=event.id, **evidence)

        if auto_select_if_empty:
            current = await self.current_repository.get_by_field(
                context_id=context_id,
                record_instance_id=record_instance_id,
                field_path=field_path,
            )
            if current is None:
                await self.select_current_value(event=event, selected_by=None, review_status="unreviewed")

        return event
