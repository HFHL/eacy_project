import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, JSON, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base
from core.db.mixins.timestamp_mixin import TimestampMixin


class AsyncTaskBatch(TimestampMixin, Base):
    __tablename__ = "async_task_batches"
    __table_args__ = (
        Index("idx_async_task_batches_status", "status", "updated_at"),
        Index("idx_async_task_batches_patient", "patient_id"),
        Index("idx_async_task_batches_project_patient", "project_id", "project_patient_id"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_type: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="created")
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    title: Mapped[str | None] = mapped_column(String(255))
    scope_type: Mapped[str | None] = mapped_column(String(40))
    patient_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
    document_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
    project_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
    project_patient_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
    total_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    succeeded_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cancelled_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    message: Mapped[str | None] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)
    requested_by: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime)


class AsyncTaskItem(TimestampMixin, Base):
    __tablename__ = "async_task_items"
    __table_args__ = (
        Index("idx_async_task_items_batch", "batch_id", "status"),
        Index("idx_async_task_items_extraction_job", "extraction_job_id"),
        Index("idx_async_task_items_document", "document_id", "task_type"),
        Index("idx_async_task_items_patient", "patient_id"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    batch_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("async_task_batches.id"))
    task_type: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="created")
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stage: Mapped[str | None] = mapped_column(String(80))
    stage_label: Mapped[str | None] = mapped_column(String(120))
    message: Mapped[str | None] = mapped_column(Text)
    celery_task_id: Mapped[str | None] = mapped_column(String(255))
    extraction_job_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("extraction_jobs.id"))
    extraction_run_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("extraction_runs.id"))
    document_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("documents.id"))
    patient_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("patients.id"))
    project_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("research_projects.id"))
    project_patient_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("project_patients.id"))
    context_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("data_contexts.id"))
    target_form_key: Mapped[str | None] = mapped_column(String(100))
    current_step: Mapped[int | None] = mapped_column(Integer)
    total_steps: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime)


class AsyncTaskEvent(Base):
    __tablename__ = "async_task_events"
    __table_args__ = (
        Index("idx_async_task_events_item", "item_id", "created_at"),
        Index("idx_async_task_events_batch", "batch_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    batch_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("async_task_batches.id"))
    item_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("async_task_items.id"))
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str | None] = mapped_column(String(40))
    progress: Mapped[int | None] = mapped_column(Integer)
    stage: Mapped[str | None] = mapped_column(String(80))
    message: Mapped[str | None] = mapped_column(Text)
    payload_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
