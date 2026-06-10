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


@pytest.mark.asyncio
async def test_ehr_service_initializes_non_repeatable_forms_only():
    record_repository = FakeRecordRepository()
    service = EhrService(context_repository=SimpleNamespace(), record_repository=record_repository)
    schema_json = {
        "groups": [
            {
                "key": "basic",
                "title": "基本信息",
                "forms": [
                    {"key": "demographics", "title": "人口学情况", "repeatable": False},
                    {"key": "diagnosis", "title": "诊断记录", "repeatable": True},
                ],
            }
        ]
    }

    records = await service.initialize_default_record_instances(
        context_id="context-1",
        schema_json=schema_json,
    )

    assert len(records) == 1
    assert records[0].form_key == "demographics"
    assert records[0].repeat_index == 0


@pytest.mark.asyncio
async def test_structured_value_service_selects_event_as_current_value():
    event_repository = FakeEventRepository()
    current_repository = FakeCurrentRepository()
    service = StructuredValueService(
        event_repository=event_repository,
        current_repository=current_repository,
        evidence_repository=FakeEvidenceRepository(),
    )
    event = SimpleNamespace(
        id="event-1",
        context_id="context-1",
        record_instance_id="record-1",
        field_key="age",
        field_path="basic.demographics.age",
        value_type="number",
        value_text=None,
        value_number=38,
        value_date=None,
        value_datetime=None,
        value_json=None,
        unit="岁",
        review_status="candidate",
    )

    current = await service.select_current_value(event=event, selected_by="user-1")

    assert current.selected_event_id == "event-1"
    assert current.value_number == 38
    assert current.unit == "岁"
    assert event.review_status == "accepted"


@pytest.mark.asyncio
async def test_structured_value_service_deletes_current_and_falls_back_to_latest_candidate():
    event_repository = FakeEventRepository()
    current_repository = FakeCurrentRepository()
    service = StructuredValueService(
        event_repository=event_repository,
        current_repository=current_repository,
        evidence_repository=FakeEvidenceRepository(),
    )
    current_event = SimpleNamespace(
        id="event-current",
        context_id="context-1",
        record_instance_id="record-1",
        field_key="age",
        field_path="basic.demographics.age",
        value_type="number",
        value_text=None,
        value_number=38,
        value_date=None,
        value_datetime=None,
        value_json=None,
        unit="岁",
        review_status="accepted",
        created_at=datetime(2026, 1, 1, 10, 0, 0),
    )
    older_candidate = SimpleNamespace(
        id="event-older",
        context_id="context-1",
        record_instance_id="record-1",
        field_key="age",
        field_path="basic.demographics.age",
        value_type="number",
        value_text=None,
        value_number=39,
        value_date=None,
        value_datetime=None,
        value_json=None,
        unit="岁",
        review_status="candidate",
        created_at=datetime(2026, 1, 1, 11, 0, 0),
    )
    latest_candidate = SimpleNamespace(
        id="event-latest",
        context_id="context-1",
        record_instance_id="record-1",
        field_key="age",
        field_path="basic.demographics.age",
        value_type="number",
        value_text=None,
        value_number=40,
        value_date=None,
        value_datetime=None,
        value_json=None,
        unit="岁",
        review_status="candidate",
        created_at=datetime(2026, 1, 1, 12, 0, 0),
    )
    event_repository.events = [current_event, older_candidate, latest_candidate]
    current_repository.current = SimpleNamespace(
        context_id="context-1",
        record_instance_id="record-1",
        field_key="age",
        field_path="basic.demographics.age",
        selected_event_id="event-current",
        value_type="number",
        value_text=None,
        value_number=38,
        value_date=None,
        value_datetime=None,
        value_json=None,
        unit="岁",
        selected_by="user-1",
        selected_at=datetime(2026, 1, 1, 10, 5, 0),
        review_status="confirmed",
        updated_at=datetime(2026, 1, 1, 10, 5, 0),
    )

    fallback = await service.clear_current_value_with_fallback(
        context_id="context-1",
        record_instance_id="record-1",
        field_path="basic.demographics.age",
    )

    assert fallback is current_repository.current
    assert fallback.selected_event_id == "event-latest"
    assert fallback.value_number == 40
    assert fallback.review_status == "unreviewed"
    assert current_event.review_status == "candidate"
    assert latest_candidate.review_status == "accepted"
    assert current_repository.deleted == [
        {
            "context_id": "context-1",
            "record_instance_id": "record-1",
            "field_path": "basic.demographics.age",
        }
    ]
    assert len(current_repository.locks) >= 2


@pytest.mark.asyncio
async def test_ehr_delete_field_value_keeps_history_and_falls_back_to_candidate():
    event_repository = FakeEventRepository()
    current_repository = FakeCurrentRepository()
    current_event = SimpleNamespace(
        id="event-current",
        context_id="context-1",
        record_instance_id="record-1",
        field_key="gender",
        field_path="basic.demographics.gender",
        value_type="text",
        value_text="男",
        value_number=None,
        value_date=None,
        value_datetime=None,
        value_json=None,
        unit=None,
        review_status="accepted",
        created_at=datetime(2026, 1, 1, 10, 0, 0),
    )
    latest_candidate = SimpleNamespace(
        id="event-latest",
        context_id="context-1",
        record_instance_id="record-1",
        field_key="gender",
        field_path="basic.demographics.gender",
        value_type="text",
        value_text="女",
        value_number=None,
        value_date=None,
        value_datetime=None,
        value_json=None,
        unit=None,
        review_status="candidate",
        created_at=datetime(2026, 1, 1, 11, 0, 0),
    )
    event_repository.events = [current_event, latest_candidate]
    current_repository.current = SimpleNamespace(
        context_id="context-1",
        record_instance_id="record-1",
        field_key="gender",
        field_path="basic.demographics.gender",
        selected_event_id="event-current",
        value_type="text",
        value_text="男",
        value_number=None,
        value_date=None,
        value_datetime=None,
        value_json=None,
        unit=None,
        selected_by="user-1",
        selected_at=datetime(2026, 1, 1, 10, 5, 0),
        review_status="confirmed",
        updated_at=datetime(2026, 1, 1, 10, 5, 0),
    )

    class FakeEhrContextRepository:
        async def get_latest_patient_ehr(self, patient_id):
            return SimpleNamespace(id="context-1", patient_id=patient_id, context_type="patient_ehr")

    value_service = StructuredValueService(
        event_repository=event_repository,
        current_repository=current_repository,
        evidence_repository=FakeEvidenceRepository(),
    )
    service = EhrService(
        context_repository=FakeEhrContextRepository(),
        patient_repository=FakePatientRepository(),
        value_service=value_service,
        current_repository=current_repository,
        event_repository=event_repository,
        evidence_repository=FakeEvidenceRepository(),
    )

    await service.delete_field_value(
        patient_id="patient-1",
        field_path="basic.demographics.gender",
        owner_id="user-1",
    )

    assert current_repository.current.selected_event_id == "event-latest"
    assert current_repository.current.value_text == "女"
    assert current_repository.current.review_status == "unreviewed"
    assert current_event.review_status == "candidate"
    assert latest_candidate.review_status == "accepted"
    assert {event.id for event in event_repository.events} == {"event-current", "event-latest"}


@pytest.mark.asyncio
async def test_structured_value_service_records_ai_event_and_evidence():
    event_repository = FakeEventRepository()
    current_repository = FakeCurrentRepository()
    evidence_repository = FakeEvidenceRepository()
    service = StructuredValueService(
        event_repository=event_repository,
        current_repository=current_repository,
        evidence_repository=evidence_repository,
    )

    event = await service.record_ai_extracted_value(
        context_id="context-1",
        record_instance_id="record-1",
        field_key="gender",
        field_path="basic.demographics.gender",
        value_type="single_select",
        value_text="男",
        evidences=[
            {
                "document_id": "document-1",
                "evidence_type": "field",
                "quote_text": "性别：男",
            }
        ],
    )

    assert event.event_type == "ai_extracted"
    assert len(evidence_repository.created) == 1
    assert evidence_repository.created[0].value_event_id == event.id
    assert current_repository.current.selected_event_id == event.id


@pytest.mark.asyncio
async def test_extraction_service_writes_mock_output_to_structured_values():
    value_service = FakeExtractionValueService()
    service = ExtractionService(
        job_repository=SimpleNamespace(),
        run_repository=SimpleNamespace(),
        record_repository=FakeExtractionRecordRepository(),
        document_repository=FakeExtractionDocumentRepository(),
        value_service=value_service,
    )
    job = SimpleNamespace(
        id="job-1",
        context_id="context-1",
        document_id="document-1",
        input_json={
            "mock_fields": [
                {
                    "field_key": "gender",
                    "field_path": "basic.demographics.gender",
                    "field_title": "Gender",
                    "value_type": "text",
                    "value_text": "female",
                    "confidence": 0.98,
                    "quote_text": "female",
                    "evidences": [{"source_type": "line", "source_id": "p1-l1", "quote_text": "性别：女"}],
                }
            ]
        },
    )
    run = SimpleNamespace(id="run-1")
    parsed_output = service.extractor.extract(job=job)

    await service._write_extracted_values(job=job, run=run, parsed_output=parsed_output)

    assert len(value_service.events) == 1
    event = value_service.events[0]
    assert event["field_path"] == "basic.demographics.gender"
    assert event["extraction_run_id"] == "run-1"
    assert event["source_document_id"] == "document-1"
    assert event["evidences"][0]["document_id"] == "document-1"
    assert event["evidences"][0]["bbox_json"]["polygon"] == [10, 20, 110, 20, 110, 50, 10, 50]
    assert event["evidences"][0]["bbox_json"]["line_id"] == "p1-l1"


def test_extraction_service_aligns_evidence_quote_to_source_id_text():
    service = ExtractionService(value_service=FakeExtractionValueService())
    document = SimpleNamespace(
        ocr_payload_json={
            "lines": [
                {
                    "line_id": "p1-l1",
                    "page_no": 1,
                    "text": "姓名：张三",
                    "polygon": [10, 20, 110, 20, 110, 50, 10, 50],
                    "page_width": 1000,
                    "page_height": 1400,
                    "coord_space": "pixel",
                }
            ]
        },
        parsed_data=None,
    )

    evidences = service._build_field_evidences(
        field={
            "field_path": "basic.demographics.name",
            "value_type": "text",
            "value_text": "张三",
            "quote_text": "张三",
            "evidences": [
                {
                    "source_type": "line",
                    "source_id": "p1-l1",
                    "quote_text": "改写后的片段",
                    "page_no": 1,
                }
            ],
        },
        document_id="document-1",
        source_document=document,
    )

    assert evidences[0]["quote_text"] == "姓名：张三"
    assert evidences[0]["bbox_json"]["line_id"] == "p1-l1"
    assert evidences[0]["evidence_type"] == "document_source_id"


def test_extraction_service_marks_record_shared_as_inherited_not_auto_selectable():
    service = ExtractionService(value_service=FakeExtractionValueService())
    document = SimpleNamespace(
        ocr_payload_json={
            "lines": [
                {
                    "line_id": "p1-l1",
                    "page_no": 1,
                    "text": "入院时间：2021-11-02",
                    "polygon": [10, 20, 110, 20, 110, 50, 10, 50],
                    "page_width": 1000,
                    "page_height": 1400,
                    "coord_space": "pixel",
                }
            ]
        },
        parsed_data=None,
    )

    evidences = service._build_field_evidences(
        field={
            "field_path": "visit.summary.stay_days",
            "value_type": "number",
            "value_number": 10,
            "evidences": [
                {
                    "source_type": "line",
                    "source_id": "p1-l1",
                    "quote_text": "入院时间：2021-11-02",
                    "page_no": 1,
                    "record_shared": True,
                }
            ],
        },
        document_id="document-1",
        source_document=document,
    )

    assert evidences[0]["evidence_type"] == "document_record_shared"
    assert evidences[0]["bbox_json"]["record_shared"] is True
    assert service._should_auto_select_field(evidences) is False


