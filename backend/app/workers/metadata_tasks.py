from app.workers.celery_app import METADATA_TASK_NAME, celery_app
from app.workers.task_placeholders import not_implemented_payload


@celery_app.task(name=METADATA_TASK_NAME)
def extract_document_metadata(document_id: str) -> dict[str, str]:
    return not_implemented_payload(task=METADATA_TASK_NAME, document_id=document_id)
