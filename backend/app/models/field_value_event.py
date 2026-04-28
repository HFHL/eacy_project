import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import Date, DateTime, ForeignKey, Index, JSON, Numeric, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base


class FieldValueEvent(Base):
    __tablename__ = "field_value_events"
    __table_args__ = (
        Index("idx_field_events_context", "context_id"),
        Index("idx_field_events_instance", "record_instance_id"),
        Index("idx_field_events_field_path", "field_path"),
        Index("idx_field_events_run", "extraction_run_id"),
        Index("idx_field_events_doc", "source_document_id"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    context_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("data_contexts.id"), nullable=False)
    record_instance_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("record_instances.id"), nullable=False)
    field_key: Mapped[str] = mapped_column(String(100), nullable=False)
    field_path: Mapped[str] = mapped_column(String(500), nullable=False)
    field_title: Mapped[str | None] = mapped_column(String(200))
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    value_type: Mapped[str] = mapped_column(String(50), nullable=False)
    value_text: Mapped[str | None] = mapped_column(Text)
    value_number: Mapped[float | None] = mapped_column(Numeric(18, 6))
    value_date: Mapped[date | None] = mapped_column(Date)
    value_datetime: Mapped[datetime | None] = mapped_column(DateTime)
    value_json: Mapped[dict[str, Any] | list[Any] | None] = mapped_column(JSON)
    unit: Mapped[str | None] = mapped_column(String(50))
    normalized_text: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Numeric(5, 4))
    extraction_run_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("extraction_runs.id"))
    source_document_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("documents.id"))
    source_event_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("field_value_events.id"))
    review_status: Mapped[str] = mapped_column(String(50), nullable=False, default="candidate")
    created_by: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
