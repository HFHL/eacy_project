import uuid
from datetime import date
from typing import Any

from sqlalchemy import Date, JSON, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base
from core.db.mixins.timestamp_mixin import TimestampMixin


class ResearchProject(TimestampMixin, Base):
    __tablename__ = "research_projects"
    __table_args__ = (UniqueConstraint("project_code", name="uk_project_code"),)

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_code: Mapped[str] = mapped_column(String(100), nullable=False)
    project_name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="draft")
    owner_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    extra_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
