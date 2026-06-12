from .common import *
from .extraction_job_fakes import *
from .schema_extraction_fakes import *
from .folder_update_fakes import *

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
