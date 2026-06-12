from .common import *
from .extraction_job_fakes import *
from .folder_update_fakes import *
from .schema_extraction_fakes import *

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