@pytest.mark.asyncio
async def test_extraction_service_writes_repeatable_rows_to_separate_records():
    value_service = FakeExtractionValueService()
    record_repository = FakeExtractionRecordRepository(
        records=[
            SimpleNamespace(
                id="medication-1",
                context_id="context-1",
                group_key="care",
                group_title="care",
                form_key="care.medication",
                form_title="Medication",
                repeat_index=0,
            )
        ]
    )
    service = ExtractionService(
        job_repository=SimpleNamespace(),
        run_repository=SimpleNamespace(),
        record_repository=record_repository,
        document_repository=FakeExtractionDocumentRepository(),
        value_service=value_service,
    )
    job = SimpleNamespace(id="job-1", context_id="context-1", document_id="document-1", requested_by=None)
    run = SimpleNamespace(id="run-1")
    parsed_output = {
        "fields": [
            {
                "field_key": "drug_name",
                "field_path": "care.medication.0.drug_name",
                "field_title": "药物名称",
                "record_form_key": "care.medication",
                "record_form_title": "Medication",
                "value_type": "text",
                "value_text": "吉非替尼",
                "confidence": 0.9,
            },
            {
                "field_key": "drug_name",
                "field_path": "care.medication.1.drug_name",
                "field_title": "药物名称",
                "record_form_key": "care.medication",
                "record_form_title": "Medication",
                "value_type": "text",
                "value_text": "奥希替尼",
                "confidence": 0.9,
            },
        ]
    }

    await service._write_extracted_values(job=job, run=run, parsed_output=parsed_output)

    assert len(value_service.events) == 2
    assert value_service.events[0]["record_instance_id"] == "medication-1"
    assert value_service.events[1]["record_instance_id"] == "record-2"
    assert value_service.events[1]["field_path"] == "care.medication.drug_name"
    assert record_repository.created[0].form_key == "care.medication"
    assert record_repository.created[0].repeat_index == 1


@pytest.mark.asyncio
async def test_project_crf_record_resolution_ignores_mismatched_record_id():
    record_repository = FakeExtractionRecordRepository(
        records=[
            SimpleNamespace(
                id="wrong-record",
                context_id="context-1",
                group_key="费用信息",
                group_title="费用信息",
                form_key="费用信息.住院病案首页",
                form_title="住院病案首页",
                repeat_index=0,
            ),
            SimpleNamespace(
                id="blood-record",
                context_id="context-1",
                group_key="检验检查",
                group_title="检验检查",
                form_key="检验检查.血常规",
                form_title="血常规",
                repeat_index=1,
            ),
        ]
    )
    service = ResearchProjectService(record_repository=record_repository)

    record = await service._resolve_record_for_field_path(
        context_id="context-1",
        record_instance_id="wrong-record",
        field_path="检验检查.血常规.1.白细胞",
    )

    assert record.id == "blood-record"


@pytest.mark.asyncio
async def test_ehr_record_resolution_ignores_mismatched_record_id():
    record_repository = FakeExtractionRecordRepository(
        records=[
            SimpleNamespace(
                id="wrong-record",
                context_id="context-1",
                group_key="费用信息",
                group_title="费用信息",
                form_key="费用信息.住院病案首页",
                form_title="住院病案首页",
                repeat_index=0,
            ),
            SimpleNamespace(
                id="blood-record",
                context_id="context-1",
                group_key="检验检查",
                group_title="检验检查",
                form_key="检验检查.血常规",
                form_title="血常规",
                repeat_index=1,
            ),
        ]
    )
    service = EhrService(record_repository=record_repository)

    record = await service._resolve_record_for_field_path(
        context_id="context-1",
        record_instance_id="wrong-record",
        field_path="检验检查.血常规.1.白细胞",
    )

    assert record.id == "blood-record"


@pytest.mark.asyncio
async def test_extraction_service_reuses_singleton_form_without_merge_binding_across_documents():
    value_service = FakeExtractionValueService()
    record_repository = FakeExtractionRecordRepository(
        records=[
            SimpleNamespace(
                id="demo-1",
                context_id="context-1",
                group_key="basic",
                group_title="basic",
                form_key="basic.demographics",
                form_title="Demographics",
                repeat_index=0,
                anchor_json=None,
                source_document_id=None,
                created_by_run_id=None,
            )
        ]
    )
    service = ExtractionService(
        job_repository=SimpleNamespace(),
        run_repository=SimpleNamespace(),
        record_repository=record_repository,
        document_repository=FakeExtractionDocumentRepository(),
        value_service=value_service,
    )
    parsed_output = {
        "fields": [
            {
                "field_key": "gender",
                "field_path": "basic.demographics.gender",
                "field_title": "性别",
                "record_form_key": "basic.demographics",
                "record_form_title": "Demographics",
                "value_type": "text",
                "value_text": "女",
                "confidence": 0.9,
            }
        ]
    }

    await service._write_extracted_values(
        job=SimpleNamespace(id="job-1", context_id="context-1", document_id="document-1", requested_by=None),
        run=SimpleNamespace(id="run-1"),
        parsed_output=parsed_output,
    )
    await service._write_extracted_values(
        job=SimpleNamespace(id="job-2", context_id="context-1", document_id="document-2", requested_by=None),
        run=SimpleNamespace(id="run-2"),
        parsed_output=parsed_output,
    )

    assert record_repository.created == []
    assert {event["record_instance_id"] for event in value_service.events} == {"demo-1"}
    assert record_repository.records[0].anchor_json["merge_key"] == "form=basic.demographics"


@pytest.mark.asyncio
async def test_extraction_service_skips_field_without_resolvable_form_key():
    value_service = FakeExtractionValueService()
    service = ExtractionService(
        job_repository=SimpleNamespace(),
        run_repository=SimpleNamespace(),
        record_repository=FakeExtractionRecordRepository(),
        document_repository=FakeExtractionDocumentRepository(),
        value_service=value_service,
    )

    await service._write_extracted_values(
        job=SimpleNamespace(id="job-1", context_id="context-1", document_id="document-1", requested_by=None),
        run=SimpleNamespace(id="run-1"),
        parsed_output={
            "fields": [
                {
                    "field_key": "orphan",
                    "field_path": "orphan",
                    "value_type": "text",
                    "value_text": "不应写入",
                    "confidence": 0.9,
                }
            ]
        },
    )

    assert value_service.events == []


def _ct_fields(*, exam_date: str, report_no: str, body_part: str) -> list[dict[str, Any]]:
    merge_binding = "anchor=检查日期;group_key=检查编号(影像号)+检查部位;fallback=报告日期"
    return [
        {
            "field_key": "检查日期",
            "field_path": "影像检查.CT.检查日期",
            "field_title": "检查日期",
            "record_form_key": "影像检查.CT",
            "record_form_title": "CT",
            "merge_binding": merge_binding,
            "value_type": "date",
            "value_date": exam_date,
            "confidence": 0.9,
        },
        {
            "field_key": "检查编号(影像号)",
            "field_path": "影像检查.CT.检查编号(影像号)",
            "field_title": "检查编号(影像号)",
            "record_form_key": "影像检查.CT",
            "record_form_title": "CT",
            "merge_binding": merge_binding,
            "value_type": "text",
            "value_text": report_no,
            "confidence": 0.9,
        },
        {
            "field_key": "检查部位",
            "field_path": "影像检查.CT.检查部位",
            "field_title": "检查部位",
            "record_form_key": "影像检查.CT",
            "record_form_title": "CT",
            "merge_binding": merge_binding,
            "value_type": "text",
            "value_text": body_part,
            "confidence": 0.9,
        },
    ]


def _ct_fields_without_anchor() -> list[dict[str, Any]]:
    merge_binding = "anchor=检查日期;group_key=检查编号(影像号)+检查部位;fallback=报告日期"
    return [
        {
            "field_key": "检查结果",
            "field_path": "影像检查.CT.检查结果",
            "field_title": "检查结果",
            "record_form_key": "影像检查.CT",
            "record_form_title": "CT",
            "merge_binding": merge_binding,
            "value_type": "text",
            "value_text": "未见明显异常",
            "confidence": 0.8,
        }
    ]


@pytest.mark.asyncio
async def test_extraction_service_creates_new_record_for_different_report_anchor():
    value_service = FakeExtractionValueService()
    record_repository = FakeExtractionRecordRepository(
        records=[
            SimpleNamespace(
                id="ct-1",
                context_id="context-1",
                group_key="影像检查",
                group_title="影像检查",
                form_key="影像检查.CT",
                form_title="CT",
                repeat_index=0,
                anchor_json=None,
                source_document_id=None,
                created_by_run_id=None,
            )
        ]
    )
    service = ExtractionService(
        job_repository=SimpleNamespace(),
        run_repository=SimpleNamespace(),
        record_repository=record_repository,
        document_repository=FakeExtractionDocumentRepository(),
        value_service=value_service,
    )

    await service._write_extracted_values(
        job=SimpleNamespace(id="job-1", context_id="context-1", document_id="document-1", requested_by=None),
        run=SimpleNamespace(id="run-1"),
        parsed_output={"fields": _ct_fields(exam_date="2024-01-01", report_no="CT001", body_part="胰腺")},
    )
    await service._write_extracted_values(
        job=SimpleNamespace(id="job-2", context_id="context-1", document_id="document-2", requested_by=None),
        run=SimpleNamespace(id="run-2"),
        parsed_output={"fields": _ct_fields(exam_date="2024-01-02", report_no="CT002", body_part="肝脏")},
    )

    assert len(record_repository.created) == 1
    assert record_repository.records[0].anchor_json["merge_key"] != record_repository.created[0].anchor_json["merge_key"]
    assert record_repository.created[0].repeat_index == 1
    assert record_repository.created[0].instance_label == "CT_2"
    assert {event["record_instance_id"] for event in value_service.events[:3]} == {"ct-1"}
    assert {event["record_instance_id"] for event in value_service.events[3:]} == {"record-2"}
    assert {event["field_path"] for event in value_service.events} == {
        "影像检查.CT.检查日期",
        "影像检查.CT.检查编号(影像号)",
        "影像检查.CT.检查部位",
    }


@pytest.mark.asyncio
async def test_extraction_service_reuses_record_for_same_report_anchor():
    value_service = FakeExtractionValueService()
    record_repository = FakeExtractionRecordRepository(
        records=[
            SimpleNamespace(
                id="ct-1",
                context_id="context-1",
                group_key="影像检查",
                group_title="影像检查",
                form_key="影像检查.CT",
                form_title="CT",
                repeat_index=0,
                anchor_json=None,
                source_document_id=None,
                created_by_run_id=None,
            )
        ]
    )
    service = ExtractionService(
        job_repository=SimpleNamespace(),
        run_repository=SimpleNamespace(),
        record_repository=record_repository,
        document_repository=FakeExtractionDocumentRepository(),
        value_service=value_service,
    )
    fields = _ct_fields(exam_date="2024-01-01", report_no="CT001", body_part="胰腺")

    await service._write_extracted_values(
        job=SimpleNamespace(id="job-1", context_id="context-1", document_id="document-1", requested_by=None),
        run=SimpleNamespace(id="run-1"),
        parsed_output={"fields": fields},
    )
    await service._write_extracted_values(
        job=SimpleNamespace(id="job-2", context_id="context-1", document_id="document-1", requested_by=None),
        run=SimpleNamespace(id="run-2"),
        parsed_output={"fields": fields},
    )

    assert record_repository.created == []
    assert record_repository.records[0].anchor_json["merge_key"]
    assert {event["record_instance_id"] for event in value_service.events} == {"ct-1"}


@pytest.mark.asyncio
async def test_extraction_service_marks_missing_merge_anchor_as_suspicious_duplicate():
    value_service = FakeExtractionValueService()
    record_repository = FakeExtractionRecordRepository(
        records=[
            SimpleNamespace(
                id="ct-1",
                context_id="context-1",
                group_key="影像检查",
                group_title="影像检查",
                form_key="影像检查.CT",
                form_title="CT",
                repeat_index=0,
                anchor_json=None,
                source_document_id=None,
                created_by_run_id=None,
            )
        ]
    )
    service = ExtractionService(
        job_repository=SimpleNamespace(),
        run_repository=SimpleNamespace(),
        record_repository=record_repository,
        document_repository=FakeExtractionDocumentRepository(),
        value_service=value_service,
    )

    await service._write_extracted_values(
        job=SimpleNamespace(id="job-1", context_id="context-1", document_id="document-1", requested_by=None),
        run=SimpleNamespace(id="run-1"),
        parsed_output={"fields": _ct_fields_without_anchor()},
    )
    await service._write_extracted_values(
        job=SimpleNamespace(id="job-2", context_id="context-1", document_id="document-2", requested_by=None),
        run=SimpleNamespace(id="run-2"),
        parsed_output={"fields": _ct_fields_without_anchor()},
    )

    assert len(record_repository.created) == 1
    first_anchor = record_repository.records[0].anchor_json
    second_anchor = record_repository.created[0].anchor_json
    assert first_anchor["duplicate_suspect"] is True
    assert first_anchor["duplicate_suspect_reason"] == "missing_merge_anchor"
    assert first_anchor["anchor_missing"] is True
    assert second_anchor["duplicate_suspect"] is True
    assert first_anchor["merge_key"] != second_anchor["merge_key"]
    assert {event["record_instance_id"] for event in value_service.events} == {"ct-1", "record-2"}


