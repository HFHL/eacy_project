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
