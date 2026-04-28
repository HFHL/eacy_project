from app.workers.celery_app import EXTRACTION_TASK_NAME, celery_app
from app.workers.task_placeholders import not_implemented_payload


@celery_app.task(name=EXTRACTION_TASK_NAME)
def process_extraction_job(job_id: str) -> dict[str, str]:
    return not_implemented_payload(task=EXTRACTION_TASK_NAME, job_id=job_id)
