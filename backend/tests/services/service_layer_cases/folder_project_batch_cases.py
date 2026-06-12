from .common import *
from .extraction_job_fakes import *
from .schema_extraction_fakes import *
from .folder_update_fakes import *

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
