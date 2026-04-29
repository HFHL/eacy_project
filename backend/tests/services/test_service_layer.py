from types import SimpleNamespace

import pytest

from app.services import EhrService, ExtractionService, ResearchProjectService, StructuredValueService
from app.services.extraction_service import ExtractionConflictError


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
        return [SimpleNamespace(id="record-1", context_id=context_id, form_key="basic.demographics")]


class FakeExtractionDocumentRepository:
    async def get_visible_by_id(self, document_id):
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
        return self.job if self.job.id == job_id else None

    async def save(self, job):
        self.saved.append(SimpleNamespace(**job.__dict__))
        return job


class FakeExtractionRunRepository:
    def __init__(self):
        self.runs = []
        self.saved = []

    async def list_by_job(self, job_id):
        return self.runs

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
    )

    processed_job = await service.process_existing_job("job-1")

    assert processed_job.status == "completed", processed_job.error_message
    assert processed_job.progress == 100
    assert len(service.run_repository.runs) == 1
    assert service.run_repository.runs[0].input_snapshot_json["worker"] is True
    assert len(value_service.events) == 1


class FakeMissingDocumentRepository:
    async def get_visible_by_id(self, document_id):
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
    )

    processed_job = await service.process_existing_job("job-1")

    assert processed_job.status == "failed"
    assert processed_job.error_message == "Document not found"
    assert service.run_repository.runs[0].status == "failed"
    assert service.run_repository.runs[0].error_message == "Document not found"

@pytest.mark.asyncio
async def test_extraction_service_retry_marks_failed_and_creates_new_run():
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
    )

    processed_job = await service.retry_job("job-1")

    assert processed_job.status == "failed"
    assert processed_job.error_message == "Document not found"
    assert len(run_repository.runs) == 2
    assert run_repository.runs[1].run_no == 2
    assert run_repository.runs[1].status == "failed"


@pytest.mark.asyncio
async def test_extraction_service_rejects_failed_job_without_retry():
    job = SimpleNamespace(id="job-1", status="failed")
    service = ExtractionService(job_repository=FakeExtractionJobRepository(job))

    with pytest.raises(ExtractionConflictError):
        await service.process_existing_job("job-1")

class FakeDocumentRepository:
    def __init__(self, document):
        self.document = document

    async def get_visible_by_id(self, document_id):
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

    def extract(self, *, text, fields, document_id, document=None):
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
                        "properties": {"name": {"type": "string", "x-display-name": "诊断"}},
                    },
                }
            }
        }
    }


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
async def test_targeted_schema_extraction_filters_field_paths():
    job = SimpleNamespace(
        id="job-1",
        job_type="targeted_schema",
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
        input_json={"field_paths": ["basic.diagnosis.name"]},
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
    service = ExtractionService(
        job_repository=FakeExtractionJobRepository(job),
        run_repository=FakeExtractionRunRepository(),
        record_repository=FakeExtractionRecordRepository(),
        document_repository=FakeDocumentRepository(document),
        ehr_service=FakeEhrServiceForExtraction(context=context, schema_json=project_schema_json()),
        value_service=FakeExtractionValueService(),
        llm_ehr_extractor=extractor,
    )

    processed_job = await service.process_existing_job("job-1")

    assert processed_job.status == "completed", processed_job.error_message
    assert [field.field_path for field in extractor.calls[0]["fields"]] == ["basic.diagnosis.name"]


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
    )

    jobs = await service.create_planned_jobs(
        requested_by="user-1",
        job_type="project_crf",
        document_id="document-1",
        patient_id="patient-1",
        project_id="project-1",
        project_patient_id="project-patient-1",
        context_id="context-1",
    )

    assert len(jobs) == 1
    assert jobs[0].target_form_key == "basic.demographics"
    assert jobs[0].status == "completed"
    assert jobs[0].input_json["planned_reason"] == "document metadata matched primary source: 病案首页"
    assert [field.field_path for field in extractor.calls[0]["fields"]] == ["basic.demographics.gender"]


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
    )

    jobs = await service.create_planned_jobs(
        requested_by="user-1",
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
    assert [field.field_path for field in extractor.calls[0]["fields"]] == ["basic.diagnosis.name"]

class FakePatientEhrServiceForFolderUpdate:
    def __init__(self, *, context, schema_json):
        self.context_repository = FakeContextRepositoryForExtraction(context)
        self.schema_service = FakeSchemaServiceForExtraction(schema_json)
        self.context = context
        self.schema_json = schema_json

    async def get_patient_ehr(self, patient_id, created_by=None):
        return {"context": self.context, "schema": self.schema_json, "records": [], "current_values": {}}


class FakePatientDocumentsRepository:
    def __init__(self, documents):
        self.documents = documents

    async def list_by_patient(self, patient_id, *, limit=100):
        return [document for document in self.documents if document.patient_id == patient_id]

    async def get_visible_by_id(self, document_id):
        return next((document for document in self.documents if document.id == document_id), None)


class FakeExtractionJobRepositoryWithExisting(FakeExtractionJobRepository):
    def __init__(self, existing_jobs=None):
        super().__init__()
        self.existing_jobs = existing_jobs or []

    async def list_by_patient_documents(self, *, patient_id, document_ids):
        return [job for job in self.existing_jobs if job.patient_id == patient_id and job.document_id in document_ids]


async def noop_commit_pending_jobs_before_enqueue():
    return None


def disable_extraction_enqueue(service):
    service._enqueue_extraction_task = lambda job_id: None
    service._commit_pending_jobs_before_enqueue = noop_commit_pending_jobs_before_enqueue
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
        ehr_service=FakePatientEhrServiceForFolderUpdate(context=context, schema_json=project_schema_json()),
        value_service=FakeExtractionValueService(),
        llm_ehr_extractor=FakeSchemaExtractor(),
    ))

    result = await service.update_patient_ehr_folder(patient_id="patient-1", requested_by="user-1")

    assert result["created_jobs"] == 0
    assert result["already_extracted_documents"] == 1

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
    def extract(self, *, text, fields, document_id, document=None):
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
