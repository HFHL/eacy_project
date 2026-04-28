import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base


class ExtractionRun(Base):
    __tablename__ = "extraction_runs"
    __table_args__ = (UniqueConstraint("job_id", "run_no", name="uk_job_run_no"),)

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("extraction_jobs.id"), nullable=False)
    run_no: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    model_name: Mapped[str | None] = mapped_column(String(200))
    prompt_version: Mapped[str | None] = mapped_column(String(100))
    input_snapshot_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    raw_output_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    parsed_output_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    validation_status: Mapped[str | None] = mapped_column(String(50))
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
