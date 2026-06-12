from datetime import datetime
from types import SimpleNamespace
from typing import Any

import pytest

from app.services import EhrService, ExtractionService, ResearchProjectService, StructuredValueService
from app.services.extraction_service import ExtractionConflictError, ExtractionTargetValidationError
from app.services.schema_field_planner import plan_schema_fields


class FakeRecordRepository:
    def __init__(self):
        self.created = []

    async def get_by_form(self, **kwargs):
        return None

    async def create(self, params):
        record = SimpleNamespace(id=f"record-{len(self.created) + 1}", **params)
        self.created.append(record)
        return record


class FakeCurrentRepository:
    def __init__(self):
        self.current = None
        self.deleted = []
        self.locks = []

    async def get_by_field(self, **kwargs):
        if self.current is None:
            return None
        if (
            self.current.context_id == kwargs.get("context_id")
            and self.current.record_instance_id == kwargs.get("record_instance_id")
            and self.current.field_path == kwargs.get("field_path")
        ):
            return self.current
        return None

    async def lock_field_scope(self, **kwargs):
        self.locks.append(kwargs)

    async def create(self, params):
        self.current = SimpleNamespace(**params)
        return self.current

    async def save(self, model):
        self.current = model
        return model

    async def list_by_context(self, context_id):
        return [self.current] if self.current is not None and self.current.context_id == context_id else []

    async def delete_by_context_field(self, **kwargs):
        self.deleted.append(kwargs)
        if (
            self.current is not None
            and self.current.context_id == kwargs.get("context_id")
            and self.current.field_path == kwargs.get("field_path")
            and (
                kwargs.get("record_instance_id") is None
                or self.current.record_instance_id == kwargs.get("record_instance_id")
            )
        ):
            self.current = None


class FakeEventRepository:
    def __init__(self):
        self.saved = []
        self.events = []

    async def create(self, params):
        event = SimpleNamespace(id=f"event-{len(self.events) + 1}", **params)
        self.events.append(event)
        self.saved.append(event)
        return event

    async def save(self, model):
        self.saved.append(model)
        if all(event.id != model.id for event in self.events):
            self.events.append(model)
        return model

    async def get_by_id(self, event_id):
        return next((event for event in self.events if event.id == event_id), None)

    async def list_candidates_by_context_field(self, *, context_id, field_path, record_instance_id=None):
        events = [
            event
            for event in self.events
            if event.context_id == context_id
            and event.field_path == field_path
            and event.review_status in {"candidate", "accepted"}
            and (record_instance_id is None or event.record_instance_id == record_instance_id)
        ]
        return sorted(events, key=lambda event: getattr(event, "created_at", datetime.min), reverse=True)


class FakeEvidenceRepository:
    def __init__(self):
        self.created = []

    async def create(self, params):
        evidence = SimpleNamespace(id=f"evidence-{len(self.created) + 1}", **params)
        self.created.append(evidence)
        return evidence

    async def list_by_event(self, value_event_id):
        return [evidence for evidence in self.created if evidence.value_event_id == value_event_id]


class FakeExtractionRecordRepository:
    def __init__(self, records=None):
        self.records = records or [
            SimpleNamespace(
                id="record-1",
                context_id="context-1",
                group_key="basic",
                group_title="basic",
                form_key="basic.demographics",
                form_title="demographics",
                repeat_index=0,
            )
        ]
        self.created = []

    async def list_by_context(self, context_id):
        return [record for record in self.records if record.context_id == context_id]

    async def get_by_form(self, *, context_id, form_key, repeat_index=0):
        return next(
            (
                record for record in self.records
                if record.context_id == context_id
                and record.form_key == form_key
                and record.repeat_index == repeat_index
            ),
            None,
        )

    async def get_by_id(self, record_id):
        return next((record for record in self.records if record.id == record_id), None)

    async def create(self, params):
        record = SimpleNamespace(id=f"record-{len(self.records) + 1}", **params)
        self.records.append(record)
        self.created.append(record)
        return record

    async def save(self, record):
        return record

    async def next_repeat_index(self, *, context_id, form_key):
        indexes = [
            int(record.repeat_index or 0)
            for record in self.records
            if record.context_id == context_id and record.form_key == form_key
        ]
        return max(indexes, default=-1) + 1


class FakeExtractionDocumentRepository:
    async def get_visible_by_id(self, document_id, **_kwargs):
        return SimpleNamespace(
            id=document_id,
            ocr_payload_json={
                "lines": [
                    {
                        "line_id": "p1-l1",
                        "page_no": 1,
                        "text": "性别：女",
                        "polygon": [10, 20, 110, 20, 110, 50, 10, 50],
                        "coord_space": "pixel",
                        "page_width": 1000,
                        "page_height": 1400,
                        "textin_position": [10, 20, 110, 20, 110, 50, 10, 50],
                    }
                ]
            },
            parsed_data=None,
        )


class FakeExtractionValueService:
    def __init__(self):
        self.events = []

    async def record_ai_extracted_value(self, **kwargs):
        self.events.append(kwargs)
        return SimpleNamespace(id=f"event-{len(self.events)}", **kwargs)


FakeExtractionValueService.__module__ = "tests.services.test_service_layer"


class FakeProjectRepository:
    async def get_by_id(self, project_id):
        return SimpleNamespace(id=project_id, status="active")


class FakeProjectPatientRepository:
    def __init__(self):
        self.created = []

    async def get_by_project_patient(self, project_id, patient_id):
        return None

    async def create(self, params):
        project_patient = SimpleNamespace(id="project-patient-1", **params)
        self.created.append(project_patient)
        return project_patient


class FakeBindingRepository:
    async def get_active_primary_crf(self, project_id):
        return SimpleNamespace(id="binding-1", project_id=project_id, schema_version_id="schema-version-1")


class FakeContextRepository:
    def __init__(self):
        self.created = []

    async def get_project_crf(self, project_patient_id, schema_version_id):
        return None

    async def create(self, params):
        context = SimpleNamespace(id="context-1", **params)
        self.created.append(context)
        return context


class FakePatientRepository:
    async def get_active_by_id(self, patient_id, **_kwargs):
        return SimpleNamespace(id=patient_id)


class FakeSchemaService:
    async def get_version(self, version_id):
        return SimpleNamespace(
            id=version_id,
            schema_json={
                "groups": [
                    {
                        "key": "crf",
                        "forms": [
                            {"key": "baseline", "title": "Baseline", "repeatable": False},
                            {"key": "visit", "title": "Visit", "repeatable": True},
                        ],
                    }
                ]
            },
        )


class FakeMigrationContextRepository:
    def __init__(self, existing_contexts):
        self.contexts = list(existing_contexts)
        self.created = []

    async def get_project_crf(self, project_patient_id, schema_version_id):
        return next(
            (
                context
                for context in self.contexts
                if context.project_patient_id == project_patient_id
                and context.schema_version_id == schema_version_id
                and context.context_type == "project_crf"
            ),
            None,
        )

    async def create(self, params):
        context = SimpleNamespace(
            id=f"context-{len(self.contexts) + 1}",
            created_at=datetime(2026, 1, len(self.contexts) + 1, 9, 0, 0),
            **params,
        )
        self.contexts.append(context)
        self.created.append(context)
        return context

    async def list_project_crfs_by_project_patients(self, project_patient_ids):
        return [
            context
            for context in self.contexts
            if context.context_type == "project_crf" and context.project_patient_id in project_patient_ids
        ]
