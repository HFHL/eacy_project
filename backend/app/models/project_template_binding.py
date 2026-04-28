import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base
from core.db.mixins.timestamp_mixin import TimestampMixin


class ProjectTemplateBinding(TimestampMixin, Base):
    __tablename__ = "project_template_bindings"
    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "schema_version_id",
            "binding_type",
            name="uk_project_template_binding",
        ),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("research_projects.id"), nullable=False)
    template_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("schema_templates.id"), nullable=False)
    schema_version_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("schema_template_versions.id"), nullable=False)
    binding_type: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    locked_at: Mapped[datetime | None] = mapped_column(DateTime)
