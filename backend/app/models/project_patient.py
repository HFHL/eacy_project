import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, JSON, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base
from core.db.mixins.timestamp_mixin import TimestampMixin


class ProjectPatient(TimestampMixin, Base):
    __tablename__ = "project_patients"
    __table_args__ = (UniqueConstraint("project_id", "patient_id", name="uk_project_patient"),)

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("research_projects.id"), nullable=False)
    patient_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("patients.id"), nullable=False)
    enroll_no: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="enrolled")
    enrolled_at: Mapped[datetime | None] = mapped_column(DateTime)
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime)
    extra_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
