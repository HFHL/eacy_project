import asyncio
from pathlib import Path

import pytest

from app.workers.celery_app import (
    ABANDON_STALE_PENDING_TASK_NAME,
    CLAUDE_CODE_QUEUE,
    EXTRACTION_QUEUE,
    EXTRACTION_TASK_NAME,
    MAINTENANCE_QUEUE,
    METADATA_QUEUE,
    METADATA_TASK_NAME,
    OCR_QUEUE,
    OCR_TASK_NAME,
    PROJECT_CRF_FOLDER_BATCH_PLAN_TASK_NAME,
    PROJECT_CRF_FOLDER_PLAN_TASK_NAME,
    SCHEDULE_PENDING_EXTRACTION_TASK_NAME,
    celery_app,
)
from core.config import config


@pytest.fixture(autouse=True)
def restore_event_loop_policy_after_worker_tests():
    yield
    asyncio.set_event_loop_policy(asyncio.DefaultEventLoopPolicy())


def _compose_services() -> dict:
    import yaml

    project_root = Path(__file__).resolve().parents[3]
    compose_path = project_root / "docker-compose.prod.yml"
    return yaml.safe_load(compose_path.read_text(encoding="utf-8"))["services"]


def test_celery_app_registers_worker_tasks():
    celery_app.loader.import_default_modules()

    assert OCR_TASK_NAME in celery_app.tasks
    assert METADATA_TASK_NAME in celery_app.tasks
    assert EXTRACTION_TASK_NAME in celery_app.tasks
    assert ABANDON_STALE_PENDING_TASK_NAME in celery_app.tasks
    assert SCHEDULE_PENDING_EXTRACTION_TASK_NAME in celery_app.tasks
    assert PROJECT_CRF_FOLDER_PLAN_TASK_NAME in celery_app.tasks
    assert PROJECT_CRF_FOLDER_BATCH_PLAN_TASK_NAME in celery_app.tasks


def test_celery_task_routes_are_declared():
    routes = celery_app.conf.task_routes

    assert routes[OCR_TASK_NAME]["queue"] == OCR_QUEUE
    assert routes[METADATA_TASK_NAME]["queue"] == METADATA_QUEUE
    assert routes[EXTRACTION_TASK_NAME]["queue"] == EXTRACTION_QUEUE
    assert CLAUDE_CODE_QUEUE == "claude-code"
    assert routes[ABANDON_STALE_PENDING_TASK_NAME]["queue"] == MAINTENANCE_QUEUE
    assert routes[SCHEDULE_PENDING_EXTRACTION_TASK_NAME]["queue"] == MAINTENANCE_QUEUE
    assert routes[PROJECT_CRF_FOLDER_PLAN_TASK_NAME]["queue"] == MAINTENANCE_QUEUE
    assert routes[PROJECT_CRF_FOLDER_BATCH_PLAN_TASK_NAME]["queue"] == MAINTENANCE_QUEUE


def test_prod_compose_has_dedicated_claude_code_worker():
    services = _compose_services()
    worker = services["worker-claude-code"]
    command = worker["command"]

    assert worker["image"] == "eacy-backend-claude-code:prod"
    assert worker["build"]["args"]["INSTALL_CLAUDE_CODE"] == "true"
    assert worker["build"]["args"]["CLAUDE_CODE_CLI_SOURCE"] == "${CLAUDE_CODE_CLI_SOURCE:-cc-haha}"
    assert "codeload.github.com/NanmiCoder/cc-haha" in worker["build"]["args"]["CC_HAHA_ARCHIVE_URL"]
    assert worker["environment"]["CLAUDE_CODE_BIN"] == "claude-haha"
    assert worker["environment"]["CC_HAHA_SKIP_DOTENV"] == "1"
    assert "ANTHROPIC_BASE_URL" in worker["environment"]
    assert worker["environment"]["HTTP_PROXY"] == "${HTTP_PROXY:-${http_proxy:-}}"
    assert worker["environment"]["NO_PROXY"] == "${NO_PROXY:-${no_proxy:-localhost,127.0.0.1,redis,api,.local}}"
    assert command[command.index("-Q") + 1] == CLAUDE_CODE_QUEUE
    assert "--concurrency=${CLAUDE_CODE_CONCURRENCY:-1}" in command
    assert "${CLAUDE_CODE_CREDENTIALS_DIR:-/root/.claude}:/home/eacy/.claude:ro" in worker["volumes"]


def test_prod_compose_keeps_regular_extraction_worker_on_default_queue():
    services = _compose_services()
    command = services["worker-extraction"]["command"]

    assert command[command.index("-Q") + 1] == EXTRACTION_QUEUE
    assert CLAUDE_CODE_QUEUE not in command


def test_celery_beat_schedule_abandon_stale_pending_when_enabled():
    if not config.STALE_PENDING_ABANDON_ENABLED:
        return
    schedule = celery_app.conf.beat_schedule
    assert "abandon-stale-pending-extraction-jobs" in schedule
    entry = schedule["abandon-stale-pending-extraction-jobs"]
    assert entry["task"] == ABANDON_STALE_PENDING_TASK_NAME
    assert entry["kwargs"]["older_than_hours"] == config.STALE_PENDING_ABANDON_HOURS


def test_celery_beat_schedule_pending_extraction_when_enabled():
    if not config.EXTRACTION_SCHEDULER_ENABLED:
        return
    schedule = celery_app.conf.beat_schedule
    assert "schedule-pending-extraction-jobs" in schedule
    entry = schedule["schedule-pending-extraction-jobs"]
    assert entry["task"] == SCHEDULE_PENDING_EXTRACTION_TASK_NAME
    assert entry["schedule"] == config.EXTRACTION_SCHEDULER_INTERVAL_SECONDS


def test_extraction_worker_processes_existing_job(monkeypatch):
    from types import SimpleNamespace

    from app.workers import extraction_tasks

    class FakeExtractionService:
        async def process_existing_job(self, job_id):
            return SimpleNamespace(
                id=job_id,
                status="completed",
                progress=100,
                error_message=None,
            )

    async def fake_reset_worker_db_connections():
        return None

    class FakeSession:
        async def remove(self):
            return None

    monkeypatch.setattr(extraction_tasks, "ExtractionService", FakeExtractionService)
    monkeypatch.setattr(extraction_tasks, "reset_worker_db_connections", fake_reset_worker_db_connections)
    monkeypatch.setattr(extraction_tasks, "session", FakeSession())

    result = extraction_tasks.process_extraction_job.run("job-1")

    assert result["task"] == EXTRACTION_TASK_NAME
    assert result["job_id"] == "job-1"
    assert result["status"] == "completed"
    assert result["progress"] == 100
