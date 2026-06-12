import time

from .common import *
from .extraction_job_fakes import *
from .folder_update_fakes import *
from .schema_extraction_fakes import *

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
async def test_llm_ehr_extract_heartbeat_runs_while_sync_extractor_is_in_thread():
    class SlowExtractor:
        def extract(self, **_kwargs):
            time.sleep(0.03)
            return {"validation_status": "valid_empty", "fields": []}

    class CapturingTaskProgress(FakeTaskProgressService):
        def __init__(self):
            super().__init__()
            self.progress_calls = []

        async def update_job_progress(self, job_or_id, **kwargs):
            self.progress_calls.append({"job_or_id": job_or_id, **kwargs})

    progress_service = CapturingTaskProgress()
    service = ExtractionService(
        llm_ehr_extractor=SlowExtractor(),
        task_progress_service=progress_service,
    )

    output = await service._run_llm_ehr_extract_with_heartbeat(
        job=SimpleNamespace(id="job-1"),
        text="性别：男",
        fields=[],
        document_id="document-1",
        document=SimpleNamespace(id="document-1"),
        llm_call_buffer=[],
        llm_call_context={"run_id": "run-1"},
        heartbeat_interval_seconds=0.001,
    )

    assert output["validation_status"] == "valid_empty"
    assert progress_service.progress_calls
    assert progress_service.progress_calls[0]["job_or_id"] == "job-1"
    assert progress_service.progress_calls[0]["event_type"] == "heartbeat"


@pytest.mark.asyncio
async def test_llm_ehr_extract_persists_successful_batches_and_discards_failed_batch():
    class BatchExtractor:
        def extract_batches(self, **_kwargs):
            yield {
                "fields": [{"field_path": "basic.demographics.gender", "value_type": "text", "value_text": "男"}],
                "validation_status": "valid",
                "validation_log": [],
                "validation_warnings": [],
                "attempt_count": 1,
                "batch_index": 0,
                "batch_count": 3,
                "batch_field_count": 1,
                "batch_status": "succeeded",
            }
            yield {
                "fields": [],
                "validation_status": "invalid",
                "validation_log": [],
                "validation_warnings": [],
                "attempt_count": 0,
                "batch_index": 1,
                "batch_count": 3,
                "batch_field_count": 1,
                "batch_status": "failed",
                "error_message": "bad evidence",
            }
            yield {
                "fields": [{"field_path": "basic.demographics.age", "value_type": "number", "value_number": 68}],
                "validation_status": "valid",
                "validation_log": [],
                "validation_warnings": [],
                "attempt_count": 1,
                "batch_index": 2,
                "batch_count": 3,
                "batch_field_count": 1,
                "batch_status": "succeeded",
            }

        def _merge_batch_results(self, *, batch_results, document_id, incrementally_persisted):
            return {
                "document_id": document_id,
                "fields": [field for batch in batch_results for field in (batch.get("fields") or [])],
                "validation_status": "valid",
                "validation_log": [],
                "validation_warnings": [],
                "attempt_count": 1,
                "incrementally_persisted": incrementally_persisted,
            }

    class CapturingTaskProgress(FakeTaskProgressService):
        def __init__(self):
            super().__init__()
            self.progress_calls = []

        async def update_job_progress(self, job_or_id, **kwargs):
            self.progress_calls.append({"job_or_id": job_or_id, **kwargs})

    progress_service = CapturingTaskProgress()
    service = ExtractionService(
        llm_ehr_extractor=BatchExtractor(),
        task_progress_service=progress_service,
    )
    persisted_batches = []

    async def fake_persist_incremental(**kwargs):
        persisted_batches.append(kwargs["batch_output"])
        return len(kwargs["batch_output"].get("fields") or [])

    service._persist_incremental_job_output = fake_persist_incremental

    output = await service._run_llm_ehr_extract_with_heartbeat(
        job=SimpleNamespace(id="job-1"),
        run=SimpleNamespace(id="run-1"),
        text="性别：男。年龄：68",
        fields=[SimpleNamespace(field_path="a"), SimpleNamespace(field_path="b")],
        document_id="document-1",
        document=SimpleNamespace(id="document-1"),
        llm_call_buffer=[],
        llm_call_context={"run_id": "run-1"},
        heartbeat_interval_seconds=60,
    )

    assert output["incrementally_persisted"] is True
    assert [batch["batch_index"] for batch in persisted_batches] == [0, 2]
    assert any(call["event_type"] == "batch_discarded" for call in progress_service.progress_calls)


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
