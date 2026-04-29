import asyncio
import uuid

from app.services.document_service import DocumentService
from app.workers.async_db import reset_worker_db_connections
from app.workers.celery_app import OCR_TASK_NAME, celery_app
from core.db.session import reset_session_context, session, set_session_context


@celery_app.task(name=OCR_TASK_NAME)
def process_document_ocr(document_id: str) -> dict[str, str | None]:
    async def _run() -> dict[str, str | None]:
        token = set_session_context(str(uuid.uuid4()))
        try:
            await reset_worker_db_connections()
            document = await DocumentService().process_document_ocr(document_id)
            return {
                "task": OCR_TASK_NAME,
                "document_id": document.id,
                "ocr_status": document.ocr_status,
                "status": document.status,
            }
        finally:
            await session.remove()
            await reset_worker_db_connections()
            reset_session_context(token)

    return asyncio.run(_run())