@pytest.mark.asyncio
async def test_extraction_service_creates_first_record_when_repeatable_form_has_no_default():
    value_service = FakeExtractionValueService()
    record_repository = FakeExtractionRecordRepository(
        records=[
            SimpleNamespace(
                id="basic-1",
                context_id="context-1",
                group_key="基本信息",
                group_title="基本信息",
                form_key="基本信息.人口学",
                form_title="人口学",
                repeat_index=0,
                anchor_json=None,
                source_document_id=None,
                created_by_run_id=None,
            )
        ]
    )
    service = ExtractionService(
        job_repository=SimpleNamespace(),
        run_repository=SimpleNamespace(),
        record_repository=record_repository,
        document_repository=FakeExtractionDocumentRepository(),
        value_service=value_service,
    )

    await service._write_extracted_values(
        job=SimpleNamespace(id="job-1", context_id="context-1", document_id="document-1", requested_by=None),
        run=SimpleNamespace(id="run-1"),
        parsed_output={"fields": _ct_fields(exam_date="2024-01-01", report_no="CT001", body_part="胰腺")},
    )

    assert len(record_repository.created) == 1
    assert record_repository.created[0].form_key == "影像检查.CT"
    assert record_repository.created[0].repeat_index == 0
    assert record_repository.created[0].instance_label == "CT"
    assert {event["record_instance_id"] for event in value_service.events} == {"record-2"}


@pytest.mark.asyncio
async def test_ehr_service_resolves_indexed_field_path_to_repeat_record():
    record_repository = FakeExtractionRecordRepository(
        records=[
            SimpleNamespace(
                id="medication-1",
                context_id="context-1",
                group_key="care",
                group_title="care",
                form_key="care.medication",
                form_title="Medication",
                repeat_index=0,
            )
        ]
    )
    service = EhrService(record_repository=record_repository)

    record = await service._resolve_record_for_field_path(
        context_id="context-1",
        record_instance_id=None,
        field_path="care.medication.1.drug_name",
    )

    assert record.id == "record-2"
    assert record.repeat_index == 1
    assert service._storage_field_path("care.medication.1.drug_name") == "care.medication.drug_name"


def test_ehr_service_current_values_include_record_repeat_index():
    service = EhrService()
    schema_json = {
        "properties": {
            "影像检查": {
                "properties": {
                    "CT": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "检查日期": {"type": "string", "format": "date"},
                            },
                        },
                    }
                }
            }
        }
    }
    records = [
        SimpleNamespace(id="ct-1", form_key="影像检查.CT", repeat_index=0),
        SimpleNamespace(id="ct-2", form_key="影像检查.CT", repeat_index=1),
    ]
    current_values = [
        SimpleNamespace(record_instance_id="ct-1", field_path="影像检查.CT.检查日期", value_date="2024-01-01"),
        SimpleNamespace(record_instance_id="ct-2", field_path="影像检查.CT.检查日期", value_date="2024-01-02"),
    ]

    output = service._current_values_by_display_path(current_values, schema_json, records)

    assert set(output.keys()) == {"影像检查.CT.0.检查日期", "影像检查.CT.1.检查日期"}
    assert output["影像检查.CT.1.检查日期"].record_instance_id == "ct-2"


@pytest.mark.asyncio
async def test_research_service_resolves_indexed_field_path_to_repeat_record():
    record_repository = FakeExtractionRecordRepository(
        records=[
            SimpleNamespace(
                id="visit-1",
                context_id="context-1",
                group_key="followup",
                group_title="followup",
                form_key="followup.visit",
                form_title="Visit",
                repeat_index=0,
            )
        ]
    )
    service = ResearchProjectService(record_repository=record_repository)

    record = await service._resolve_record_for_field_path(
        context_id="context-1",
        record_instance_id=None,
        field_path="followup.visit.2.date",
    )

    assert record.id == "record-2"
    assert record.repeat_index == 2
    assert service._storage_field_path("followup.visit.2.date") == "followup.visit.date"


@pytest.mark.asyncio
async def test_extraction_service_reuses_sibling_location_for_derived_enum_evidence():
    service = ExtractionService(value_service=FakeExtractionValueService())
    record = SimpleNamespace(id="record-1")
    field_entries = [
        {
            "field": {"field_path": "治疗情况.药物治疗.药物名称"},
            "record": record,
            "evidences": [
                {
                    "quote_text": "左乙拉西坦",
                    "page_no": 1,
                    "bbox_json": {
                        "polygon": [10, 20, 110, 20, 110, 50, 10, 50],
                        "renderable": True,
                    },
                }
            ],
        },
        {
            "field": {"field_path": "治疗情况.药物治疗.药物类型"},
            "record": record,
            "evidences": [{"quote_text": "神经系统药物", "page_no": None, "bbox_json": None}],
        },
    ]

    service._apply_sibling_evidence_fallback(field_entries)

    evidence = field_entries[1]["evidences"][0]
    assert evidence["quote_text"] == "神经系统药物"
    assert evidence["page_no"] == 1
    assert evidence["bbox_json"]["fallback_strategy"] == "sibling_page_hint"
    assert evidence["bbox_json"].get("polygon") is None
    assert evidence["bbox_json"]["renderable"] is False


@pytest.mark.asyncio
async def test_research_project_service_enrollment_creates_crf_context_and_records():
    project_patient_repository = FakeProjectPatientRepository()
    context_repository = FakeContextRepository()
    record_repository = FakeRecordRepository()
    service = ResearchProjectService(
        project_repository=FakeProjectRepository(),
        project_patient_repository=project_patient_repository,
        binding_repository=FakeBindingRepository(),
        context_repository=context_repository,
        patient_repository=FakePatientRepository(),
        record_repository=record_repository,
        schema_service=FakeSchemaService(),
    )

    project_patient = await service.enroll_patient(
        project_id="project-1",
        patient_id="patient-1",
        enroll_no="S001-001",
        created_by="user-1",
    )

    assert project_patient.status == "enrolled"
    assert len(context_repository.created) == 1
    context = context_repository.created[0]
    assert context.context_type == "project_crf"
    assert context.project_patient_id == "project-patient-1"
    assert len(record_repository.created) == 1
    assert record_repository.created[0].form_key == "baseline"


@pytest.mark.asyncio
async def test_project_crf_new_schema_context_copies_previous_current_values():
    old_context = SimpleNamespace(
        id="context-old",
        context_type="project_crf",
        patient_id="patient-1",
        project_id="project-1",
        project_patient_id="project-patient-1",
        schema_version_id="schema-version-1",
        created_at=datetime(2026, 1, 1, 9, 0, 0),
    )
    context_repository = FakeMigrationContextRepository([old_context])
    source_record = SimpleNamespace(
        id="record-old",
        context_id="context-old",
        group_key="crf",
        group_title="CRF",
        form_key="baseline",
        form_title="Baseline",
        repeat_index=0,
        instance_label="Baseline",
        anchor_json={"source": "old"},
        source_document_id="document-1",
        created_by_run_id="run-1",
        review_status="confirmed",
    )
    record_repository = FakeExtractionRecordRepository(records=[source_record])

    source_event = SimpleNamespace(
        id="event-old",
        context_id="context-old",
        record_instance_id="record-old",
        field_key="gender",
        field_path="baseline.gender",
        field_title="性别",
        event_type="manual_selected",
        value_type="text",
        value_text="女",
        value_number=None,
        value_date=None,
        value_datetime=None,
        value_json=None,
        unit=None,
        normalized_text="女",
        confidence=0.99,
        extraction_run_id="run-1",
        source_document_id="document-1",
        source_event_id=None,
        review_status="accepted",
        created_by="reviewer-1",
        created_at=datetime(2026, 1, 1, 10, 0, 0),
        note=None,
    )
    event_repository = FakeEventRepository()
    event_repository.events = [source_event]

    class FakeMigrationCurrentRepository:
        def __init__(self):
            self.currents = [
                SimpleNamespace(
                    id="current-old",
                    context_id="context-old",
                    record_instance_id="record-old",
                    field_key="gender",
                    field_path="baseline.gender",
                    selected_event_id="event-old",
                    value_type="text",
                    value_text="女",
                    value_number=None,
                    value_date=None,
                    value_datetime=None,
                    value_json=None,
                    unit=None,
                    selected_by="reviewer-1",
                    selected_at=datetime(2026, 1, 1, 10, 5, 0),
                    review_status="confirmed",
                    updated_at=datetime(2026, 1, 1, 10, 5, 0),
                )
            ]
            self.upserts = []

        async def list_by_context(self, context_id):
            return [current for current in self.currents if current.context_id == context_id]

        async def upsert_selected_value(self, values):
            current = SimpleNamespace(id=f"current-{len(self.currents) + 1}", **values)
            self.currents.append(current)
            self.upserts.append(values)
            return current

    current_repository = FakeMigrationCurrentRepository()
    evidence_repository = FakeEvidenceRepository()
    evidence_repository.created = [
        SimpleNamespace(
            id="evidence-old",
            value_event_id="event-old",
            document_id="document-1",
            page_no=1,
            bbox_json={"polygon": [1, 2, 3, 4]},
            quote_text="性别：女",
            evidence_type="field",
            row_key=None,
            cell_key=None,
            start_offset=0,
            end_offset=4,
            evidence_score=0.9,
            created_at=datetime(2026, 1, 1, 10, 0, 0),
        )
    ]
    service = ResearchProjectService(
        context_repository=context_repository,
        record_repository=record_repository,
        schema_service=FakeSchemaService(),
        current_repository=current_repository,
        event_repository=event_repository,
        evidence_repository=evidence_repository,
    )

    target_context = await service.get_or_create_project_crf_context(
        project_patient=SimpleNamespace(
            id="project-patient-1",
            patient_id="patient-1",
            project_id="project-1",
        ),
        binding=SimpleNamespace(schema_version_id="schema-version-2"),
        created_by="user-2",
    )

    assert target_context.schema_version_id == "schema-version-2"
    target_record = record_repository.created[0]
    assert target_record.context_id == target_context.id
    assert target_record.form_key == "baseline"

    migrated_event = event_repository.events[-1]
    assert migrated_event.event_type == "schema_version_migration"
    assert migrated_event.context_id == target_context.id
    assert migrated_event.record_instance_id == target_record.id
    assert migrated_event.source_event_id == "event-old"
    assert migrated_event.value_text == "女"
    assert migrated_event.review_status == "accepted"
    assert migrated_event.created_by == "user-2"

    assert current_repository.upserts[0]["context_id"] == target_context.id
    assert current_repository.upserts[0]["record_instance_id"] == target_record.id
    assert current_repository.upserts[0]["selected_event_id"] == migrated_event.id
    assert current_repository.upserts[0]["review_status"] == "confirmed"

    copied_evidence = [
        evidence for evidence in evidence_repository.created if evidence.value_event_id == migrated_event.id
    ]
    assert len(copied_evidence) == 1
    assert copied_evidence[0].quote_text == "性别：女"
    assert copied_evidence[0].bbox_json == {"polygon": [1, 2, 3, 4]}


class FakeExtractionJobRepository:
    def __init__(self, job=None):
        self.job = job
        self.created = []
        self.saved = []

    async def create(self, params):
        job = SimpleNamespace(id=f"job-{len(self.created) + 1}", **params)
        self.created.append(job)
        self.job = job
        return job

    async def get_by_id(self, job_id):
        return self.job if self.job is not None and self.job.id == job_id else None

    async def save(self, job):
        self.saved.append(SimpleNamespace(**job.__dict__))
        return job

    async def list_shareable_schema_jobs_for_document(self, **_kwargs):
        return []


class FakeExtractionRunRepository:
    def __init__(self):
        self.runs = []
        self.saved = []

    async def list_by_job(self, job_id):
        return [run for run in self.runs if run.job_id == job_id]

    async def create(self, params):
        run = SimpleNamespace(id=f"run-{len(self.runs) + 1}", **params)
        self.runs.append(run)
        return run

    async def save(self, run):
        self.saved.append(SimpleNamespace(**run.__dict__))
        return run


@pytest.mark.asyncio
async def test_extraction_service_process_existing_job_reuses_pending_job():
    job = SimpleNamespace(
        id="job-1",
        job_type="mock",
        status="pending",
        progress=0,
        error_message=None,
        patient_id=None,
        document_id=None,
        context_id="context-1",
        schema_version_id=None,
        input_json={
            "mock_fields": [
                {
                    "field_key": "gender",
                    "field_path": "basic.demographics.gender",
                    "value_type": "text",
                    "value_text": "female",
                }
            ]
        },
        started_at=None,
        finished_at=None,
    )
    value_service = FakeExtractionValueService()
    service = ExtractionService(
        job_repository=FakeExtractionJobRepository(job),
        run_repository=FakeExtractionRunRepository(),
        record_repository=FakeExtractionRecordRepository(),
        value_service=value_service,
        task_progress_service=FakeTaskProgressService(),
    )

    processed_job = await service.process_existing_job("job-1")

    assert processed_job.status == "completed", processed_job.error_message
    assert processed_job.progress == 100
    assert len(service.run_repository.runs) == 1
    assert service.run_repository.runs[0].input_snapshot_json["worker"] is True
    assert len(value_service.events) == 1


class FakeMissingDocumentRepository:
    async def get_visible_by_id(self, document_id, **_kwargs):
        return None


