import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, Integer, JSON, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base
from core.db.mixins.timestamp_mixin import TimestampMixin


class RecordInstance(TimestampMixin, Base):
    __tablename__ = "record_instances"
    __table_args__ = (
        UniqueConstraint("context_id", "form_key", "repeat_index", name="uk_record_instance"),
        Index("idx_record_instances_context", "context_id"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    context_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("data_contexts.id"), nullable=False)
    group_key: Mapped[str | None] = mapped_column(String(100))
    group_title: Mapped[str | None] = mapped_column(String(200))
    form_key: Mapped[str] = mapped_column(String(100), nullable=False)
    form_title: Mapped[str] = mapped_column(String(200), nullable=False)
    repeat_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    instance_label: Mapped[str | None] = mapped_column(String(200))
    anchor_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    source_document_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("documents.id"))
    created_by_run_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("extraction_runs.id"))
    review_status: Mapped[str] = mapped_column(String(50), nullable=False, default="unreviewed")
