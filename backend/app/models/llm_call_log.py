import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, JSON, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base


class LLMCallLog(Base):
    """Persistent log for every LLM HTTP call.

    Captures system/user prompts, raw response, parsed JSON, token usage, latency
    and a normalized status (success/failed/timeout/cancelled). Joins back to
    extraction_jobs / extraction_runs / documents so the admin UI can show full
    I/O per task and per document.
    """

    __tablename__ = "llm_call_logs"
    __table_args__ = (
        Index("idx_llm_call_logs_job", "job_id", "started_at"),
        Index("idx_llm_call_logs_run", "run_id"),
        Index("idx_llm_call_logs_status", "status", "started_at"),
        Index("idx_llm_call_logs_document", "document_id"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))

    # Stable id surfaced to the admin UI (decoupled from row id so retries keep their slot)
    call_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, default=lambda: str(uuid.uuid4()))

    # Linkage (all nullable so non-extraction callers like metadata_agent can still log)
    job_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("extraction_jobs.id"))
    run_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("extraction_runs.id"))
    document_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("documents.id"))
    project_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("research_projects.id"))
    requested_by: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))

    # Call metadata
    purpose: Mapped[str | None] = mapped_column(String(32))      # extract / metadata / repair / classify
    node_name: Mapped[str | None] = mapped_column(String(64))    # langgraph node, e.g. "call_llm"
    provider: Mapped[str | None] = mapped_column(String(32))     # openai / anthropic / local
    model_name: Mapped[str | None] = mapped_column(String(128))
    prompt_version: Mapped[str | None] = mapped_column(String(64))

    # I/O payloads
    system_prompt: Mapped[str | None] = mapped_column(Text)
    user_prompt: Mapped[str | None] = mapped_column(Text)
    raw_response: Mapped[str | None] = mapped_column(Text)
    parsed_response: Mapped[dict[str, Any] | None] = mapped_column(JSON)

    # Usage / performance
    prompt_tokens: Mapped[int | None] = mapped_column(Integer)
    completion_tokens: Mapped[int | None] = mapped_column(Integer)
    total_tokens: Mapped[int | None] = mapped_column(Integer)
    elapsed_ms: Mapped[int | None] = mapped_column(Integer)
    http_status: Mapped[int | None] = mapped_column(Integer)

    # Status
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="success")
    # success | failed | timeout | cancelled
    error_type: Mapped[str | None] = mapped_column(String(64))
    # llm_timeout / llm_http / parse_error / connection_error / unknown
    error_message: Mapped[str | None] = mapped_column(Text)
    retry_no: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)
