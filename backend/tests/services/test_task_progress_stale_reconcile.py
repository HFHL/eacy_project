"""Stale queued/running task items should not block batch aggregation forever."""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.task_progress_service import ITEM_STALE_MESSAGE, TaskProgressService


@pytest.mark.asyncio
async def test_reconcile_stale_running_items_marks_failed():
    stale_time = datetime.utcnow() - timedelta(minutes=20)
    stale_item = MagicMock()
    stale_item.status = "running"
    stale_item.progress = 45
    stale_item.heartbeat_at = stale_time
    stale_item.updated_at = stale_time
    stale_item.started_at = stale_time
    stale_item.finished_at = None
    stale_item.error_message = None
    stale_item.message = "running"
    stale_item.stage = "extracting"
    stale_item.extraction_job_id = None

    item_repo = AsyncMock()
    item_repo.save = AsyncMock()
    service = TaskProgressService(item_repository=item_repo, batch_repository=AsyncMock(), event_repository=AsyncMock())

    with patch("app.services.task_progress_service.session.flush", new_callable=AsyncMock):
        await service._reconcile_stale_items([stale_item])

    assert stale_item.status == "failed"
    assert stale_item.error_message == ITEM_STALE_MESSAGE
    item_repo.save.assert_awaited()


@pytest.mark.asyncio
async def test_reconcile_keeps_waiting_scheduler_items_with_pending_job_active():
    stale_time = datetime.utcnow() - timedelta(minutes=20)
    waiting_item = MagicMock()
    waiting_item.status = "queued"
    waiting_item.progress = 0
    waiting_item.heartbeat_at = stale_time
    waiting_item.updated_at = stale_time
    waiting_item.started_at = None
    waiting_item.finished_at = None
    waiting_item.error_message = None
    waiting_item.message = "waiting"
    waiting_item.stage = "waiting_scheduler"
    waiting_item.extraction_job_id = "job-1"

    item_repo = AsyncMock()
    item_repo.save = AsyncMock()
    service = TaskProgressService(item_repository=item_repo, batch_repository=AsyncMock(), event_repository=AsyncMock())

    with (
        patch("app.services.task_progress_service.session.get", new_callable=AsyncMock) as get_job,
        patch("app.services.task_progress_service.session.flush", new_callable=AsyncMock) as flush,
    ):
        get_job.return_value = MagicMock(status="pending")
        await service._reconcile_stale_items([waiting_item])

    assert waiting_item.status == "queued"
    assert waiting_item.error_message is None
    item_repo.save.assert_not_awaited()
    flush.assert_not_awaited()


@pytest.mark.asyncio
async def test_update_job_progress_recovers_missing_item_from_job_input():
    job = MagicMock()
    job.id = "job-1"
    job.job_type = "targeted_schema"
    job.progress = 0
    job.input_json = {
        "async_task_batch_id": "batch-1",
        "async_task_type": "patient_ehr_targeted_extract",
    }
    job.document_id = "doc-1"
    job.patient_id = "patient-1"
    job.project_id = None
    job.project_patient_id = None
    job.context_id = "context-1"
    job.target_form_key = "basic.demographics"

    item = MagicMock()
    item.id = "item-1"
    item.batch_id = "batch-1"
    item.task_type = "patient_ehr_targeted_extract"
    item.status = "created"
    item.progress = 0
    item.stage = "created"
    item.stage_label = "已创建任务"
    item.message = None
    item.error_message = None
    item.started_at = None
    item.finished_at = None
    item.extraction_job_id = "job-1"
    item.document_id = "doc-1"
    item.patient_id = "patient-1"
    item.project_id = None
    item.project_patient_id = None
    item.context_id = "context-1"
    item.target_form_key = "basic.demographics"
    item.extraction_run_id = None
    item.current_step = None
    item.total_steps = 6

    item_repo = AsyncMock()
    item_repo.get_by_extraction_job = AsyncMock(side_effect=[None, None])
    item_repo.create = AsyncMock(return_value=item)
    item_repo.save = AsyncMock(return_value=item)
    event_repo = AsyncMock()
    event_repo.create = AsyncMock(return_value=MagicMock(id="event-1"))
    service = TaskProgressService(item_repository=item_repo, batch_repository=AsyncMock(), event_repository=event_repo)
    service.aggregate_batch = AsyncMock()

    with (
        patch("app.services.task_progress_service.session.get", new_callable=AsyncMock) as get_job,
        patch("app.services.task_progress_service.session.commit", new_callable=AsyncMock) as commit,
    ):
        get_job.return_value = job
        await service.update_job_progress(
            "job-1",
            status="running",
            progress=45,
            stage="call_extractor",
            stage_label="AI 抽取中",
            commit=True,
        )

    item_repo.create.assert_awaited()
    assert item.status == "running"
    assert item.progress == 45
    assert item.stage == "call_extractor"
    assert item.started_at is not None
    commit.assert_awaited_once()
