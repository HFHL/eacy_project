from .common import *
from .extraction_job_fakes import *
from .schema_extraction_fakes import *
from .folder_update_fakes import *

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
