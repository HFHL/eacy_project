from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.models import ExtractionJob, ExtractionRun

try:  # pragma: no cover - optional dependency guard
    import httpx
    from sqlalchemy.exc import DBAPIError, DisconnectionError, InterfaceError, OperationalError
except Exception:  # pragma: no cover
    httpx = None
    DBAPIError = DisconnectionError = InterfaceError = OperationalError = None


@dataclass(frozen=True)
class FolderUpdateOptions:
    target_form_keys: list[str] | None = None
    mode: str = "incremental"


@dataclass
class SharedDocumentExtractionState:
    job: ExtractionJob
    run: ExtractionRun
    field_specs: list[dict[str, Any]]


TRANSIENT_EXTRACTION_ERRORS = tuple(
    error_type
    for error_type in (
        getattr(httpx, "TimeoutException", None),
        getattr(httpx, "TransportError", None),
        OperationalError,
        DisconnectionError,
        InterfaceError,
        DBAPIError,
    )
    if isinstance(error_type, type)
)

_TRANSIENT_DB_ORIG_EXCEPTIONS = (
    "ConnectionDoesNotExistError",
    "ConnectionResetError",
    "BrokenPipeError",
    "ConnectionRefusedError",
)


class MockExtractor:
    def extract(self, *, job: ExtractionJob) -> dict[str, Any]:
        fields = []
        for field in (job.input_json or {}).get("mock_fields", []):
            if "field_path" in field:
                fields.append(field)

        if not fields:
            fields.append(
                {
                    "field_key": "extraction_summary",
                    "field_path": "mock.extraction.summary",
                    "field_title": "Mock extraction summary",
                    "value_type": "text",
                    "value_text": "Mock extracted value",
                    "confidence": 0.99,
                    "quote_text": "Mock extracted value",
                }
            )

        return {
            "extractor": "MockExtractor",
            "job_id": job.id,
            "fields": fields,
        }
