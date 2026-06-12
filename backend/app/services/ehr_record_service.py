from __future__ import annotations

from fastapi import HTTPException, status

from app.models import RecordInstance
from app.services.record_instance_label import record_instance_label
from core.db import Transactional


class EhrRecordMixin:
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
        owner_id: str | None = None,
    ) -> RecordInstance:
        context = await self._get_patient_context_or_404(patient_id, owner_id=owner_id)
        repeat_index = await self.record_repository.next_repeat_index(context_id=context.id, form_key=form_key)
        return await self.record_repository.create(
            {
                "context_id": context.id,
                "group_key": group_key,
                "group_title": group_title,
                "form_key": form_key,
                "form_title": form_title or form_key,
                "repeat_index": repeat_index,
                "instance_label": instance_label or record_instance_label(form_title, form_key, repeat_index),
                "review_status": "unreviewed",
            }
        )

    @Transactional()
    async def delete_record_instance(self, *, patient_id: str, record_instance_id: str, owner_id: str | None = None) -> None:
        context = await self._get_patient_context_or_404(patient_id, owner_id=owner_id)
        record = await self.record_repository.get_by_id(record_instance_id)
        if record is None or record.context_id != context.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record instance not found")

        events = await self.event_repository.list_by_record(record_instance_id)
        await self.evidence_repository.delete_by_event_ids([event.id for event in events])
        await self.current_repository.delete_by_record(record_instance_id)
        await self.event_repository.delete_by_record(record_instance_id)
        await self.record_repository.delete(record)

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

    async def _resolve_record_for_field_path(
        self,
        *,
        context_id: str,
        record_instance_id: str | None,
        field_path: str,
    ) -> RecordInstance:
        if record_instance_id is not None:
            record = await self._resolve_record(context_id, record_instance_id)
            if self._record_matches_field_path(record, field_path):
                return record

        form_key = self._record_form_key_from_path(field_path)
        if form_key:
            repeat_index = self._repeat_index_from_path(field_path, form_key)
            record = await self.record_repository.get_by_form(
                context_id=context_id,
                form_key=form_key,
                repeat_index=repeat_index,
            )
            if record is not None:
                return record
            base_record = await self.record_repository.get_by_form(
                context_id=context_id,
                form_key=form_key,
                repeat_index=0,
            )
            return await self._create_record_for_repeat_index(
                context_id=context_id,
                form_key=form_key,
                repeat_index=repeat_index,
                base_record=base_record,
            )

        return await self._resolve_record(context_id, None)

    def _record_form_key_from_path(self, field_path: str) -> str | None:
        parts = [part for part in str(field_path or "").split(".") if part]
        if len(parts) >= 2:
            return f"{parts[0]}.{parts[1]}"
        return parts[0] if parts else None

    def _record_matches_field_path(self, record: RecordInstance, field_path: str) -> bool:
        form_key = self._record_form_key_from_path(field_path)
        return not form_key or getattr(record, "form_key", None) == form_key

    def _repeat_index_from_path(self, field_path: str, form_key: str) -> int:
        parts = [part for part in str(field_path or "").split(".") if part]
        form_parts = [part for part in str(form_key or "").split(".") if part]
        candidates = parts[len(form_parts):] if form_parts and parts[: len(form_parts)] == form_parts else parts[2:]
        for part in candidates:
            if part.isdigit():
                return int(part)
        return 0

    async def _create_record_for_repeat_index(
        self,
        *,
        context_id: str,
        form_key: str,
        repeat_index: int,
        base_record: RecordInstance | None = None,
    ) -> RecordInstance:
        form_title = getattr(base_record, "form_title", None) or form_key.split(".")[-1]
        group_key = getattr(base_record, "group_key", None) or (form_key.split(".")[0] if "." in form_key else None)
        group_title = getattr(base_record, "group_title", None) or group_key
        return await self.record_repository.create(
            {
                "context_id": context_id,
                "group_key": group_key,
                "group_title": group_title,
                "form_key": form_key,
                "form_title": form_title,
                "repeat_index": repeat_index,
                "instance_label": record_instance_label(form_title, form_key, repeat_index),
                "review_status": "unreviewed",
            }
        )
