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


class ResearchProjectContextMixin:
    async def get_or_create_project_crf_context(
        self,
        *,
        project_patient: ProjectPatient,
        binding: ProjectTemplateBinding,
        created_by: str | None = None,
    ) -> DataContext:
        context = await self.context_repository.get_project_crf(project_patient.id, binding.schema_version_id)
        if context is not None:
            return context
        if isinstance(self.context_repository, DataContextRepository):
            await session.execute(
                text("SELECT pg_advisory_xact_lock(hashtextextended(:lock_key, 0))"),
                {"lock_key": f"project_crf:{project_patient.id}:{binding.schema_version_id}"},
            )
            context = await self.context_repository.get_project_crf(project_patient.id, binding.schema_version_id)
            if context is not None:
                return context

        context = await self.context_repository.create(
            {
                "context_type": "project_crf",
                "patient_id": project_patient.patient_id,
                "project_id": project_patient.project_id,
                "project_patient_id": project_patient.id,
                "schema_version_id": binding.schema_version_id,
                "status": "draft",
                "created_by": created_by,
            }
        )
        version = await self.schema_service.get_version(binding.schema_version_id)
        if version is not None:
            await self.initialize_default_record_instances(context_id=context.id, schema_json=version.schema_json)
        await self._copy_latest_project_crf_values_to_context(
            project_patient_id=project_patient.id,
            target_context=context,
            created_by=created_by,
        )
        return context

    async def _copy_latest_project_crf_values_to_context(
        self,
        *,
        project_patient_id: str,
        target_context: DataContext,
        created_by: str | None,
    ) -> None:
        required_methods = (
            (self.context_repository, "list_project_crfs_by_project_patients"),
            (self.record_repository, "list_by_context"),
            (self.current_repository, "list_by_context"),
            (self.current_repository, "upsert_selected_value"),
            (self.event_repository, "create"),
            (self.evidence_repository, "list_by_event"),
        )
        if any(not hasattr(repository, method) for repository, method in required_methods):
            return
        contexts = await self.context_repository.list_project_crfs_by_project_patients([project_patient_id])
        previous_contexts = [
            context
            for context in contexts
            if context.id != target_context.id and context.schema_version_id != target_context.schema_version_id
        ]
        if not previous_contexts:
            return
        previous_contexts.sort(key=lambda item: getattr(item, "created_at", None) or datetime.min, reverse=True)
        source_context = previous_contexts[0]
        source_records = await self.record_repository.list_by_context(source_context.id)
        target_records = await self.record_repository.list_by_context(target_context.id)
        source_record_by_id = {record.id: record for record in source_records}
        target_record_by_key = {
            (record.form_key, int(record.repeat_index or 0)): record
            for record in target_records
        }
        source_currents = await self.current_repository.list_by_context(source_context.id)
        for current in source_currents:
            source_record = source_record_by_id.get(current.record_instance_id)
            if source_record is None:
                continue
            record_key = (source_record.form_key, int(source_record.repeat_index or 0))
            target_record = target_record_by_key.get(record_key)
            if target_record is None:
                target_record = await self.record_repository.create(
                    {
                        "context_id": target_context.id,
                        "group_key": getattr(source_record, "group_key", None),
                        "group_title": getattr(source_record, "group_title", None),
                        "form_key": source_record.form_key,
                        "form_title": getattr(source_record, "form_title", None),
                        "repeat_index": int(getattr(source_record, "repeat_index", 0) or 0),
                        "instance_label": record_instance_label(
                            getattr(source_record, "form_title", None),
                            getattr(source_record, "form_key", None),
                            getattr(source_record, "repeat_index", 0),
                        ),
                        "anchor_json": getattr(source_record, "anchor_json", None),
                        "source_document_id": getattr(source_record, "source_document_id", None),
                        "created_by_run_id": getattr(source_record, "created_by_run_id", None),
                        "review_status": getattr(source_record, "review_status", None) or "unreviewed",
                    }
                )
                target_record_by_key[record_key] = target_record
            source_event = await self.event_repository.get_by_id(current.selected_event_id) if current.selected_event_id else None
            event = await self.event_repository.create(
                {
                    "context_id": target_context.id,
                    "record_instance_id": target_record.id,
                    "field_key": current.field_key,
                    "field_path": current.field_path,
                    "field_title": getattr(source_event, "field_title", None),
                    "event_type": "schema_version_migration",
                    "value_type": current.value_type,
                    "value_text": current.value_text,
                    "value_number": current.value_number,
                    "value_date": current.value_date,
                    "value_datetime": current.value_datetime,
                    "value_json": current.value_json,
                    "unit": current.unit,
                    "normalized_text": getattr(source_event, "normalized_text", None),
                    "confidence": getattr(source_event, "confidence", None),
                    "extraction_run_id": getattr(source_event, "extraction_run_id", None),
                    "source_document_id": getattr(source_event, "source_document_id", None),
                    "source_event_id": getattr(source_event, "id", None),
                    "review_status": "accepted",
                    "created_by": created_by,
                    "created_at": datetime.utcnow(),
                    "note": "Copied from previous CRF schema version context",
                }
            )
            if source_event is not None:
                for evidence in await self.evidence_repository.list_by_event(source_event.id):
                    await self.evidence_repository.create(
                        {
                            "value_event_id": event.id,
                            "document_id": evidence.document_id,
                            "page_no": evidence.page_no,
                            "bbox_json": evidence.bbox_json,
                            "quote_text": evidence.quote_text,
                            "evidence_type": evidence.evidence_type,
                            "row_key": evidence.row_key,
                            "cell_key": evidence.cell_key,
                            "start_offset": evidence.start_offset,
                            "end_offset": evidence.end_offset,
                            "evidence_score": evidence.evidence_score,
                            "created_at": datetime.utcnow(),
                        }
                    )
            await self.current_repository.upsert_selected_value(
                {
                    "context_id": target_context.id,
                    "record_instance_id": target_record.id,
                    "field_key": current.field_key,
                    "field_path": current.field_path,
                    "selected_event_id": event.id,
                    "value_type": current.value_type,
                    "value_text": current.value_text,
                    "value_number": current.value_number,
                    "value_date": current.value_date,
                    "value_datetime": current.value_datetime,
                    "value_json": current.value_json,
                    "unit": current.unit,
                    "selected_by": current.selected_by,
                    "selected_at": datetime.utcnow(),
                    "review_status": current.review_status,
                    "updated_at": datetime.utcnow(),
                }
            )

    async def get_project_crf(
        self,
        *,
        project_id: str,
        project_patient_id: str,
        created_by: str | None = None,
        owner_id: str | None = None,
    ) -> dict[str, Any]:
        project_patient = await self._get_project_patient_or_404(
            project_id,
            project_patient_id,
            owner_id=owner_id,
        )
        binding = await self.binding_repository.get_active_primary_crf(project_id)
        if binding is None:
            return {"context": None, "schema": None, "records": [], "current_values": {}}

        context = await self.get_or_create_project_crf_context(
            project_patient=project_patient,
            binding=binding,
            created_by=created_by,
        )
        schema_version = await self.schema_service.get_version(context.schema_version_id)
        records = await self.record_repository.list_by_context(context.id)
        current_values = await self.current_repository.list_by_context(context.id)
        return {
            "context": context,
            "schema": schema_version.schema_json if schema_version is not None else None,
            "records": records,
            "current_values": self._current_values_by_display_path(
                current_values,
                schema_version.schema_json if schema_version is not None else None,
                records,
            ),
        }

    async def _get_project_crf_context_or_404(
        self,
        project_id: str,
        project_patient_id: str,
        *,
        owner_id: str | None = None,
    ) -> DataContext:
        crf = await self.get_project_crf(
            project_id=project_id,
            project_patient_id=project_patient_id,
            owner_id=owner_id,
        )
        context = crf["context"]
        if context is None:
            raise ResearchProjectNotFoundError("Project CRF context not found")
        return context
