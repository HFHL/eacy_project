from .common import *
from .extraction_job_fakes import *
from .folder_update_fakes import *
from .schema_extraction_fakes import *

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
