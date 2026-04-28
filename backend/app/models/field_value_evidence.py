import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, JSON, Numeric, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base


class FieldValueEvidence(Base):
    __tablename__ = "field_value_evidence"
    __table_args__ = (
        Index("idx_evidence_event", "value_event_id"),
        Index("idx_evidence_document", "document_id"),
        Index("idx_evidence_row_cell", "row_key", "cell_key"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    value_event_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("field_value_events.id"), nullable=False)
    document_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("documents.id"), nullable=False)
    page_no: Mapped[int | None] = mapped_column(Integer)
    bbox_json: Mapped[dict[str, Any] | list[Any] | None] = mapped_column(JSON)
    quote_text: Mapped[str | None] = mapped_column(Text)
    evidence_type: Mapped[str] = mapped_column(String(50), nullable=False)
    row_key: Mapped[str | None] = mapped_column(String(100))
    cell_key: Mapped[str | None] = mapped_column(String(100))
    start_offset: Mapped[int | None] = mapped_column(Integer)
    end_offset: Mapped[int | None] = mapped_column(Integer)
    evidence_score: Mapped[float | None] = mapped_column(Numeric(5, 4))
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
