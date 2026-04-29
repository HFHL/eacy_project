from app.workers.celery_app import (
    EXTRACTION_QUEUE,
    EXTRACTION_TASK_NAME,
    METADATA_QUEUE,
    METADATA_TASK_NAME,
    OCR_QUEUE,
    OCR_TASK_NAME,
    celery_app,
)


def test_celery_app_registers_worker_tasks():
    celery_app.loader.import_default_modules()

    assert OCR_TASK_NAME in celery_app.tasks
    assert METADATA_TASK_NAME in celery_app.tasks
    assert EXTRACTION_TASK_NAME in celery_app.tasks


def test_celery_task_routes_are_declared():
    routes = celery_app.conf.task_routes

    assert routes[OCR_TASK_NAME]["queue"] == OCR_QUEUE
    assert routes[METADATA_TASK_NAME]["queue"] == METADATA_QUEUE
    assert routes[EXTRACTION_TASK_NAME]["queue"] == EXTRACTION_QUEUE


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