@pytest.mark.asyncio
async def test_extraction_service_process_existing_job_marks_failed_without_raising():
    job = SimpleNamespace(
        id="job-1",
        job_type="patient_ehr",
        status="pending",
        progress=0,
        error_message=None,
        patient_id="patient-1",
        document_id="missing-document",
        context_id="context-1",
        schema_version_id="schema-version-1",
        input_json=None,
        started_at=None,
        finished_at=None,
    )
    service = ExtractionService(
        job_repository=FakeExtractionJobRepository(job),
        run_repository=FakeExtractionRunRepository(),
        record_repository=FakeExtractionRecordRepository(),
        document_repository=FakeMissingDocumentRepository(),
        task_progress_service=FakeTaskProgressService(),
    )

    processed_job = await service.process_existing_job("job-1")

    assert processed_job.status == "failed"
    assert processed_job.error_message == "Document not found"
    assert service.run_repository.runs[0].status == "failed"
    assert service.run_repository.runs[0].error_message == "Document not found"

@pytest.mark.asyncio
async def test_extraction_service_retry_returns_failed_job_to_scheduler():
    job = SimpleNamespace(
        id="job-1",
        job_type="patient_ehr",
        status="failed",
        progress=0,
        error_message="previous",
        patient_id="patient-1",
        document_id="missing-document",
        context_id="context-1",
        schema_version_id="schema-version-1",
        input_json=None,
        started_at=None,
        finished_at=None,
    )
    run_repository = FakeExtractionRunRepository()
    run_repository.runs.append(SimpleNamespace(id="run-1", job_id="job-1", run_no=1, status="failed"))
    service = ExtractionService(
        job_repository=FakeExtractionJobRepository(job),
        run_repository=run_repository,
        record_repository=FakeExtractionRecordRepository(),
        document_repository=FakeMissingDocumentRepository(),
        task_progress_service=FakeTaskProgressService(),
    )
    async def fake_commit_pending_jobs():
        return None

    service._commit_pending_jobs_before_enqueue = fake_commit_pending_jobs

    processed_job = await service.retry_job("job-1")

    assert processed_job.status == "pending"
    assert processed_job.progress == 0
    assert processed_job.error_message is None
    assert len(run_repository.runs) == 1


def test_extraction_scheduler_limits_each_user_before_filling_global_slots():
    service = ExtractionService()
    candidates = [
        SimpleNamespace(id="a-1", requested_by="user-a", project_id="project-1", created_at=1),
        SimpleNamespace(id="a-2", requested_by="user-a", project_id="project-1", created_at=2),
        SimpleNamespace(id="b-1", requested_by="user-b", project_id="project-2", created_at=3),
    ]

    selected = service._choose_jobs_for_fair_dispatch(
        candidates=candidates,
        active_jobs=[],
        global_limit=4,
        user_limit=1,
        project_limit=2,
        max_to_dispatch=4,
    )

    assert [job.id for job in selected] == ["a-1", "b-1"]


def test_extraction_scheduler_skips_user_that_already_has_active_slot():
    service = ExtractionService()
    active_jobs = [SimpleNamespace(id="active-a", requested_by="user-a", project_id="project-1")]
    candidates = [
        SimpleNamespace(id="a-1", requested_by="user-a", project_id="project-1", created_at=1),
        SimpleNamespace(id="b-1", requested_by="user-b", project_id="project-2", created_at=2),
    ]

    selected = service._choose_jobs_for_fair_dispatch(
        candidates=candidates,
        active_jobs=active_jobs,
        global_limit=4,
        user_limit=1,
        project_limit=2,
        max_to_dispatch=4,
    )

    assert [job.id for job in selected] == ["b-1"]


def test_extraction_scheduler_respects_claude_code_queue_capacity_without_blocking_default_queue():
    service = ExtractionService()
    candidates = [
        SimpleNamespace(
            id="claude-a",
            requested_by="user-a",
            project_id="project-1",
            job_type="patient_ehr",
            input_json={"extractor_strategy": "claude_code"},
            created_at=1,
        ),
        SimpleNamespace(
            id="claude-b",
            requested_by="user-b",
            project_id="project-2",
            job_type="patient_ehr",
            input_json={"extractor_strategy": "claude_code"},
            created_at=2,
        ),
        SimpleNamespace(
            id="normal-c",
            requested_by="user-c",
            project_id="project-3",
            job_type="document",
            input_json={},
            created_at=3,
        ),
    ]

    selected = service._choose_jobs_for_fair_dispatch(
        candidates=candidates,
        active_jobs=[],
        global_limit=4,
        user_limit=1,
        project_limit=2,
        max_to_dispatch=4,
        queue_limits={"claude-code": 1, "extraction": 2},
    )

    assert [job.id for job in selected] == ["claude-a", "normal-c"]


def test_filter_schema_fields_includes_merge_anchor_for_targeted_field():
    schema_json = {
        "properties": {
            "影像检查": {
                "properties": {
                    "CT": {
                        "type": "object",
                        "x-merge-binding": "anchor=检查日期",
                        "properties": {
                            "检查日期": {"type": "string", "format": "date", "x-display-name": "检查日期"},
                            "检查结果": {"type": "string", "x-display-name": "检查结果"},
                        },
                    }
                }
            }
        }
    }
    fields = plan_schema_fields(schema_json)
    job = SimpleNamespace(
        input_json={"field_paths": ["影像检查.CT.检查结果"]},
        target_form_key=None,
    )

    selected = ExtractionService()._filter_schema_fields(fields, job)

    assert [field.field_path for field in selected] == ["影像检查.CT.检查结果", "影像检查.CT.检查日期"]


@pytest.mark.asyncio
async def test_extraction_service_rejects_failed_job_without_retry():
    job = SimpleNamespace(id="job-1", status="failed")
    service = ExtractionService(job_repository=FakeExtractionJobRepository(job))

    with pytest.raises(ExtractionConflictError):
        await service.process_existing_job("job-1")

class FakeDocumentRepository:
    def __init__(self, document):
        self.document = document

    async def get_visible_by_id(self, document_id, **_kwargs):
        return self.document if self.document.id == document_id else None


class FakeSchemaServiceForExtraction:
    def __init__(self, schema_json):
        self.schema_json = schema_json

    async def get_version(self, version_id):
        return SimpleNamespace(id=version_id, schema_json=self.schema_json)


class FakeContextRepositoryForExtraction:
    def __init__(self, context):
        self.context = context

    async def get_by_id(self, context_id):
        return self.context if self.context.id == context_id else None


class FakeEhrServiceForExtraction:
    def __init__(self, *, context, schema_json):
        self.context_repository = FakeContextRepositoryForExtraction(context)
        self.schema_service = FakeSchemaServiceForExtraction(schema_json)


class FakeSchemaExtractor:
    def __init__(self):
        self.calls = []

    def extract(self, *, text, fields, document_id, document=None, **kwargs):
        self.calls.append({"text": text, "fields": fields, "document_id": document_id, "document": document})
        return {
            "extractor": "FakeSchemaExtractor",
            "document_id": document_id,
            "raw_output": {"fields": []},
            "fields": [
                {
                    "field_key": fields[0].field_key,
                    "field_path": fields[0].field_path,
                    "field_title": fields[0].field_title,
                    "record_form_key": fields[0].record_form_key,
                    "value_type": "text",
                    "value_text": "男",
                    "quote_text": "性别：男",
                }
            ],
            "validation_status": "valid",
            "validation_log": [],
            "attempt_count": 1,
        }


class FakeSharedClaudeCodeExtractor:
    def __init__(self):
        self.calls = []

    async def extract_async(self, *, text, fields, schema_json, document_id, document=None, job=None, **_kwargs):
        self.calls.append(
            {
                "text": text,
                "fields": fields,
                "schema_json": schema_json,
                "document_id": document_id,
                "job": job,
            }
        )
        return {
            "extractor": "FakeSharedClaudeCodeExtractor",
            "document_id": document_id,
            "raw_output": {"fields": [{"field_path": field.field_path} for field in fields]},
            "fields": [
                {
                    "field_key": field.field_key,
                    "field_path": field.field_path,
                    "field_title": field.field_title,
                    "record_form_key": field.record_form_key,
                    "record_form_title": field.record_form_title,
                    "value_type": "text",
                    "value_text": "男",
                    "confidence": 0.91,
                    "quote_text": "性别：男",
                }
                for field in fields
            ],
            "validation_status": "valid",
            "validation_log": [],
            "validation_warnings": [],
            "discarded_fields": [],
            "attempt_count": 1,
        }


class FakeMultiExtractionJobRepository(FakeExtractionJobRepository):
    def __init__(self, jobs):
        super().__init__(jobs[0] if jobs else None)
        self.jobs = {job.id: job for job in jobs}

    async def get_by_id(self, job_id):
        return self.jobs.get(job_id)

    async def save(self, job):
        self.jobs[job.id] = job
        self.saved.append(SimpleNamespace(**job.__dict__))
        return job

    async def list_shareable_schema_jobs_for_document(
        self,
        *,
        document_id,
        requested_by,
        exclude_job_id,
        statuses=("pending", "queued"),
        **_kwargs,
    ):
        return [
            job
            for job in self.jobs.values()
            if job.id != exclude_job_id
            and job.document_id == document_id
            and job.status in statuses
            and job.requested_by == requested_by
        ]


class FakeSchemaServiceForExtractionMap:
    def __init__(self, schema_by_version):
        self.schema_by_version = schema_by_version

    async def get_version(self, version_id):
        schema_json = self.schema_by_version.get(version_id)
        return SimpleNamespace(id=version_id, schema_json=schema_json) if schema_json is not None else None


class FakeContextRepositoryForExtractionMap:
    def __init__(self, contexts):
        self.contexts = {context.id: context for context in contexts}

    async def get_by_id(self, context_id):
        return self.contexts.get(context_id)


class FakeEhrServiceForExtractionMap:
    def __init__(self, *, contexts, schema_by_version):
        self.context_repository = FakeContextRepositoryForExtractionMap(contexts)
        self.schema_service = FakeSchemaServiceForExtractionMap(schema_by_version)


def project_schema_json():
    return {
        "properties": {
            "basic": {
                "properties": {
                    "demographics": {
                        "type": "object",
                        "properties": {
                            "gender": {"type": "string", "x-display-name": "性别", "enum": ["男", "女"]},
                            "age": {"type": "number", "x-display-name": "年龄"},
                        },
                    },
                    "diagnosis": {
                        "type": "object",
                        "x-sources": {"secondary": ["病案首页"]},
                        "properties": {"name": {"type": "string", "x-display-name": "诊断"}},
                    },
                }
            }
        }
    }


def test_extraction_service_classifies_connection_errors_as_transient():
    service = ExtractionService()

    class ConnectionDoesNotExistError(Exception):
        pass

    wrapped = Exception("connection was closed in the middle of operation")
    wrapped.__cause__ = ConnectionDoesNotExistError()

    assert service._is_transient_error(wrapped) is True
    assert service._is_transient_error(ValueError("bad input")) is False


@pytest.mark.asyncio
async def test_extraction_service_releases_db_before_llm_extract(monkeypatch):
    release_calls = []

    async def fake_release_db_connection():
        release_calls.append(True)

    monkeypatch.setattr("app.services.extraction_service.release_db_connection", fake_release_db_connection)
    monkeypatch.setattr(ExtractionService, "_use_llm_ehr_extractor", lambda self: True)

    extractor = FakeSchemaExtractor()
    service = ExtractionService(llm_ehr_extractor=extractor)
    job = SimpleNamespace(
        id="job-1",
        job_type="project_crf",
        document_id="document-1",
        context_id="context-1",
        schema_version_id="schema-version-1",
        target_form_key="basic.demographics",
        patient_id="patient-1",
        project_id="project-1",
        project_patient_id="project-patient-1",
        input_json=None,
    )

    async def fake_resolve_scope(self, scoped_job):
        document = SimpleNamespace(
            id="document-1",
            patient_id="patient-1",
            ocr_text="性别：男",
            parsed_content=None,
        )
        context = SimpleNamespace(id="context-1", context_type="project_crf", patient_id="patient-1")
        return document, context

    async def fake_get_version(version_id):
        return SimpleNamespace(schema_json=project_schema_json())

    monkeypatch.setattr(ExtractionService, "_resolve_schema_extraction_scope", fake_resolve_scope)
    monkeypatch.setattr(service.ehr_service.schema_service, "get_version", fake_get_version)
    monkeypatch.setattr("app.services.extraction_service.extract_document_text", lambda document: "性别：男")

    output = await service._extract(job=job)

    assert release_calls == [True]
    assert len(extractor.calls) == 1
    assert output["validation_status"] == "valid"


