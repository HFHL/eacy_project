from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status

from app.models import FieldCurrentValue
from core.db import Transactional


class EhrFieldMutationMixin:
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
        owner_id: str | None = None,
    ) -> FieldCurrentValue:
        context = await self._get_patient_context_or_404(patient_id, owner_id=owner_id)
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
    async def select_field_event(
        self,
        *,
        patient_id: str,
        field_path: str,
        event_id: str,
        record_instance_id: str | None = None,
        selected_by: str | None = None,
        owner_id: str | None = None,
    ) -> FieldCurrentValue:
        context = await self._get_patient_context_or_404(patient_id, owner_id=owner_id)
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
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field event not found")
        return await self.value_service.select_current_value(event=event, selected_by=selected_by)

    @Transactional()
    async def delete_field_value(
        self,
        *,
        patient_id: str,
        field_path: str,
        record_instance_id: str | None = None,
        owner_id: str | None = None,
    ) -> None:
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

    def _canonical_field_path(self, field_path: str) -> str:
        parts = [part for part in str(field_path or "").split(".") if part and not part.isdigit()]
        return ".".join(parts)

    def _storage_field_path(self, field_path: str) -> str:
        raw_path = ".".join(part for part in str(field_path or "").replace("/", ".").split(".") if part)
        return self._canonical_field_path(raw_path)

    def _field_key_from_path(self, field_path: str) -> str:
        parts = [part for part in str(field_path or "").split(".") if part and not part.isdigit()]
        return parts[-1] if parts else str(field_path or "")

    def _field_path_aliases(self, field_path: str) -> list[str]:
        raw_path = str(field_path or "").strip()
        canonical_path = self._canonical_field_path(raw_path)
        return list(dict.fromkeys(path for path in [raw_path, canonical_path] if path))

    def _path_has_index(self, field_path: str) -> bool:
        return any(part.isdigit() for part in str(field_path or "").split("."))

    async def _resolve_existing_field_path(
        self,
        *,
        context_id: str,
        field_path: str,
        record_instance_id: str | None = None,
    ) -> str:
        current_values = await self.current_repository.list_by_context(context_id)
        existing_paths = {
            value.field_path
            for value in current_values
            if record_instance_id is None or value.record_instance_id == record_instance_id
        }
        for query_path in self._field_path_aliases(field_path):
            if query_path in existing_paths:
                return query_path
        return self._canonical_field_path(field_path)

    async def _resolve_query_record_id(
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
        if record_instance_id is None and not self._path_has_index(field_path):
            return None
        form_key = self._record_form_key_from_path(field_path)
        if not form_key:
            return None
        repeat_index = self._repeat_index_from_path(field_path, form_key)
        record = await self.record_repository.get_by_form(
            context_id=context_id,
            form_key=form_key,
            repeat_index=repeat_index,
        )
        return record.id if record is not None else None

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
        current_record_ids = {value.record_instance_id for value in current_values if value.field_path == field_path}
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
