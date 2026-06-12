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


class ResearchProjectFieldMutationMixin:
    @Transactional()
    async def manual_update_crf_field(
        self,
        *,
        project_id: str,
        project_patient_id: str,
        field_path: str,
        value_type: str,
        record_instance_id: str | None = None,
        field_key: str | None = None,
        edited_by: str | None = None,
        note: str | None = None,
        values: dict[str, Any],
        owner_id: str | None = None,
    ) -> FieldCurrentValue:
        context = await self._get_project_crf_context_or_404(
            project_id,
            project_patient_id,
            owner_id=owner_id,
        )
        raw_field_path = ".".join(part for part in str(field_path or "").replace("/", ".").split(".") if part)
        record = await self._resolve_record_for_field_path(
            context_id=context.id,
            record_instance_id=record_instance_id,
            field_path=raw_field_path,
        )
        normalized_field_path = self._storage_field_path(raw_field_path)
        return await self.value_service.manual_edit(
            context_id=context.id,
            record_instance_id=record.id,
            field_key=field_key or self._field_key_from_path(normalized_field_path),
            field_path=normalized_field_path,
            value_type=value_type,
            edited_by=edited_by,
            note=note,
            **values,
        )

    @Transactional()
    async def select_crf_field_event(
        self,
        *,
        project_id: str,
        project_patient_id: str,
        field_path: str,
        event_id: str,
        record_instance_id: str | None = None,
        selected_by: str | None = None,
        owner_id: str | None = None,
    ) -> FieldCurrentValue:
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
        event = await self.event_repository.get_by_id(event_id)
        allowed_paths = set(self._field_path_aliases(field_path))
        if (
            event is None
            or event.context_id != context.id
            or event.field_path not in allowed_paths
            or (query_record_id is not None and event.record_instance_id != query_record_id)
        ):
            raise ResearchProjectNotFoundError("CRF field event not found")
        return await self.value_service.select_current_value(event=event, selected_by=selected_by)

    @Transactional()
    async def delete_crf_field_value(
        self,
        *,
        project_id: str,
        project_patient_id: str,
        field_path: str,
        record_instance_id: str | None = None,
        owner_id: str | None = None,
    ) -> None:
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
        value_record_id = await self._resolve_field_value_record_id(
            context_id=context.id,
            field_path=query_path,
            record_instance_id=query_record_id,
        )
        if value_record_id is None:
            await self.current_repository.delete_by_context_field(
                context_id=context.id,
                field_path=query_path,
                record_instance_id=query_record_id,
            )
            return

        await self.value_service.clear_current_value_with_fallback(
            context_id=context.id,
            record_instance_id=value_record_id,
            field_path=query_path,
        )

    async def _resolve_field_value_record_id(
        self,
        *,
        context_id: str,
        field_path: str,
        record_instance_id: str | None,
    ) -> str | None:
        if record_instance_id is not None:
            record = await self._resolve_record(context_id, record_instance_id)
            if self._record_matches_field_path(record, field_path):
                return record.id
            resolved_record_id = await self._resolve_query_record_id(
                context_id=context_id,
                field_path=field_path,
                record_instance_id=None,
            )
            if resolved_record_id is not None:
                return resolved_record_id
        current_values = await self.current_repository.list_by_context(context_id)
        current_record_ids = {
            value.record_instance_id
            for value in current_values
            if value.field_path == field_path
        }
        if len(current_record_ids) == 1:
            return next(iter(current_record_ids))

        events = await self.event_repository.list_candidates_by_context_field(
            context_id=context_id,
            field_path=field_path,
            record_instance_id=None,
        )
        event_record_ids = {event.record_instance_id for event in events}
        if len(event_record_ids) == 1:
            return next(iter(event_record_ids))
        return None