@pytest.mark.asyncio
async def test_project_crf_extraction_reuses_schema_extractor_and_context():
    job = SimpleNamespace(
        id="job-1",
        job_type="project_crf",
        status="pending",
        progress=0,
        error_message=None,
        patient_id="patient-1",
        document_id="document-1",
        project_id="project-1",
        project_patient_id="project-patient-1",
        context_id="context-1",
        schema_version_id="schema-version-1",
        target_form_key="basic.demographics",
        input_json=None,
        started_at=None,
        finished_at=None,
    )
    context = SimpleNamespace(
        id="context-1",
        context_type="project_crf",
        patient_id="patient-1",
        project_id="project-1",
        project_patient_id="project-patient-1",
        schema_version_id="schema-version-1",
    )
    document = SimpleNamespace(
        id="document-1",
        patient_id="patient-1",
        ocr_text="性别：男",
        ocr_payload_json=None,
        parsed_content=None,
        parsed_data=None,
        original_filename="doc.pdf",
        doc_type=None,
        document_type=None,
        doc_subtype=None,
        document_sub_type=None,
        doc_title=None,
        effective_at=None,
    )
    extractor = FakeSchemaExtractor()
    value_service = FakeExtractionValueService()
    service = ExtractionService(
        job_repository=FakeExtractionJobRepository(job),
        run_repository=FakeExtractionRunRepository(),
        record_repository=FakeExtractionRecordRepository(),
        document_repository=FakeDocumentRepository(document),
        ehr_service=FakeEhrServiceForExtraction(context=context, schema_json=project_schema_json()),
        value_service=value_service,
        llm_ehr_extractor=extractor,
        task_progress_service=FakeTaskProgressService(),
    )

    processed_job = await service.process_existing_job("job-1")

    assert processed_job.status == "completed", processed_job.error_message
    assert [field.field_path for field in extractor.calls[0]["fields"]] == [
        "basic.demographics.gender",
        "basic.demographics.age",
    ]
    assert value_service.events[0]["context_id"] == "context-1"
    assert value_service.events[0]["extraction_run_id"] == "run-1"


@pytest.mark.asyncio
async def test_claude_code_worker_shares_one_document_call_across_schema_jobs():
    document = SimpleNamespace(
        id="document-1",
        patient_id="patient-1",
        ocr_text="性别：男",
        ocr_payload_json=None,
        parsed_content=None,
        parsed_data=None,
        original_filename="doc.pdf",
        doc_type=None,
        document_type=None,
        doc_subtype=None,
        document_sub_type=None,
        doc_title=None,
        effective_at=None,
    )
    ehr_context = SimpleNamespace(
        id="context-ehr",
        context_type="patient_ehr",
        patient_id="patient-1",
        project_id=None,
        project_patient_id=None,
        schema_version_id="schema-ehr",
    )
    crf_context = SimpleNamespace(
        id="context-crf",
        context_type="project_crf",
        patient_id="patient-1",
        project_id="project-1",
        project_patient_id="project-patient-1",
        schema_version_id="schema-crf",
    )
    ehr_schema = {
        "properties": {
            "ehr": {
                "properties": {
                    "demographics": {
                        "type": "object",
                        "properties": {"gender": {"type": "string", "x-display-name": "性别"}},
                    }
                }
            }
        }
    }
    crf_schema = {
        "properties": {
            "crf": {
                "properties": {
                    "baseline": {
                        "type": "object",
                        "properties": {"sex": {"type": "string", "x-display-name": "性别"}},
                    }
                }
            }
        }
    }
    primary_job = SimpleNamespace(
        id="job-ehr",
        job_type="targeted_schema",
        status="queued",
        progress=0,
        error_message=None,
        error_type=None,
        patient_id="patient-1",
        document_id="document-1",
        project_id=None,
        project_patient_id=None,
        context_id="context-ehr",
        schema_version_id="schema-ehr",
        target_form_key="ehr.demographics",
        input_json={"extractor_strategy": "claude_code", "form_keys": ["ehr.demographics"]},
        requested_by=None,
        started_at=None,
        finished_at=None,
        timeout_at=None,
    )
    crf_job = SimpleNamespace(
        id="job-crf",
        job_type="project_crf",
        status="queued",
        progress=0,
        error_message=None,
        error_type=None,
        patient_id="patient-1",
        document_id="document-1",
        project_id="project-1",
        project_patient_id="project-patient-1",
        context_id="context-crf",
        schema_version_id="schema-crf",
        target_form_key="crf.baseline",
        input_json={"extractor_strategy": "claude_code", "form_keys": ["crf.baseline"]},
        requested_by=None,
        started_at=None,
        finished_at=None,
        timeout_at=None,
    )
    extractor = FakeSharedClaudeCodeExtractor()
    value_service = FakeExtractionValueService()
    run_repository = FakeExtractionRunRepository()
    service = ExtractionService(
        job_repository=FakeMultiExtractionJobRepository([primary_job, crf_job]),
        run_repository=run_repository,
        record_repository=FakeExtractionRecordRepository(
            records=[
                SimpleNamespace(
                    id="record-ehr",
                    context_id="context-ehr",
                    group_key="ehr",
                    group_title="ehr",
                    form_key="ehr.demographics",
                    form_title="demographics",
                    repeat_index=0,
                ),
                SimpleNamespace(
                    id="record-crf",
                    context_id="context-crf",
                    group_key="crf",
                    group_title="crf",
                    form_key="crf.baseline",
                    form_title="baseline",
                    repeat_index=0,
                ),
            ]
        ),
        document_repository=FakeDocumentRepository(document),
        ehr_service=FakeEhrServiceForExtractionMap(
            contexts=[ehr_context, crf_context],
            schema_by_version={"schema-ehr": ehr_schema, "schema-crf": crf_schema},
        ),
        value_service=value_service,
        claude_code_ehr_extractor=extractor,
        task_progress_service=FakeTaskProgressService(),
    )

    processed_job = await service.process_existing_job("job-ehr")

    assert processed_job.status == "completed", processed_job.error_message
    assert crf_job.status == "completed", crf_job.error_message
    assert len(extractor.calls) == 1
    assert [field.field_path for field in extractor.calls[0]["fields"]] == [
        "ehr.demographics.gender",
        "crf.baseline.sex",
    ]
    assert {event["context_id"] for event in value_service.events} == {"context-ehr", "context-crf"}
    assert {event["extraction_run_id"] for event in value_service.events} == {"run-1", "run-2"}
    runs_by_job = {run.job_id: run for run in run_repository.runs}
    assert runs_by_job["job-ehr"].parsed_output_json["fields"][0]["field_path"] == "ehr.demographics.gender"
    assert runs_by_job["job-crf"].parsed_output_json["fields"][0]["field_path"] == "crf.baseline.sex"


@pytest.mark.asyncio
async def test_targeted_schema_extraction_filters_field_paths():
    job = SimpleNamespace(
        id="job-1",
        job_type="targeted_schema",
        status="pending",
        progress=0,
        error_message=None,
        patient_id="patient-1",
        document_id="document-1",
        project_id=None,
        project_patient_id=None,
        context_id="context-1",
        schema_version_id="schema-version-1",
        target_form_key=None,
        input_json={"field_paths": ["basic.diagnosis.name"]},
        requested_by=None,
        started_at=None,
        finished_at=None,
    )
    context = SimpleNamespace(
        id="context-1",
        context_type="patient_ehr",
        patient_id="patient-1",
        project_id=None,
        project_patient_id=None,
        schema_version_id="schema-version-1",
    )
    document = SimpleNamespace(
        id="document-1",
        patient_id="patient-1",
        ocr_text="诊断：肺癌",
        ocr_payload_json=None,
        parsed_content=None,
        parsed_data=None,
        original_filename="doc.pdf",
        doc_type=None,
        document_type=None,
        doc_subtype=None,
        document_sub_type=None,
        doc_title=None,
        effective_at=None,
    )
    extractor = FakeSchemaExtractor()
    service = disable_extraction_enqueue(ExtractionService(
        job_repository=FakeExtractionJobRepository(job),
        run_repository=FakeExtractionRunRepository(),
        record_repository=FakeExtractionRecordRepository(),
        document_repository=FakeDocumentRepository(document),
        ehr_service=FakeEhrServiceForExtraction(context=context, schema_json=project_schema_json()),
        value_service=FakeExtractionValueService(),
        llm_ehr_extractor=extractor,
    ))

    processed_job = await service.process_existing_job("job-1")

    assert processed_job.status == "completed", processed_job.error_message
    assert [field.field_path for field in extractor.calls[0]["fields"]] == ["basic.diagnosis.name"]


@pytest.mark.asyncio
async def test_create_job_rejects_invalid_schema_targets_before_persisting():
    context = SimpleNamespace(
        id="context-1",
        context_type="patient_ehr",
        patient_id="patient-1",
        project_id=None,
        project_patient_id=None,
        schema_version_id="schema-version-1",
    )
    job_repository = FakeExtractionJobRepository()
    service = ExtractionService(
        job_repository=job_repository,
        run_repository=FakeExtractionRunRepository(),
        record_repository=FakeExtractionRecordRepository(),
        document_repository=FakeDocumentRepository(SimpleNamespace(id="document-1", patient_id="patient-1")),
        ehr_service=FakeEhrServiceForExtraction(context=context, schema_json=project_schema_json()),
        value_service=FakeExtractionValueService(),
        llm_ehr_extractor=FakeSchemaExtractor(),
        task_progress_service=FakeTaskProgressService(),
    )

    with pytest.raises(ExtractionTargetValidationError) as exc_info:
        await service.create_and_process_job(
            requested_by=None,
            job_type="targeted_schema",
            patient_id="patient-1",
            document_id="document-1",
            context_id="context-1",
            schema_version_id="schema-version-1",
            input_json={"field_paths": ["basic.demographics.unknown"]},
        )

    assert job_repository.created == []
    detail = exc_info.value.to_detail()
    assert detail["invalid_field_paths"] == ["basic.demographics.unknown"]
    assert "basic.demographics.gender" in detail["available_field_paths"]
    assert detail["available_fields"][0]["form_key"] == "basic.demographics"


@pytest.mark.asyncio
async def test_project_crf_extraction_rejects_context_mismatch():
    job = SimpleNamespace(
        id="job-1",
        job_type="project_crf",
        status="pending",
        progress=0,
        error_message=None,
        patient_id="patient-1",
        document_id="document-1",
        project_id="project-1",
        project_patient_id="project-patient-1",
        context_id="context-1",
        schema_version_id="schema-version-1",
        target_form_key=None,
        input_json=None,
        started_at=None,
        finished_at=None,
    )
    context = SimpleNamespace(
        id="context-1",
        context_type="project_crf",
        patient_id="patient-1",
        project_id="other-project",
        project_patient_id="project-patient-1",
        schema_version_id="schema-version-1",
    )
    document = SimpleNamespace(id="document-1", patient_id="patient-1")
    service = ExtractionService(
        job_repository=FakeExtractionJobRepository(job),
        run_repository=FakeExtractionRunRepository(),
        record_repository=FakeExtractionRecordRepository(),
        document_repository=FakeDocumentRepository(document),
        ehr_service=FakeEhrServiceForExtraction(context=context, schema_json=project_schema_json()),
        task_progress_service=FakeTaskProgressService(),
    )

    processed_job = await service.process_existing_job("job-1")

    assert processed_job.status == "failed"
    assert processed_job.error_message == "Data context does not belong to project"

@pytest.mark.asyncio
async def test_create_planned_jobs_routes_document_subtype_to_target_forms():
    context = SimpleNamespace(
        id="context-1",
        context_type="project_crf",
        patient_id="patient-1",
        project_id="project-1",
        project_patient_id="project-patient-1",
        schema_version_id="schema-version-1",
    )
    document = SimpleNamespace(
        id="document-1",
        patient_id="patient-1",
        doc_type="病历文书",
        doc_subtype="病案首页",
        document_type=None,
        document_sub_type=None,
        doc_title="病案首页",
        original_filename="病案首页.pdf",
        metadata_json={},
        ocr_text="性别：男",
        ocr_payload_json=None,
        parsed_content=None,
        parsed_data=None,
        effective_at=None,
    )
    extractor = FakeSchemaExtractor()
    job_repository = FakeExtractionJobRepository()
    service = ExtractionService(
        job_repository=job_repository,
        run_repository=FakeExtractionRunRepository(),
        record_repository=FakeExtractionRecordRepository(),
        document_repository=FakeDocumentRepository(document),
        ehr_service=FakeEhrServiceForExtraction(context=context, schema_json={
            "properties": {
                "basic": {
                    "properties": {
                        "demographics": {
                            "type": "object",
                            "x-sources": {"primary": ["病案首页"]},
                            "properties": {"gender": {"type": "string", "x-display-name": "性别"}},
                        },
                        "diagnosis": {
                            "type": "object",
                            "x-sources": {"primary": ["出院小结"]},
                            "properties": {"name": {"type": "string", "x-display-name": "诊断"}},
                        },
                    }
                }
            }
        }),
        value_service=FakeExtractionValueService(),
        llm_ehr_extractor=extractor,
        task_progress_service=FakeTaskProgressService(),
    )

    jobs = await service.create_planned_jobs(
        requested_by=None,
        job_type="project_crf",
        document_id="document-1",
        patient_id="patient-1",
        project_id="project-1",
        project_patient_id="project-patient-1",
        context_id="context-1",
    )

    assert len(jobs) == 1
    assert jobs[0].target_form_key == "basic.demographics"
    assert jobs[0].status == "pending"
    assert jobs[0].input_json["enqueue_async"] is True
    assert jobs[0].input_json["planned_reason"] == "document metadata matched primary source: 病案首页"
    assert extractor.calls == []


