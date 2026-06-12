from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from types import SimpleNamespace
from typing import Any

from sqlalchemy import text

from app.models import DataContext, Document, ExtractionJob, ExtractionRun, RecordInstance
from app.services import extraction_service_runtime
from app.services.evidence_location_resolver import (
    build_ocr_reading_units,
    evidence_location_is_trusted,
    flatten_reading_unit_corpus,
    resolve_evidence_locations,
)
from app.services.extraction_errors import (
    ExtractionCancelledError,
    ExtractionConflictError,
    ExtractionNotFoundError,
    ExtractionTargetValidationError,
)
from app.services.extraction_plan_trace import build_folder_plan_json, build_single_job_plan_json, document_trace_terms
from app.services.extraction_strategy import extraction_queue_for_job, job_uses_claude_code, with_default_extraction_strategy
from app.services.extraction_types import (
    TRANSIENT_EXTRACTION_ERRORS,
    FolderUpdateOptions,
    SharedDocumentExtractionState,
    _TRANSIENT_DB_ORIG_EXCEPTIONS,
)
from app.services.llm_call_logger import ERROR_TIMEOUT, classify_exception, flush_llm_call_logs
from app.services.record_instance_label import record_instance_label
from app.services.record_instance_merge import RecordInstanceMergeResolver
from app.services.schema_field_planner import plan_schema_fields
from core.config import config
from core.db import Transactional, session


class ExtractionAccessMixin:
    def _normalize_folder_update_mode(self, mode: str | None) -> str:
        normalized = str(mode or "incremental").strip().lower()
        return normalized if normalized in {"incremental", "full"} else "incremental"

    async def _ensure_document_access(self, document_id: str, requested_by: str | None, *, project_scope: bool = False) -> Document:
        document = await self.document_repository.get_visible_by_id(
            document_id,
            uploaded_by=None if project_scope else requested_by,
        )
        if document is None:
            raise ExtractionNotFoundError("Document not found")
        return document

    async def _ensure_patient_access(self, patient_id: str, requested_by: str | None) -> None:
        patient = await self.ehr_service.patient_repository.get_active_by_id(
            patient_id,
            owner_id=requested_by,
        )
        if patient is None:
            raise ExtractionNotFoundError("Patient not found")

    async def _ensure_project_access(self, project_id: str, requested_by: str | None) -> None:
        from app.services.research_project_service import ResearchProjectService

        project = await ResearchProjectService().get_project(project_id, owner_id=requested_by)
        if project is None:
            raise ExtractionNotFoundError("Research project not found")

    async def _ensure_context_access(self, context_id: str, requested_by: str | None) -> DataContext:
        context = await self.ehr_service.context_repository.get_by_id(context_id)
        if context is None:
            raise ExtractionNotFoundError("Data context not found")
        if requested_by is None:
            return context
        if context.project_id is not None:
            await self._ensure_project_access(context.project_id, requested_by)
        elif context.patient_id is not None:
            await self._ensure_patient_access(context.patient_id, requested_by)
        else:
            raise ExtractionNotFoundError("Data context not found")
        return context

    async def _ensure_scope_access(self, params: dict[str, Any], requested_by: str | None) -> None:
        if requested_by is None:
            return
        document_id = params.get("document_id")
        patient_id = params.get("patient_id")
        project_id = params.get("project_id")
        context_id = params.get("context_id")
        if project_id is not None:
            await self._ensure_project_access(project_id, requested_by)
        if document_id is not None:
            await self._ensure_document_access(document_id, requested_by, project_scope=project_id is not None)
        if patient_id is not None:
            await self._ensure_patient_access(patient_id, requested_by)
        if context_id is not None:
            await self._ensure_context_access(context_id, requested_by)

    def _document_uploaded_by_for_job(self, job: ExtractionJob) -> str | None:
        if getattr(job, "project_id", None) is not None:
            return None
        return getattr(job, "requested_by", None)

    async def _job_visible_to(self, job: ExtractionJob, requested_by: str | None) -> bool:
        if requested_by is None:
            return True
        if str(getattr(job, "requested_by", "") or "") == str(requested_by):
            return True
        if job.document_id is not None:
            document = await self.document_repository.get_visible_by_id(
                job.document_id,
                uploaded_by=requested_by,
            )
            if document is not None:
                return True
        if job.patient_id is not None:
            patient = await self.ehr_service.patient_repository.get_active_by_id(
                job.patient_id,
                owner_id=requested_by,
            )
            if patient is not None:
                return True
        if job.project_id is not None:
            from app.services.research_project_service import ResearchProjectService

            project = await ResearchProjectService().get_project(job.project_id, owner_id=requested_by)
            if project is not None:
                return True
        return False
