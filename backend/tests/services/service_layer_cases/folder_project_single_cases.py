from .common import *
from .extraction_job_fakes import *
from .schema_extraction_fakes import *
from .folder_update_fakes import *

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
