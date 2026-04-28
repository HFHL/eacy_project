import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base
from core.db.mixins.timestamp_mixin import TimestampMixin


class SchemaTemplateVersion(TimestampMixin, Base):
    __tablename__ = "schema_template_versions"
    __table_args__ = (UniqueConstraint("template_id", "version_no", name="uk_template_version"),)

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    template_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("schema_templates.id"), nullable=False)
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    version_name: Mapped[str | None] = mapped_column(String(100))
    schema_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="draft")
    published_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_by: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
