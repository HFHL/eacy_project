import uuid

from sqlalchemy import ForeignKey, Index, String, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base
from core.db.mixins.timestamp_mixin import TimestampMixin


class DataContext(TimestampMixin, Base):
    __tablename__ = "data_contexts"
    __table_args__ = (
        Index("idx_data_contexts_project_patient_crf", "context_type", "project_patient_id", "schema_version_id"),
        Index("idx_data_contexts_project_crf", "context_type", "project_id", "schema_version_id"),
        Index("idx_data_contexts_patient_schema", "context_type", "patient_id", "schema_version_id"),
        Index(
            "uk_data_contexts_project_patient_schema_crf",
            "project_patient_id",
            "schema_version_id",
            unique=True,
            postgresql_where=text("context_type = 'project_crf' AND project_patient_id IS NOT NULL"),
        ),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    context_type: Mapped[str] = mapped_column(String(50), nullable=False)
    patient_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("patients.id"), nullable=False)
    project_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("research_projects.id"))
    project_patient_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("project_patients.id"))
    schema_version_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("schema_template_versions.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="draft")
    created_by: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
