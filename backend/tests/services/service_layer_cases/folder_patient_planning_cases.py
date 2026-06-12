from .common import *
from .extraction_job_fakes import *
from .schema_extraction_fakes import *
from .folder_update_fakes import *

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
    assert result["jobs"][0].input_json["async_task_batch_id"] == "batch-1"
    assert result["jobs"][0].input_json["async_task_type"] == "patient_ehr_targeted_extract"
    assert service.task_progress_service.items[0].extraction_job_id == result["jobs"][0].id
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
