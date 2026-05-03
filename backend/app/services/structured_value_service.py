from datetime import date, datetime
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
        params = self._normalize_value_params(params)
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
        normalized_params = self._normalize_evidence_params(params)
        return await self.evidence_repository.create(
            {
                "value_event_id": value_event_id,
                "document_id": document_id,
                "evidence_type": evidence_type,
                "created_at": datetime.utcnow(),
                **normalized_params,
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
        values = self._normalize_value_params({field: getattr(event, field, None) for field in VALUE_FIELDS})
        now = datetime.utcnow()

        if current is None:
            current_values = {
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
            if hasattr(self.current_repository, "upsert_selected_value"):
                current = await self.current_repository.upsert_selected_value(current_values)
            else:
                current = await self.current_repository.create(current_values)
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
            await self.select_current_value(event=event, selected_by=None, review_status="unreviewed")

        return event

    def _normalize_value_params(self, values: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(values)
        if "value_date" in normalized:
            normalized["value_date"] = self._coerce_date(normalized.get("value_date"))
        if "value_datetime" in normalized:
            normalized["value_datetime"] = self._coerce_datetime(normalized.get("value_datetime"))
        if "value_json" in normalized:
            normalized["value_json"] = self._coerce_json(normalized.get("value_json"))
        return normalized

    def _normalize_evidence_params(self, values: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(values)

        normalized["quote_text"] = self._coerce_text(normalized.get("quote_text"))
        normalized["row_key"] = self._coerce_text(normalized.get("row_key"))
        normalized["cell_key"] = self._coerce_text(normalized.get("cell_key"))
        normalized["page_no"] = self._coerce_int(normalized.get("page_no"))
        normalized["start_offset"] = self._coerce_int(normalized.get("start_offset"))
        normalized["end_offset"] = self._coerce_int(normalized.get("end_offset"))
        normalized["evidence_score"] = self._coerce_float(normalized.get("evidence_score"))

        return normalized

    def _coerce_date(self, value: Any) -> date | None:
        if value is None or value == "" or value == "null":
            return None
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        return date.fromisoformat(str(value).strip())

    def _coerce_datetime(self, value: Any) -> datetime | None:
        if value is None or value == "" or value == "null":
            return None
        if isinstance(value, datetime):
            return value
        text = str(value).strip().replace("Z", "+00:00")
        parsed = datetime.fromisoformat(text)
        return parsed.replace(tzinfo=None) if parsed.tzinfo is not None else parsed

    def _coerce_json(self, value: Any) -> dict[str, Any] | list[Any] | None:
        if value is None or value == "" or value == "null":
            return None
        if isinstance(value, (dict, list)):
            return value
        return {"value": value}

    def _coerce_text(self, value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text if text else None

    def _coerce_int(self, value: Any) -> int | None:
        if value in (None, "", "null"):
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def _coerce_float(self, value: Any) -> float | None:
        if value in (None, "", "null"):
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None
