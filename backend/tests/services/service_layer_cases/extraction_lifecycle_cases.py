from .common import *
from .extraction_job_fakes import *
from .folder_update_fakes import *

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
        task_progress_service=FakeTaskProgressService(),
    )

    processed_job = await service.process_existing_job("job-1")

    assert processed_job.status == "completed", processed_job.error_message
    assert processed_job.progress == 100
    assert len(service.run_repository.runs) == 1
    assert service.run_repository.runs[0].input_snapshot_json["worker"] is True
    assert len(value_service.events) == 1


class FakeMissingDocumentRepository:
    async def get_visible_by_id(self, document_id, **_kwargs):
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
        task_progress_service=FakeTaskProgressService(),
    )

    processed_job = await service.process_existing_job("job-1")

    assert processed_job.status == "failed"
    assert processed_job.error_message == "Document not found"
    assert service.run_repository.runs[0].status == "failed"
    assert service.run_repository.runs[0].error_message == "Document not found"

@pytest.mark.asyncio
async def test_extraction_service_retry_returns_failed_job_to_scheduler():
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
        task_progress_service=FakeTaskProgressService(),
    )
    async def fake_commit_pending_jobs():
        return None

    service._commit_pending_jobs_before_enqueue = fake_commit_pending_jobs

    processed_job = await service.retry_job("job-1")

    assert processed_job.status == "pending"
    assert processed_job.progress == 0
    assert processed_job.error_message is None
    assert len(run_repository.runs) == 1


def test_extraction_scheduler_limits_each_user_before_filling_global_slots():
    service = ExtractionService()
    candidates = [
        SimpleNamespace(id="a-1", requested_by="user-a", project_id="project-1", created_at=1),
        SimpleNamespace(id="a-2", requested_by="user-a", project_id="project-1", created_at=2),
        SimpleNamespace(id="b-1", requested_by="user-b", project_id="project-2", created_at=3),
    ]

    selected = service._choose_jobs_for_fair_dispatch(
        candidates=candidates,
        active_jobs=[],
        global_limit=4,
        user_limit=1,
        project_limit=2,
        max_to_dispatch=4,
    )

    assert [job.id for job in selected] == ["a-1", "b-1"]


def test_extraction_scheduler_skips_user_that_already_has_active_slot():
    service = ExtractionService()
    active_jobs = [SimpleNamespace(id="active-a", requested_by="user-a", project_id="project-1")]
    candidates = [
        SimpleNamespace(id="a-1", requested_by="user-a", project_id="project-1", created_at=1),
        SimpleNamespace(id="b-1", requested_by="user-b", project_id="project-2", created_at=2),
    ]

    selected = service._choose_jobs_for_fair_dispatch(
        candidates=candidates,
        active_jobs=active_jobs,
        global_limit=4,
        user_limit=1,
        project_limit=2,
        max_to_dispatch=4,
    )

    assert [job.id for job in selected] == ["b-1"]


def test_extraction_scheduler_respects_claude_code_queue_capacity_without_blocking_default_queue():
    service = ExtractionService()
    candidates = [
        SimpleNamespace(
            id="claude-a",
            requested_by="user-a",
            project_id="project-1",
            job_type="patient_ehr",
            input_json={"extractor_strategy": "claude_code"},
            created_at=1,
        ),
        SimpleNamespace(
            id="claude-b",
            requested_by="user-b",
            project_id="project-2",
            job_type="patient_ehr",
            input_json={"extractor_strategy": "claude_code"},
            created_at=2,
        ),
        SimpleNamespace(
            id="normal-c",
            requested_by="user-c",
            project_id="project-3",
            job_type="document",
            input_json={},
            created_at=3,
        ),
    ]

    selected = service._choose_jobs_for_fair_dispatch(
        candidates=candidates,
        active_jobs=[],
        global_limit=4,
        user_limit=1,
        project_limit=2,
        max_to_dispatch=4,
        queue_limits={"claude-code": 1, "extraction": 2},
    )

    assert [job.id for job in selected] == ["claude-a", "normal-c"]


class FakeStaleExtractionJobRepository(FakeExtractionJobRepository):
    def __init__(self, jobs=None):
        super().__init__()
        self.jobs = jobs or []
        self.list_stale_pending_calls = []

    async def list_stale_pending(self, **kwargs):
        self.list_stale_pending_calls.append(kwargs)
        return self.jobs


@pytest.mark.asyncio
async def test_abandon_stale_pending_jobs_includes_pending_and_queued_statuses():
    repository = FakeStaleExtractionJobRepository()
    service = ExtractionService(
        job_repository=repository,
        run_repository=FakeExtractionRunRepository(),
        record_repository=FakeExtractionRecordRepository(),
        task_progress_service=FakeTaskProgressService(),
    )

    result = await service.abandon_stale_pending_jobs(dry_run=True)

    assert result["dry_run"] is True
    assert repository.list_stale_pending_calls[0]["statuses"] == ("pending", "queued")


def test_filter_schema_fields_includes_merge_anchor_for_targeted_field():
    schema_json = {
        "properties": {
            "影像检查": {
                "properties": {
                    "CT": {
                        "type": "object",
                        "x-merge-binding": "anchor=检查日期",
                        "properties": {
                            "检查日期": {"type": "string", "format": "date", "x-display-name": "检查日期"},
                            "检查结果": {"type": "string", "x-display-name": "检查结果"},
                        },
                    }
                }
            }
        }
    }
    fields = plan_schema_fields(schema_json)
    job = SimpleNamespace(
        input_json={"field_paths": ["影像检查.CT.检查结果"]},
        target_form_key=None,
    )

    selected = ExtractionService()._filter_schema_fields(fields, job)

    assert [field.field_path for field in selected] == ["影像检查.CT.检查结果", "影像检查.CT.检查日期"]


@pytest.mark.asyncio
async def test_extraction_service_rejects_failed_job_without_retry():
    job = SimpleNamespace(id="job-1", status="failed")
    service = ExtractionService(job_repository=FakeExtractionJobRepository(job))

    with pytest.raises(ExtractionConflictError):
        await service.process_existing_job("job-1")
