from types import SimpleNamespace

import pytest

from app.services import EhrService, ExtractionService, ResearchProjectService, StructuredValueService


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

    async def get_by_field(self, **kwargs):
        return self.current

    async def create(self, params):
        self.current = SimpleNamespace(**params)
        return self.current

    async def save(self, model):
        self.current = model
        return model


class FakeEventRepository:
    def __init__(self):
        self.saved = []

    async def create(self, params):
        event = SimpleNamespace(id="event-1", **params)
        self.saved.append(event)
        return event

    async def save(self, model):
        self.saved.append(model)
        return model


class FakeEvidenceRepository:
    def __init__(self):
        self.created = []

    async def create(self, params):
        evidence = SimpleNamespace(id=f"evidence-{len(self.created) + 1}", **params)
        self.created.append(evidence)
        return evidence


class FakeExtractionRecordRepository:
    async def list_by_context(self, context_id):
        return [SimpleNamespace(id="record-1", context_id=context_id)]


class FakeExtractionValueService:
    def __init__(self):
        self.events = []

    async def record_ai_extracted_value(self, **kwargs):
        self.events.append(kwargs)
        return SimpleNamespace(id=f"event-{len(self.events)}", **kwargs)


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
    async def get_active_by_id(self, patient_id):
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
