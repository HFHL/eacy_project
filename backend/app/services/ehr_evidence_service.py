from __future__ import annotations

from typing import Any

from app.models import FieldCurrentValue, FieldValueEvent, FieldValueEvidence


class EhrEvidenceMixin:
    async def list_field_events(
        self,
        *,
        patient_id: str,
        field_path: str,
        record_instance_id: str | None = None,
        owner_id: str | None = None,
    ) -> list[FieldValueEvent]:
        context = await self._get_patient_context_or_404(patient_id, owner_id=owner_id)
        query_record_id = await self._resolve_query_record_id(
            context_id=context.id,
            field_path=field_path,
            record_instance_id=record_instance_id,
        )
        for query_path in self._field_path_aliases(field_path):
            events = await self.event_repository.list_by_field(
                context_id=context.id,
                field_path=query_path,
                record_instance_id=query_record_id,
            )
            if events:
                await self._attach_event_evidence_display(
                    events,
                    context_id=context.id,
                    field_path=query_path,
                    record_instance_id=query_record_id,
                )
                return events
        return []

    async def _attach_event_evidence_display(
        self,
        events: list[FieldValueEvent],
        *,
        context_id: str,
        field_path: str,
        record_instance_id: str | None,
    ) -> None:
        evidences = await self.evidence_repository.list_by_field(
            context_id=context_id,
            field_path=field_path,
            record_instance_id=record_instance_id,
        )
        evidences_by_event_id: dict[str, list[FieldValueEvidence]] = {}
        for evidence in evidences:
            evidences_by_event_id.setdefault(evidence.value_event_id, []).append(evidence)
        for event in events:
            event_evidences = evidences_by_event_id.get(event.id, [])
            relevant_evidences = self._relevant_evidences_for_field(
                event_evidences,
                field_path=event.field_path,
                field_key=event.field_key,
                field_title=event.field_title,
                value=self._event_display_value(event),
            )
            evidence = relevant_evidences[0] if relevant_evidences else None
            if evidence is not None:
                setattr(event, "source_page", evidence.page_no)
                setattr(event, "source_text", evidence.quote_text)
                setattr(event, "source_location", self._source_location_from_evidence(evidence))

    async def list_field_candidates(
        self,
        *,
        patient_id: str,
        field_path: str,
        record_instance_id: str | None = None,
        owner_id: str | None = None,
    ) -> dict[str, Any]:
        context = await self._get_patient_context_or_404(patient_id, owner_id=owner_id)
        query_record_id = await self._resolve_query_record_id(
            context_id=context.id,
            field_path=field_path,
            record_instance_id=record_instance_id,
        )
        query_path = await self._resolve_existing_field_path(
            context_id=context.id,
            field_path=field_path,
            record_instance_id=query_record_id,
        )
        events = await self.event_repository.list_candidates_by_context_field(
            context_id=context.id,
            field_path=query_path,
            record_instance_id=query_record_id,
        )
        current_values = await self.current_repository.list_by_context(context.id)
        current = next(
            (
                value
                for value in current_values
                if value.field_path == query_path
                and (query_record_id is None or value.record_instance_id == query_record_id)
            ),
            None,
        )
        evidences = await self.evidence_repository.list_by_field(
            context_id=context.id,
            field_path=query_path,
            record_instance_id=query_record_id,
        )
        evidences_by_event_id: dict[str, list[FieldValueEvidence]] = {}
        for evidence in evidences:
            evidences_by_event_id.setdefault(evidence.value_event_id, []).append(evidence)

        candidates = []
        distinct_values: set[str] = set()
        for event in events:
            value = self._event_display_value(event)
            distinct_values.add(str(value))
            relevant_evidences = self._relevant_evidences_for_field(
                evidences_by_event_id.get(event.id, []),
                field_path=event.field_path,
                field_key=event.field_key,
                field_title=event.field_title,
                value=value,
            )
            evidence = relevant_evidences[0] if relevant_evidences else None
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

    async def list_field_evidence(
        self,
        *,
        patient_id: str,
        field_path: str,
        record_instance_id: str | None = None,
        owner_id: str | None = None,
    ) -> list[FieldValueEvidence]:
        context = await self._get_patient_context_or_404(patient_id, owner_id=owner_id)
        query_record_id = await self._resolve_query_record_id(
            context_id=context.id,
            field_path=field_path,
            record_instance_id=record_instance_id,
        )
        query_path = await self._resolve_existing_field_path(
            context_id=context.id,
            field_path=field_path,
            record_instance_id=query_record_id,
        )
        current_values = await self.current_repository.list_by_context(context.id)
        current = next(
            (
                value
                for value in current_values
                if value.field_path == query_path
                and (query_record_id is None or value.record_instance_id == query_record_id)
            ),
            None,
        )
        if current is not None and current.selected_event_id:
            evidences = await self.evidence_repository.list_by_event(current.selected_event_id)
            return self._relevant_evidences_for_field(
                evidences,
                field_path=current.field_path,
                field_key=current.field_key,
                field_title=None,
                value=self._current_display_value(current),
            )
        return await self.evidence_repository.list_by_field(
            context_id=context.id,
            field_path=query_path,
            record_instance_id=query_record_id,
        )

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

    def _source_location_from_evidence(self, evidence: FieldValueEvidence) -> dict[str, Any] | list[Any] | None:
        location = evidence.bbox_json
        if isinstance(location, dict):
            next_location = dict(location)
            next_location.setdefault("page", evidence.page_no or next_location.get("page_no") or 1)
            next_location.setdefault("page_no", evidence.page_no or next_location.get("page") or 1)
            if "position" not in next_location and isinstance(next_location.get("polygon"), list):
                next_location["position"] = next_location["polygon"]
            if "renderable" not in next_location:
                from app.services.evidence_location_resolver import has_renderable_polygon

                next_location["renderable"] = has_renderable_polygon(next_location)
            return next_location
        return location

    def _relevant_evidences_for_field(
        self,
        evidences: list[FieldValueEvidence],
        *,
        field_path: str,
        field_key: str | None,
        field_title: str | None,
        value: Any,
    ) -> list[FieldValueEvidence]:
        if not evidences:
            return []
        matched = [
            evidence
            for evidence in evidences
            if self._evidence_matches_field(
                evidence,
                field_path=field_path,
                field_key=field_key,
                field_title=field_title,
                value=value,
            )
        ]
        if matched:
            return matched
        return [evidence for evidence in evidences if self._evidence_has_polygon(evidence)]

    def _evidence_has_polygon(self, evidence: FieldValueEvidence) -> bool:
        bbox_json = getattr(evidence, "bbox_json", None)
        if not isinstance(bbox_json, dict):
            return False
        polygon = bbox_json.get("polygon") or bbox_json.get("textin_position") or bbox_json.get("position")
        return isinstance(polygon, list) and len(polygon) >= 8 and bbox_json.get("renderable") is not False

    def _evidence_matches_field(
        self,
        evidence: FieldValueEvidence,
        *,
        field_path: str,
        field_key: str | None,
        field_title: str | None,
        value: Any,
    ) -> bool:
        quote = self._compact_text(evidence.quote_text)
        if not quote:
            return False
        value_text = self._compact_text(value)
        if value_text and value_text in quote:
            return True
        for candidate in (field_key, field_title, str(field_path or "").split(".")[-1]):
            text = self._compact_text(candidate)
            if text and text in quote:
                return True
        return False

    def _compact_text(self, value: Any) -> str:
        return "".join(str(value or "").split())