@pytest.mark.asyncio
async def test_create_planned_jobs_uses_explicit_current_form_target():
    context = SimpleNamespace(
        id="context-1",
        context_type="project_crf",
        patient_id="patient-1",
        project_id="project-1",
        project_patient_id="project-patient-1",
        schema_version_id="schema-version-1",
    )
    document = SimpleNamespace(
        id="document-1",
        patient_id="patient-1",
        doc_type="病历文书",
        doc_subtype="未知文档",
        document_type=None,
        document_sub_type=None,
        doc_title="未知文档",
        original_filename="unknown.pdf",
        metadata_json={},
        ocr_text="诊断：肺癌",
        ocr_payload_json=None,
        parsed_content=None,
        parsed_data=None,
        effective_at=None,
    )
    extractor = FakeSchemaExtractor()
    service = ExtractionService(
        job_repository=FakeExtractionJobRepository(),
        run_repository=FakeExtractionRunRepository(),
        record_repository=FakeExtractionRecordRepository(),
        document_repository=FakeDocumentRepository(document),
        ehr_service=FakeEhrServiceForExtraction(context=context, schema_json=project_schema_json()),
        value_service=FakeExtractionValueService(),
        llm_ehr_extractor=extractor,
        task_progress_service=FakeTaskProgressService(),
    )

    jobs = await service.create_planned_jobs(
        requested_by=None,
        job_type="targeted_schema",
        document_id="document-1",
        patient_id="patient-1",
        project_id="project-1",
        project_patient_id="project-patient-1",
        context_id="context-1",
        target_form_key="basic.diagnosis",
    )

    assert len(jobs) == 1
    assert jobs[0].target_form_key == "basic.diagnosis"
    assert jobs[0].input_json["match_role"] == "explicit"
    assert jobs[0].input_json["enqueue_async"] is True
    assert extractor.calls == []

class FakePatientEhrServiceForFolderUpdate:
    def __init__(self, *, context, schema_json):
        self.context_repository = FakeContextRepositoryForExtraction(context)
        self.patient_repository = FakePatientRepository()
        self.schema_service = FakeSchemaServiceForExtraction(schema_json)
        self.context = context
        self.schema_json = schema_json

    async def get_patient_ehr(self, patient_id, created_by=None, **_kwargs):
        return {"context": self.context, "schema": self.schema_json, "records": [], "current_values": {}}


class FakePatientDocumentsRepository:
    def __init__(self, documents):
        for document in documents:
            if not hasattr(document, "file_name"):
                document.file_name = getattr(document, "original_filename", None)
        self.documents = documents
        self.list_by_patient_calls = []

    async def list_by_patient(self, patient_id, *, limit=100, **kwargs):
        self.list_by_patient_calls.append({"patient_id": patient_id, "limit": limit, **kwargs})
        return [document for document in self.documents if document.patient_id == patient_id]

    async def get_visible_by_id(self, document_id, **_kwargs):
        return next((document for document in self.documents if document.id == document_id), None)


class FakeExtractionJobRepositoryWithExisting(FakeExtractionJobRepository):
    def __init__(self, existing_jobs=None):
        super().__init__()
        self.existing_jobs = existing_jobs or []

    async def list_by_patient_documents(self, *, patient_id, document_ids):
        return [job for job in self.existing_jobs if job.patient_id == patient_id and job.document_id in document_ids]


async def noop_commit_pending_jobs_before_enqueue():
    return None


class FakeTaskProgressService:
    def __init__(self):
        self.batches: list[dict[str, Any]] = []
        self.items: list[dict[str, Any]] = []

    async def create_batch(self, **params):
        batch = SimpleNamespace(id=f"batch-{len(self.batches) + 1}", **params)
        self.batches.append(batch)
        return batch

    async def persist_plan_snapshot(self, batch_id, plan_json):
        batch = next((entry for entry in self.batches if entry.id == batch_id), None)
        if batch is not None:
            batch.plan_json = plan_json
        return batch

    async def create_item_for_job(self, *, batch_id=None, task_type, job, **_kwargs):
        item = SimpleNamespace(
            id=f"item-{len(self.items) + 1}",
            batch_id=batch_id,
            task_type=task_type,
            extraction_job_id=job.id,
            target_form_key=job.target_form_key,
            status="created",
            progress=int(job.progress or 0),
            stage=None,
            stage_label=None,
            message=None,
            error_message=None,
            started_at=None,
            finished_at=None,
        )
        self.items.append(item)
        return item

    async def aggregate_batch(self, batch_id):
        batch = next((entry for entry in self.batches if entry.id == batch_id), None)
        return batch

    async def mark_job_queued(self, job_id, **_kwargs):
        return None

    async def mark_job_waiting_for_scheduler(self, job, **_kwargs):
        return None

    async def update_job_progress(self, job_or_id, **_kwargs):
        return None

    async def mark_job_failed(self, job, **_kwargs):
        return None

    async def mark_job_succeeded(self, job, **_kwargs):
        return None


async def noop_enqueue_extraction_task(job_id):
    return None


async def noop_attach_async_task_tracking_for_job(**kwargs):
    return "batch-test-1"


def disable_extraction_enqueue(service):
    service.task_progress_service = FakeTaskProgressService()
    service._enqueue_extraction_task = noop_enqueue_extraction_task
    service._commit_pending_jobs_before_enqueue = noop_commit_pending_jobs_before_enqueue
    service._attach_async_task_tracking_for_job = noop_attach_async_task_tracking_for_job
    return service


@pytest.mark.asyncio
async def test_update_patient_ehr_folder_creates_primary_source_target_jobs_only():
    context = SimpleNamespace(
        id="context-1",
        context_type="patient_ehr",
        patient_id="patient-1",
        project_id=None,
        project_patient_id=None,
        schema_version_id="schema-version-1",
    )
    schema_json = {
        "properties": {
            "basic": {
                "properties": {
                    "demographics": {
                        "type": "object",
                        "x-sources": {"primary": ["病案首页"]},
                        "properties": {"gender": {"type": "string", "x-display-name": "性别"}},
                    },
                    "diagnosis": {
                        "type": "object",
                        "x-sources": {"secondary": ["病案首页"]},
                        "properties": {"name": {"type": "string", "x-display-name": "诊断"}},
                    },
                }
            }
        }
    }
    documents = [
        SimpleNamespace(
            id="doc-1",
            patient_id="patient-1",
            status="archived",
            ocr_status="completed",
            ocr_text="性别：男",
            ocr_payload_json=None,
            parsed_content=None,
            parsed_data=None,
            doc_type="病历文书",
            doc_subtype="病案首页",
            document_type=None,
            document_sub_type=None,
            doc_title="病案首页",
            original_filename="病案首页.pdf",
            metadata_json={},
            effective_at=None,
        ),
        SimpleNamespace(
            id="doc-2",
            patient_id="patient-1",
            status="archived",
            ocr_status="completed",
            ocr_text="其他文档",
            ocr_payload_json=None,
            parsed_content=None,
            parsed_data=None,
            doc_type="病历文书",
            doc_subtype="其他",
            document_type=None,
            document_sub_type=None,
            doc_title="其他",
            original_filename="其他.pdf",
            metadata_json={},
            effective_at=None,
        ),
    ]
    extractor = FakeSchemaExtractor()
    service = disable_extraction_enqueue(ExtractionService(
        job_repository=FakeExtractionJobRepositoryWithExisting(),
        run_repository=FakeExtractionRunRepository(),
        record_repository=FakeExtractionRecordRepository(),
        document_repository=FakePatientDocumentsRepository(documents),
        ehr_service=FakePatientEhrServiceForFolderUpdate(context=context, schema_json=schema_json),
        value_service=FakeExtractionValueService(),
        llm_ehr_extractor=extractor,
    ))

    result = await service.update_patient_ehr_folder(patient_id="patient-1", requested_by="user-1")

    assert result["created_jobs"] == 1
    assert result["skipped"] == [{"document_id": "doc-2", "reason": "no primary source matched"}]
    assert result["jobs"][0].job_type == "targeted_schema"
    assert result["jobs"][0].status == "pending"
    assert result["jobs"][0].target_form_key == "basic.demographics"
    assert result["jobs"][0].input_json["match_role"] == "primary"
    assert extractor.calls == []


@pytest.mark.asyncio
async def test_update_patient_ehr_folder_groups_multiple_forms_for_same_document_into_one_job():
    context = SimpleNamespace(
        id="context-1",
        context_type="patient_ehr",
        patient_id="patient-1",
        project_id=None,
        project_patient_id=None,
        schema_version_id="schema-version-1",
    )
    schema_json = {
        "properties": {
            "basic": {
                "properties": {
                    "demographics": {
                        "type": "object",
                        "x-sources": {"primary": ["病案首页"]},
                        "properties": {"gender": {"type": "string", "x-display-name": "性别"}},
                    },
                    "diagnosis": {
                        "type": "object",
                        "x-sources": {"primary": ["病案首页"]},
                        "properties": {"name": {"type": "string", "x-display-name": "诊断"}},
                    },
                }
            }
        }
    }
    document = SimpleNamespace(
        id="doc-1",
        patient_id="patient-1",
        status="archived",
        ocr_status="completed",
        ocr_text="性别：男。诊断：胰腺癌",
        ocr_payload_json=None,
        parsed_content=None,
        parsed_data=None,
        doc_type="病历文书",
        doc_subtype="病案首页",
        document_type=None,
        document_sub_type=None,
        doc_title="病案首页",
        original_filename="病案首页.pdf",
        metadata_json={},
        effective_at=None,
    )
    service = disable_extraction_enqueue(ExtractionService(
        job_repository=FakeExtractionJobRepositoryWithExisting(),
        run_repository=FakeExtractionRunRepository(),
        record_repository=FakeExtractionRecordRepository(),
        document_repository=FakePatientDocumentsRepository([document]),
        ehr_service=FakePatientEhrServiceForFolderUpdate(context=context, schema_json=schema_json),
        value_service=FakeExtractionValueService(),
        llm_ehr_extractor=FakeSchemaExtractor(),
    ))

    result = await service.update_patient_ehr_folder(patient_id="patient-1", requested_by="user-1")

    assert result["created_jobs"] == 1
    job = result["jobs"][0]
    assert job.target_form_key is None
    assert job.input_json["form_keys"] == ["basic.demographics", "basic.diagnosis"]
    assert [item["target_form_key"] for item in job.input_json["planned_forms"]] == ["basic.demographics", "basic.diagnosis"]


@pytest.mark.asyncio
async def test_update_patient_ehr_folder_skips_existing_extracted_documents():
    context = SimpleNamespace(
        id="context-1",
        context_type="patient_ehr",
        patient_id="patient-1",
        project_id=None,
        project_patient_id=None,
        schema_version_id="schema-version-1",
    )
    document = SimpleNamespace(
        id="doc-1",
        patient_id="patient-1",
        status="archived",
        ocr_status="completed",
        ocr_text="性别：男",
        ocr_payload_json=None,
        parsed_content=None,
        parsed_data=None,
        doc_type="病历文书",
        doc_subtype="病案首页",
        document_type=None,
        document_sub_type=None,
        doc_title="病案首页",
        original_filename="病案首页.pdf",
        metadata_json={},
        effective_at=None,
    )
    existing_job = SimpleNamespace(
        patient_id="patient-1",
        document_id="doc-1",
        job_type="targeted_schema",
        status="completed",
    )
    service = disable_extraction_enqueue(ExtractionService(
        job_repository=FakeExtractionJobRepositoryWithExisting(existing_jobs=[existing_job]),
        run_repository=FakeExtractionRunRepository(),
        record_repository=FakeExtractionRecordRepository(),
        document_repository=FakePatientDocumentsRepository([document]),
        ehr_service=FakePatientEhrServiceForFolderUpdate(
            context=context,
            schema_json={
                "properties": {
                    "basic": {
                        "properties": {
                            "demographics": {
                                "type": "object",
                                "x-sources": {"primary": ["病案首页"]},
                                "properties": {"gender": {"type": "string", "x-display-name": "性别"}},
                            }
                        }
                    }
                }
            },
        ),
        value_service=FakeExtractionValueService(),
        llm_ehr_extractor=FakeSchemaExtractor(),
    ))

    result = await service.update_patient_ehr_folder(patient_id="patient-1", requested_by="user-1")

    assert result["created_jobs"] == 0
    assert result["already_extracted_documents"] == 1


