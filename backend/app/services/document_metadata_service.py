from datetime import datetime
from typing import Any

from fastapi import HTTPException, status

from app.models import Document
from app.repositories import DocumentRepository
from app.services.document_service import DocumentService
from app.services.metadata_agent import MetadataExtractionAgent
from app.services.metadata_normalizer import METADATA_SCHEMA_VERSION, MetadataNormalizer, empty_metadata_result
from app.services.metadata_prompt_builder import MetadataPromptBuilder
from core.db import session


class DocumentMetadataService:
    def __init__(
        self,
        document_repository: DocumentRepository | None = None,
        prompt_builder: MetadataPromptBuilder | None = None,
        agent: MetadataExtractionAgent | None = None,
        normalizer: MetadataNormalizer | None = None,
    ):
        self.document_repository = document_repository or DocumentRepository()
        self.prompt_builder = prompt_builder or MetadataPromptBuilder()
        self.agent = agent or MetadataExtractionAgent(prompt_builder=self.prompt_builder)
        self.normalizer = normalizer or MetadataNormalizer()

    async def queue_document_metadata(self, document_id: str) -> Document:
        try:
            document = await self.document_repository.get_visible_by_id(document_id)
            if document is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
            if document.meta_status == "running":
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Document metadata is already running")

            document.meta_status = "queued"
            document.updated_at = datetime.utcnow()
            document = await self.document_repository.save(document)
            await session.commit()
        except Exception:
            await session.rollback()
            raise

        self._enqueue_metadata_task(document.id)
        return document

    async def process_document_metadata(self, document_id: str) -> Document:
        document = await self.document_repository.get_visible_by_id(document_id)
        if document is None:
            raise ValueError("Document not found")

        if not self._has_extractable_text(document):
            return await self._mark_skipped(document, "OCR text is empty or not completed")

        document.meta_status = "running"
        document.updated_at = datetime.utcnow()
        await self.document_repository.save(document)
        await session.commit()

        try:
            agent_input = self.prompt_builder.build_input(document)
            agent_output = self.agent.extract(agent_input)
            normalized_result = self.normalizer.normalize(agent_output)
            updates = self.normalizer.to_document_update(normalized_result)
            if isinstance(agent_output, dict) and agent_output.get("_llm_error"):
                updates["metadata_json"]["llm_error"] = agent_output["_llm_error"]
            for key, value in updates.items():
                setattr(document, key, value)
            document.meta_status = "completed"
            document.updated_at = datetime.utcnow()
            document = await self.document_repository.save(document)
            await session.commit()
            await DocumentService().enqueue_ready_extraction_jobs(document.id)
            return document
        except Exception as exc:
            await session.rollback()
            return await self._mark_failed(document_id, exc)

    def _enqueue_metadata_task(self, document_id: str) -> None:
        from app.workers.celery_app import METADATA_QUEUE, METADATA_TASK_NAME, celery_app

        celery_app.send_task(
            METADATA_TASK_NAME,
            args=[document_id],
            queue=METADATA_QUEUE,
            routing_key=METADATA_QUEUE,
        )

    def _has_extractable_text(self, document: Document) -> bool:
        return bool((document.ocr_text or "").strip()) and document.ocr_status == "completed"

    async def _mark_skipped(self, document: Document, reason: str) -> Document:
        document.meta_status = "skipped"
        document.metadata_json = self._failure_metadata(reason=reason)
        document.updated_at = datetime.utcnow()
        document = await self.document_repository.save(document)
        await session.commit()
        return document

    async def _mark_failed(self, document_id: str, exc: Exception) -> Document:
        document = await self.document_repository.get_visible_by_id(document_id)
        if document is None:
            raise exc
        previous_result = self._previous_result(document.metadata_json)
        document.meta_status = "failed"
        document.metadata_json = {
            "schema_version": METADATA_SCHEMA_VERSION,
            "result": previous_result,
            "error": {"type": exc.__class__.__name__, "message": str(exc)},
        }
        document.updated_at = datetime.utcnow()
        document = await self.document_repository.save(document)
        await session.commit()
        return document

    def _failure_metadata(self, *, reason: str) -> dict[str, Any]:
        return {
            "schema_version": METADATA_SCHEMA_VERSION,
            "result": empty_metadata_result(),
            "error": {"type": "Skipped", "message": reason},
        }

    def _previous_result(self, metadata_json: Any) -> dict[str, Any]:
        if isinstance(metadata_json, dict) and isinstance(metadata_json.get("result"), dict):
            return self.normalizer.normalize({"result": metadata_json["result"]})
        return empty_metadata_result()
