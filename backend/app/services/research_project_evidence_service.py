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


class ResearchProjectEvidenceMixin:
    async def list_crf_field_events(
        self,
        *,
        project_id: str,
        project_patient_id: str,
        field_path: str,
        record_instance_id: str | None = None,
        owner_id: str | None = None,
    ) -> list[FieldValueEvent]:
        context = await self._get_project_crf_context_or_404(
            project_id,
            project_patient_id,
            owner_id=owner_id,
        )
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
                evidences = await self.evidence_repository.list_by_field(
                    context_id=context.id,
                    field_path=query_path,
                    record_instance_id=query_record_id,
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
                return events
        return []

    async def list_crf_field_candidates(
        self,
        *,
        project_id: str,
        project_patient_id: str,
        field_path: str,
        record_instance_id: str | None = None,
        owner_id: str | None = None,
    ) -> dict[str, Any]:
        context = await self._get_project_crf_context_or_404(
            project_id,
            project_patient_id,
            owner_id=owner_id,
        )
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
                value for value in current_values
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
            event_evidences = evidences_by_event_id.get(event.id, [])
            relevant_evidences = self._relevant_evidences_for_field(
                event_evidences,
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

    async def list_crf_field_evidence(
        self,
        *,
        project_id: str,
        project_patient_id: str,
        field_path: str,
        record_instance_id: str | None = None,
        owner_id: str | None = None,
    ) -> list[FieldValueEvidence]:
        context = await self._get_project_crf_context_or_404(
            project_id,
            project_patient_id,
            owner_id=owner_id,
        )
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
                value for value in current_values
                if value.field_path == query_path
                and (query_record_id is None or value.record_instance_id == query_record_id)
            ),
            None,
        )
        if current is not None and current.selected_event_id:
            return await self.evidence_repository.list_by_event(current.selected_event_id)
        return await self.evidence_repository.list_by_field(
            context_id=context.id,
            field_path=query_path,
            record_instance_id=query_record_id,
        )

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
        # Fallback: keep evidences that already carry a usable polygon (resolved by
        # source_id at extraction time) even when quote_text does not literally contain
        # the field value/key/title. This is the common case for derived numerics,
        # enums, fragmented long text where LLM only emits record-level evidence.
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
