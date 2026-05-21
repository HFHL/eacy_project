from celery import Celery
from celery.schedules import crontab

from core.config import config


OCR_QUEUE = "ocr"
METADATA_QUEUE = "metadata"
EXTRACTION_QUEUE = "extraction"
MAINTENANCE_QUEUE = "maintenance"

OCR_TASK_NAME = "eacy.ocr.process_document_ocr"
METADATA_TASK_NAME = "eacy.metadata.extract_document_metadata"
EXTRACTION_TASK_NAME = "eacy.extraction.process_extraction_job"
ABANDON_STALE_PENDING_TASK_NAME = "eacy.maintenance.abandon_stale_pending_extraction_jobs"


celery_app = Celery(
    "eacy_worker",
    broker=config.CELERY_BROKER_URL,
    backend=config.CELERY_BACKEND_URL,
    include=[
        "app.workers.ocr_tasks",
        "app.workers.metadata_tasks",
        "app.workers.extraction_tasks",
        "app.workers.maintenance_tasks",
    ],
)

celery_app.conf.update(
    accept_content=["json"],
    result_serializer="json",
    task_always_eager=config.CELERY_TASK_ALWAYS_EAGER,
    task_routes={
        OCR_TASK_NAME: {"queue": OCR_QUEUE},
        METADATA_TASK_NAME: {"queue": METADATA_QUEUE},
        EXTRACTION_TASK_NAME: {"queue": EXTRACTION_QUEUE},
        ABANDON_STALE_PENDING_TASK_NAME: {"queue": MAINTENANCE_QUEUE},
    },
    task_serializer="json",
    task_track_started=True,
    timezone="Asia/Shanghai",
)

if config.STALE_PENDING_ABANDON_ENABLED:
    celery_app.conf.beat_schedule = {
        "abandon-stale-pending-extraction-jobs": {
            "task": ABANDON_STALE_PENDING_TASK_NAME,
            "schedule": crontab(
                hour=config.STALE_PENDING_ABANDON_CRON_HOUR,
                minute=config.STALE_PENDING_ABANDON_CRON_MINUTE,
            ),
            "kwargs": {"older_than_hours": config.STALE_PENDING_ABANDON_HOURS},
        },
    }
