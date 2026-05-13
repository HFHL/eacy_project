import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, JSON, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base
from core.db.mixins.timestamp_mixin import TimestampMixin


class ExtractionJob(TimestampMixin, Base):
    __tablename__ = "extraction_jobs"
    __table_args__ = (
        Index("idx_jobs_status", "status"),
        Index("idx_jobs_type", "job_type"),
        Index("idx_jobs_document", "document_id"),
        Index("idx_jobs_document_type_status", "document_id", "job_type", "status"),
        Index("idx_jobs_context", "context_id"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_type: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    priority: Mapped[int | None] = mapped_column(Integer, default=0)
    patient_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("patients.id"))
    document_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("documents.id"))
    project_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("research_projects.id"))
    project_patient_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("project_patients.id"))
    context_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("data_contexts.id"))
    schema_version_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("schema_template_versions.id"))
    target_form_key: Mapped[str | None] = mapped_column(String(100))
    input_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    progress: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(Text)
    requested_by: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)
