import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import Date, DateTime, ForeignKey, JSON, Numeric, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base


class FieldCurrentValue(Base):
    __tablename__ = "field_current_values"
    __table_args__ = (
        UniqueConstraint("context_id", "record_instance_id", "field_path", name="uk_current_field"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    context_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("data_contexts.id"), nullable=False)
    record_instance_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("record_instances.id"), nullable=False)
    field_key: Mapped[str] = mapped_column(String(100), nullable=False)
    field_path: Mapped[str] = mapped_column(String(500), nullable=False)
    selected_event_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("field_value_events.id"))
    value_type: Mapped[str] = mapped_column(String(50), nullable=False)
    value_text: Mapped[str | None] = mapped_column(Text)
    value_number: Mapped[float | None] = mapped_column(Numeric(18, 6))
    value_date: Mapped[date | None] = mapped_column(Date)
    value_datetime: Mapped[datetime | None] = mapped_column(DateTime)
    value_json: Mapped[dict[str, Any] | list[Any] | None] = mapped_column(JSON)
    unit: Mapped[str | None] = mapped_column(String(50))
    selected_by: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
    selected_at: Mapped[datetime | None] = mapped_column(DateTime)
    review_status: Mapped[str] = mapped_column(String(50), nullable=False, default="unreviewed")
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
