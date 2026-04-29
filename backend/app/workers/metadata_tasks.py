import asyncio
import uuid

from app.services.document_metadata_service import DocumentMetadataService
from app.workers.async_db import reset_worker_db_connections
from app.workers.celery_app import METADATA_TASK_NAME, celery_app
from core.db.session import reset_session_context, session, set_session_context


@celery_app.task(name=METADATA_TASK_NAME)
def extract_document_metadata(document_id: str) -> dict[str, str | None]:
    async def _run() -> dict[str, str | None]:
        token = set_session_context(str(uuid.uuid4()))
        try:
            await reset_worker_db_connections()
            document = await DocumentMetadataService().process_document_metadata(document_id)
            return {
                "task": METADATA_TASK_NAME,
                "document_id": document.id,
                "meta_status": document.meta_status,
                "doc_type": document.doc_type,
                "doc_subtype": document.doc_subtype,
            }
        finally:
            await session.remove()
            await reset_worker_db_connections()
            reset_session_context(token)

    return asyncio.run(_run())
