import uuid

from sqlalchemy import ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base
from core.db.mixins.timestamp_mixin import TimestampMixin


class DataContext(TimestampMixin, Base):
    __tablename__ = "data_contexts"

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    context_type: Mapped[str] = mapped_column(String(50), nullable=False)
    patient_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("patients.id"), nullable=False)
    project_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("research_projects.id"))
    project_patient_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("project_patients.id"))
    schema_version_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("schema_template_versions.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="draft")
    created_by: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