@pytest.mark.asyncio
async def test_update_patient_ehr_folder_replans_completed_empty_result():
    context = SimpleNamespace(
        id="context-1",
        context_type="patient_ehr",
        patient_id="patient-1",
        project_id=None,
        project_patient_id=None,
        schema_version_id="schema-version-1",
    )
    document = SimpleNamespace(
        id="doc-1",
        patient_id="patient-1",
        status="archived",
        ocr_status="completed",
        ocr_text="性别：男",
        ocr_payload_json=None,
        parsed_content=None,
        parsed_data=None,
        doc_type="病历文书",
        doc_subtype="病案首页",
        document_type=None,
        document_sub_type=None,
        doc_title="病案首页",
        original_filename="病案首页.pdf",
        metadata_json={},
        effective_at=None,
    )
    existing_job = SimpleNamespace(
        patient_id="patient-1",
        document_id="doc-1",
        job_type="targeted_schema",
        target_form_key="basic.demographics",
        status="completed",
        error_type="empty_result",
    )
    service = disable_extraction_enqueue(ExtractionService(
        job_repository=FakeExtractionJobRepositoryWithExisting(existing_jobs=[existing_job]),
        run_repository=FakeExtractionRunRepository(),
        record_repository=FakeExtractionRecordRepository(),
        document_repository=FakePatientDocumentsRepository([document]),
        ehr_service=FakePatientEhrServiceForFolderUpdate(
            context=context,
            schema_json={
                "properties": {
                    "basic": {
                        "properties": {
                            "demographics": {
                                "type": "object",
                                "x-sources": {"primary": ["病案首页"]},
                                "properties": {"gender": {"type": "string", "x-display-name": "性别"}},
                            }
                        }
                    }
                }
            },
        ),
        value_service=FakeExtractionValueService(),
        llm_ehr_extractor=FakeSchemaExtractor(),
    ))

    result = await service.update_patient_ehr_folder(patient_id="patient-1", requested_by="user-1")

    assert result["created_jobs"] == 1
    assert result["already_extracted_documents"] == 0


@pytest.mark.asyncio
async def test_update_patient_ehr_folder_filters_target_form_keys():
    context = SimpleNamespace(
        id="context-1",
        context_type="patient_ehr",
        patient_id="patient-1",
        project_id=None,
        project_patient_id=None,
        schema_version_id="schema-version-1",
    )
    schema_json = {
        "properties": {
            "basic": {
                "properties": {
                    "demographics": {
                        "type": "object",
                        "x-sources": {"primary": ["病案首页"]},
                        "properties": {"gender": {"type": "string", "x-display-name": "性别"}},
                    },
                    "diagnosis": {
                        "type": "object",
                        "x-sources": {"primary": ["病案首页"]},
                        "properties": {"name": {"type": "string", "x-display-name": "诊断"}},
                    },
                }
            }
        }
    }
    documents = [
        SimpleNamespace(
            id="doc-1",
            patient_id="patient-1",
            status="archived",
            ocr_status="completed",
            ocr_text="性别：男",
            ocr_payload_json=None,
            parsed_content=None,
            parsed_data=None,
            doc_type="病历文书",
            doc_subtype="病案首页",
            document_type=None,
            document_sub_type=None,
            doc_title="病案首页",
            original_filename="病案首页.pdf",
            metadata_json={},
            effective_at=None,
        ),
    ]
    service = disable_extraction_enqueue(ExtractionService(
        job_repository=FakeExtractionJobRepositoryWithExisting(),
        run_repository=FakeExtractionRunRepository(),
        record_repository=FakeExtractionRecordRepository(),
        document_repository=FakePatientDocumentsRepository(documents),
        ehr_service=FakePatientEhrServiceForFolderUpdate(context=context, schema_json=schema_json),
        value_service=FakeExtractionValueService(),
        llm_ehr_extractor=FakeSchemaExtractor(),
    ))

    result = await service.update_patient_ehr_folder(
        patient_id="patient-1",
        requested_by=None,
        target_form_keys=["basic.demographics"],
        mode="incremental",
    )

    assert result["created_jobs"] == 1
    assert result["jobs"][0].target_form_key == "basic.demographics"
    assert result["target_form_keys"] == ["basic.demographics"]


@pytest.mark.asyncio
async def test_update_patient_ehr_folder_rejects_invalid_target_form_before_batch():
    context = SimpleNamespace(
        id="context-1",
        context_type="patient_ehr",
        patient_id="patient-1",
        project_id=None,
        project_patient_id=None,
        schema_version_id="schema-version-1",
    )
    task_progress_service = FakeTaskProgressService()
    job_repository = FakeExtractionJobRepositoryWithExisting()
    document_repository = FakePatientDocumentsRepository([])
    service = ExtractionService(
        job_repository=job_repository,
        run_repository=FakeExtractionRunRepository(),
        record_repository=FakeExtractionRecordRepository(),
        document_repository=document_repository,
        ehr_service=FakePatientEhrServiceForFolderUpdate(
            context=context,
            schema_json=project_schema_json(),
        ),
        value_service=FakeExtractionValueService(),
        llm_ehr_extractor=FakeSchemaExtractor(),
        task_progress_service=task_progress_service,
    )

    with pytest.raises(ExtractionTargetValidationError) as exc_info:
        await service.update_patient_ehr_folder(
            patient_id="patient-1",
            requested_by=None,
            target_form_keys=["missing.form"],
        )

    assert task_progress_service.batches == []
    assert job_repository.created == []
    assert document_repository.list_by_patient_calls == []
    detail = exc_info.value.to_detail()
    assert detail["invalid_form_keys"] == ["missing.form"]
    assert "basic.demographics" in detail["available_form_keys"]


@pytest.mark.asyncio
async def test_update_patient_ehr_folder_targeted_incremental_skips_completed_form_only():
    context = SimpleNamespace(
        id="context-1",
        context_type="patient_ehr",
        patient_id="patient-1",
        project_id=None,
        project_patient_id=None,
        schema_version_id="schema-version-1",
    )
    schema_json = {
        "properties": {
            "basic": {
                "properties": {
                    "demographics": {
                        "type": "object",
                        "x-sources": {"primary": ["病案首页"]},
                        "properties": {"gender": {"type": "string", "x-display-name": "性别"}},
                    },
                    "diagnosis": {
                        "type": "object",
                        "x-sources": {"primary": ["病案首页"]},
                        "properties": {"name": {"type": "string", "x-display-name": "诊断"}},
                    },
                }
            }
        }
    }
    document = SimpleNamespace(
        id="doc-1",
        patient_id="patient-1",
        status="archived",
        ocr_status="completed",
        ocr_text="性别：男",
        ocr_payload_json=None,
        parsed_content=None,
        parsed_data=None,
        doc_type="病历文书",
        doc_subtype="病案首页",
        document_type=None,
        document_sub_type=None,
        doc_title="病案首页",
        original_filename="病案首页.pdf",
        metadata_json={},
        effective_at=None,
    )
    existing_job = SimpleNamespace(
        patient_id="patient-1",
        document_id="doc-1",
        job_type="targeted_schema",
        target_form_key="basic.demographics",
        status="completed",
    )
    service = disable_extraction_enqueue(ExtractionService(
        job_repository=FakeExtractionJobRepositoryWithExisting(existing_jobs=[existing_job]),
        run_repository=FakeExtractionRunRepository(),
        record_repository=FakeExtractionRecordRepository(),
        document_repository=FakePatientDocumentsRepository([document]),
        ehr_service=FakePatientEhrServiceForFolderUpdate(context=context, schema_json=schema_json),
        value_service=FakeExtractionValueService(),
        llm_ehr_extractor=FakeSchemaExtractor(),
    ))

    result = await service.update_patient_ehr_folder(
        patient_id="patient-1",
        requested_by=None,
        target_form_keys=["basic.demographics", "basic.diagnosis"],
        mode="incremental",
    )

    assert result["created_jobs"] == 1
    assert result["jobs"][0].target_form_key == "basic.diagnosis"


@pytest.mark.asyncio
async def test_update_project_crf_folder_scans_patient_visible_documents_from_all_members(monkeypatch):
    context = SimpleNamespace(
        id="context-1",
        context_type="project_crf",
        patient_id="patient-1",
        project_id="project-1",
        project_patient_id="project-patient-1",
        schema_version_id="schema-version-1",
    )
    schema_json = {
        "properties": {
            "baseline": {
                "properties": {
                    "demographics": {
                        "type": "object",
                        "x-sources": {"primary": ["病案首页"]},
                        "properties": {"gender": {"type": "string", "x-display-name": "性别"}},
                    }
                }
            }
        }
    }
    document = SimpleNamespace(
        id="doc-1",
        patient_id="patient-1",
        status="archived",
        ocr_status="completed",
        ocr_text="性别：男",
        ocr_payload_json=None,
        parsed_content=None,
        parsed_data=None,
        doc_type="病历文书",
        doc_subtype="病案首页",
        document_type=None,
        document_sub_type=None,
        doc_title="病案首页",
        original_filename="病案首页.pdf",
        metadata_json={},
        effective_at=None,
        uploaded_by="collaborator-user",
    )

    class FakeResearchProjectServiceForCrfFolder:
        async def get_project_crf(self, **_kwargs):
            return {"context": context, "schema": schema_json, "records": [], "current_values": {}}

    monkeypatch.setattr(
        "app.services.research_project_service.ResearchProjectService",
        FakeResearchProjectServiceForCrfFolder,
    )
    document_repository = FakePatientDocumentsRepository([document])
    service = disable_extraction_enqueue(ExtractionService(
        job_repository=FakeExtractionJobRepositoryWithExisting(),
        run_repository=FakeExtractionRunRepository(),
        record_repository=FakeExtractionRecordRepository(),
        document_repository=document_repository,
        value_service=FakeExtractionValueService(),
        llm_ehr_extractor=FakeSchemaExtractor(),
    ))

    result = await service.update_project_crf_folder(
        project_id="project-1",
        project_patient_id="project-patient-1",
        requested_by="owner-user",
    )

    assert result["created_jobs"] == 1
    assert document_repository.list_by_patient_calls[0]["uploaded_by"] is None
    assert result["jobs"][0].job_type == "project_crf"
    assert result["jobs"][0].project_id == "project-1"
    assert result["jobs"][0].project_patient_id == "project-patient-1"


@pytest.mark.asyncio
async def test_update_project_crf_folder_replans_when_only_targeted_forms_exist(monkeypatch):
    context = SimpleNamespace(
        id="context-1",
        context_type="project_crf",
        patient_id="patient-1",
        project_id="project-1",
        project_patient_id="project-patient-1",
        schema_version_id="schema-version-1",
    )
    schema_json = {
        "properties": {
            "baseline": {
                "properties": {
                    "demographics": {
                        "type": "object",
                        "x-sources": {"primary": ["病案首页"]},
                        "properties": {"gender": {"type": "string", "x-display-name": "性别"}},
                    },
                    "diagnosis": {
                        "type": "object",
                        "properties": {"name": {"type": "string", "x-display-name": "诊断"}},
                    },
                }
            }
        }
    }
    document = SimpleNamespace(
        id="doc-1",
        patient_id="patient-1",
        status="archived",
        ocr_status="completed",
        ocr_text="性别：男。诊断：胰腺癌",
        ocr_payload_json=None,
        parsed_content=None,
        parsed_data=None,
        doc_type="病历文书",
        doc_subtype="病案首页",
        document_type=None,
        document_sub_type=None,
        doc_title="病案首页",
        original_filename="病案首页.pdf",
        metadata_json={},
        effective_at=None,
    )
    existing_targeted_job = SimpleNamespace(
        patient_id="patient-1",
        document_id="doc-1",
        job_type="project_crf",
        project_id="project-1",
        project_patient_id="project-patient-1",
        target_form_key="baseline.demographics",
        input_json={"form_keys": ["baseline.demographics"]},
        status="completed",
        error_type=None,
    )

    class FakeResearchProjectServiceForCrfFolder:
        async def get_project_crf(self, **_kwargs):
            return {"context": context, "schema": schema_json, "records": [], "current_values": {}}

    monkeypatch.setattr(
        "app.services.research_project_service.ResearchProjectService",
        FakeResearchProjectServiceForCrfFolder,
    )
    service = disable_extraction_enqueue(ExtractionService(
        job_repository=FakeExtractionJobRepositoryWithExisting(existing_jobs=[existing_targeted_job]),
        run_repository=FakeExtractionRunRepository(),
        record_repository=FakeExtractionRecordRepository(),
        document_repository=FakePatientDocumentsRepository([document]),
        value_service=FakeExtractionValueService(),
        llm_ehr_extractor=FakeSchemaExtractor(),
    ))

    result = await service.update_project_crf_folder(
        project_id="project-1",
        project_patient_id="project-patient-1",
        requested_by="owner-user",
    )

    assert result["created_jobs"] == 1
    assert result["already_extracted_documents"] == 0
    job = result["jobs"][0]
    assert job.target_form_key == "baseline.diagnosis"
    assert job.input_json["form_keys"] == ["baseline.diagnosis"]
    assert job.input_json["match_role"] == "secondary"
    assert "all_schema" not in job.input_json


