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
        await self._lock_current_field(
            context_id=event.context_id,
            record_instance_id=event.record_instance_id,
            field_path=event.field_path,
        )
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
            await self._auto_select_ai_event(event)

        return event

    async def clear_current_value_with_fallback(
        self,
        *,
        context_id: str,
        record_instance_id: str,
        field_path: str,
    ) -> FieldCurrentValue | None:
        await self._lock_current_field(
            context_id=context_id,
            record_instance_id=record_instance_id,
            field_path=field_path,
        )
        current = await self.current_repository.get_by_field(
            context_id=context_id,
            record_instance_id=record_instance_id,
            field_path=field_path,
        )
        excluded_event_id = getattr(current, "selected_event_id", None) if current is not None else None
        if current is not None and excluded_event_id:
            selected_event = await self.event_repository.get_by_id(excluded_event_id)
            if selected_event is not None:
                selected_event.review_status = "candidate"
                await self.event_repository.save(selected_event)

        await self.current_repository.delete_by_context_field(
            context_id=context_id,
            record_instance_id=record_instance_id,
            field_path=field_path,
        )

        fallback_event = await self._latest_fallback_event(
            context_id=context_id,
            record_instance_id=record_instance_id,
            field_path=field_path,
            excluded_event_id=excluded_event_id,
        )
        if fallback_event is None:
            return None
        return await self.select_current_value(
            event=fallback_event,
            selected_by=None,
            review_status="unreviewed",
        )

    async def _auto_select_ai_event(self, event: FieldValueEvent) -> FieldCurrentValue | None:
        await self._lock_current_field(
            context_id=event.context_id,
            record_instance_id=event.record_instance_id,
            field_path=event.field_path,
        )
        values = self._normalize_value_params({field: getattr(event, field, None) for field in VALUE_FIELDS})
        now = datetime.utcnow()
        current_values = {
            "context_id": event.context_id,
            "record_instance_id": event.record_instance_id,
            "field_key": event.field_key,
            "field_path": event.field_path,
            "selected_event_id": event.id,
            "value_type": event.value_type,
            "selected_by": None,
            "selected_at": now,
            "review_status": "unreviewed",
            "updated_at": now,
            **values,
        }
        if hasattr(self.current_repository, "upsert_auto_selected_value"):
            current = await self.current_repository.upsert_auto_selected_value(current_values)
            if current is None:
                return None
            event.review_status = "accepted"
            await self.event_repository.save(event)
            return current
        current = await self.current_repository.get_by_field(
            context_id=event.context_id,
            record_instance_id=event.record_instance_id,
            field_path=event.field_path,
        )
        if current is None or getattr(current, "review_status", None) in {"unreviewed", "candidate"}:
            return await self.select_current_value(event=event, selected_by=None, review_status="unreviewed")
        return None

    async def _latest_fallback_event(
        self,
        *,
        context_id: str,
        record_instance_id: str,
        field_path: str,
        excluded_event_id: str | None,
    ) -> FieldValueEvent | None:
        events = await self.event_repository.list_candidates_by_context_field(
            context_id=context_id,
            record_instance_id=record_instance_id,
            field_path=field_path,
        )
        for event in events:
            if event.id != excluded_event_id:
                return event
        return None

    async def _lock_current_field(
        self,
        *,
        context_id: str,
        record_instance_id: str,
        field_path: str,
    ) -> None:
        lock = getattr(self.current_repository, "lock_field_scope", None)
        if lock is not None:
            await lock(
                context_id=context_id,
                record_instance_id=record_instance_id,
                field_path=field_path,
            )

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