@pytest.mark.asyncio
async def test_update_project_crf_folder_incremental_skips_full_schema_job(monkeypatch):
    context = SimpleNamespace(
        id="context-1",
        context_type="project_crf",
        patient_id="patient-1",
        project_id="project-1",
        project_patient_id="project-patient-1",
        schema_version_id="schema-version-1",
    )
    schema_json = {
        "properties": {
            "baseline": {
                "properties": {
                    "demographics": {
                        "type": "object",
                        "x-sources": {"primary": ["病案首页"]},
                        "properties": {"gender": {"type": "string", "x-display-name": "性别"}},
                    }
                }
            }
        }
    }
    document = SimpleNamespace(
        id="doc-1",
        patient_id="patient-1",
        status="archived",
        ocr_status="completed",
        ocr_text="性别：男",
        ocr_payload_json=None,
        parsed_content=None,
        parsed_data=None,
        doc_type="病历文书",
        doc_subtype="病案首页",
        document_type=None,
        document_sub_type=None,
        doc_title="病案首页",
        original_filename="病案首页.pdf",
        metadata_json={},
        effective_at=None,
    )
    existing_full_job = SimpleNamespace(
        patient_id="patient-1",
        document_id="doc-1",
        job_type="project_crf",
        project_id="project-1",
        project_patient_id="project-patient-1",
        target_form_key=None,
        input_json={"source": "project_crf_folder_update", "all_schema": True},
        status="completed",
        error_type=None,
    )

    class FakeResearchProjectServiceForCrfFolder:
        async def get_project_crf(self, **_kwargs):
            return {"context": context, "schema": schema_json, "records": [], "current_values": {}}

    monkeypatch.setattr(
        "app.services.research_project_service.ResearchProjectService",
        FakeResearchProjectServiceForCrfFolder,
    )
    service = disable_extraction_enqueue(ExtractionService(
        job_repository=FakeExtractionJobRepositoryWithExisting(existing_jobs=[existing_full_job]),
        run_repository=FakeExtractionRunRepository(),
        record_repository=FakeExtractionRecordRepository(),
        document_repository=FakePatientDocumentsRepository([document]),
        value_service=FakeExtractionValueService(),
        llm_ehr_extractor=FakeSchemaExtractor(),
    ))

    result = await service.update_project_crf_folder(
        project_id="project-1",
        project_patient_id="project-patient-1",
        requested_by="owner-user",
    )

    assert result["created_jobs"] == 0
    assert result["already_extracted_documents"] == 1


@pytest.mark.asyncio
async def test_update_project_crf_folder_batch_rejects_invalid_target_form_before_batch(monkeypatch):
    context = SimpleNamespace(
        id="context-1",
        context_type="project_crf",
        patient_id="patient-1",
        project_id="project-1",
        project_patient_id="project-patient-1",
        schema_version_id="schema-version-1",
    )
    schema_json = {
        "properties": {
            "baseline": {
                "properties": {
                    "demographics": {
                        "type": "object",
                        "x-sources": {"primary": ["病案首页"]},
                        "properties": {"gender": {"type": "string", "x-display-name": "性别"}},
                    }
                }
            }
        }
    }

    class FakeResearchProjectServiceForCrfBatch:
        async def get_project(self, project_id, owner_id=None):
            return SimpleNamespace(id=project_id, owner_id=owner_id)

        async def get_project_crf(self, **_kwargs):
            return {"context": context, "schema": schema_json, "records": [], "current_values": {}}

    monkeypatch.setattr(
        "app.services.research_project_service.ResearchProjectService",
        FakeResearchProjectServiceForCrfBatch,
    )
    task_progress_service = FakeTaskProgressService()
    job_repository = FakeExtractionJobRepositoryWithExisting()
    document_repository = FakePatientDocumentsRepository([])
    service = ExtractionService(
        job_repository=job_repository,
        run_repository=FakeExtractionRunRepository(),
        record_repository=FakeExtractionRecordRepository(),
        document_repository=document_repository,
        value_service=FakeExtractionValueService(),
        llm_ehr_extractor=FakeSchemaExtractor(),
        task_progress_service=task_progress_service,
    )

    with pytest.raises(ExtractionTargetValidationError) as exc_info:
        await service.update_project_crf_folder_batch(
            project_id="project-1",
            project_patient_ids=["project-patient-1"],
            requested_by=None,
            target_form_keys=["missing.form"],
        )

    assert task_progress_service.batches == []
    assert job_repository.created == []
    assert document_repository.list_by_patient_calls == []
    detail = exc_info.value.to_detail()
    assert detail["invalid_form_keys"] == ["missing.form"]
    assert "baseline.demographics" in detail["available_form_keys"]


@pytest.mark.asyncio
async def test_structured_value_service_coerces_date_datetime_and_null_json_values():
    event_repository = FakeEventRepository()
    current_repository = FakeCurrentRepository()
    service = StructuredValueService(
        event_repository=event_repository,
        current_repository=current_repository,
        evidence_repository=FakeEvidenceRepository(),
    )

    event = await service.record_ai_extracted_value(
        context_id="context-1",
        record_instance_id="record-1",
        field_key="入院日期",
        field_path="诊断记录.诊断记录.入院日期",
        value_type="date",
        value_date="2025-08-13",
        value_json="null",
        auto_select_if_empty=True,
    )

    assert event.value_date.isoformat() == "2025-08-13"
    assert event.value_json is None
    assert current_repository.current.value_date.isoformat() == "2025-08-13"
    assert current_repository.current.value_json is None

class FailingSchemaExtractor:
    def extract(self, *, text, fields, document_id, document=None):
        raise RuntimeError("LLM validation failed")


@pytest.mark.asyncio
async def test_update_patient_ehr_folder_keeps_going_when_target_job_fails():
    context = SimpleNamespace(
        id="context-1",
        context_type="patient_ehr",
        patient_id="patient-1",
        project_id=None,
        project_patient_id=None,
        schema_version_id="schema-version-1",
    )
    schema_json = {
        "properties": {
            "basic": {
                "properties": {
                    "demographics": {
                        "type": "object",
                        "x-sources": {"primary": ["病案首页"]},
                        "properties": {"gender": {"type": "string", "x-display-name": "性别"}},
                    }
                }
            }
        }
    }
    document = SimpleNamespace(
        id="doc-1",
        patient_id="patient-1",
        status="archived",
        ocr_status="completed",
        ocr_text="性别：男",
        ocr_payload_json=None,
        parsed_content=None,
        parsed_data=None,
        doc_type="病历文书",
        doc_subtype="病案首页",
        document_type=None,
        document_sub_type=None,
        doc_title="病案首页",
        original_filename="病案首页.pdf",
        metadata_json={},
        effective_at=None,
    )
    service = disable_extraction_enqueue(ExtractionService(
        job_repository=FakeExtractionJobRepositoryWithExisting(),
        run_repository=FakeExtractionRunRepository(),
        record_repository=FakeExtractionRecordRepository(),
        document_repository=FakePatientDocumentsRepository([document]),
        ehr_service=FakePatientEhrServiceForFolderUpdate(context=context, schema_json=schema_json),
        value_service=FakeExtractionValueService(),
        llm_ehr_extractor=FailingSchemaExtractor(),
    ))

    result = await service.update_patient_ehr_folder(patient_id="patient-1", requested_by="user-1")

    assert result["created_jobs"] == 1
    assert result["completed_jobs"] == 0
    assert result["failed_jobs"] == 0
    assert result["submitted_jobs"] == 1
    assert result["jobs"][0].status == "pending"
    assert getattr(result["jobs"][0], "error_message", None) is None

class EmptySchemaExtractor:
    def extract(self, *, text, fields, document_id, document=None, **_kwargs):
        return {
            "extractor": "EmptySchemaExtractor",
            "document_id": document_id,
            "raw_output": {},
            "fields": [],
            "validation_status": "valid_empty",
            "validation_log": [{"attempt": 1, "status": "valid_empty", "warnings": ["No extractable records[] or fields[] returned"]}],
            "validation_warnings": ["No extractable records[] or fields[] returned"],
            "attempt_count": 1,
        }


@pytest.mark.asyncio
async def test_empty_schema_extraction_persists_empty_result_reason():
    job = SimpleNamespace(
        id="job-empty",
        job_type="targeted_schema",
        status="pending",
        progress=0,
        error_message=None,
        error_type=None,
        patient_id="patient-1",
        document_id="doc-1",
        project_id=None,
        project_patient_id=None,
        context_id="context-1",
        schema_version_id="schema-version-1",
        target_form_key="basic.demographics",
        input_json=None,
        requested_by=None,
        started_at=None,
        finished_at=None,
    )
    context = SimpleNamespace(
        id="context-1",
        context_type="patient_ehr",
        patient_id="patient-1",
        project_id=None,
        project_patient_id=None,
        schema_version_id="schema-version-1",
    )
    document = SimpleNamespace(
        id="doc-1",
        patient_id="patient-1",
        status="archived",
        ocr_status="completed",
        ocr_text="无相关内容",
        ocr_payload_json=None,
        parsed_content=None,
        parsed_data=None,
        doc_type="病历文书",
        doc_subtype="病案首页",
        document_type=None,
        document_sub_type=None,
        doc_title="病案首页",
        original_filename="病案首页.pdf",
        metadata_json={},
        effective_at=None,
    )
    run_repository = FakeExtractionRunRepository()
    service = ExtractionService(
        job_repository=FakeExtractionJobRepository(job),
        run_repository=run_repository,
        record_repository=FakeExtractionRecordRepository(),
        document_repository=FakePatientDocumentsRepository([document]),
        ehr_service=FakeEhrServiceForExtraction(
            context=context,
            schema_json={
                "properties": {
                    "basic": {
                        "properties": {
                            "demographics": {
                                "type": "object",
                                "x-sources": {"primary": ["病案首页"]},
                                "properties": {"gender": {"type": "string", "x-display-name": "性别"}},
                            }
                        }
                    }
                }
            },
        ),
        value_service=FakeExtractionValueService(),
        llm_ehr_extractor=EmptySchemaExtractor(),
        task_progress_service=FakeTaskProgressService(),
    )

    processed_job = await service.process_existing_job("job-empty")

    assert processed_job.status == "completed", processed_job.error_message
    assert processed_job.error_type == "empty_result"
    assert "basic.demographics" in processed_job.error_message
    run = run_repository.runs[0]
    assert run.error_type == "empty_result"
    assert run.parsed_output_json["fields"] == []
    assert run.parsed_output_json["empty_result_reason"] == processed_job.error_message


@pytest.mark.asyncio
async def test_update_patient_ehr_folder_marks_empty_extraction_completed():
    context = SimpleNamespace(
        id="context-1",
        context_type="patient_ehr",
        patient_id="patient-1",
        project_id=None,
        project_patient_id=None,
        schema_version_id="schema-version-1",
    )
    schema_json = {
        "properties": {
            "basic": {
                "properties": {
                    "demographics": {
                        "type": "object",
                        "x-sources": {"primary": ["病案首页"]},
                        "properties": {"gender": {"type": "string", "x-display-name": "性别"}},
                    }
                }
            }
        }
    }
    document = SimpleNamespace(
        id="doc-1",
        patient_id="patient-1",
        status="archived",
        ocr_status="completed",
        ocr_text="无相关内容",
        ocr_payload_json=None,
        parsed_content=None,
        parsed_data=None,
        doc_type="病历文书",
        doc_subtype="病案首页",
        document_type=None,
        document_sub_type=None,
        doc_title="病案首页",
        original_filename="病案首页.pdf",
        metadata_json={},
        effective_at=None,
    )
    service = disable_extraction_enqueue(ExtractionService(
        job_repository=FakeExtractionJobRepositoryWithExisting(),
        run_repository=FakeExtractionRunRepository(),
        record_repository=FakeExtractionRecordRepository(),
        document_repository=FakePatientDocumentsRepository([document]),
        ehr_service=FakePatientEhrServiceForFolderUpdate(context=context, schema_json=schema_json),
        value_service=FakeExtractionValueService(),
        llm_ehr_extractor=EmptySchemaExtractor(),
    ))

    result = await service.update_patient_ehr_folder(patient_id="patient-1", requested_by="user-1")

    assert result["created_jobs"] == 1
    assert result["completed_jobs"] == 0
    assert result["failed_jobs"] == 0
    assert result["submitted_jobs"] == 1
    assert result["jobs"][0].status == "pending"
    assert service.run_repository.runs == []
