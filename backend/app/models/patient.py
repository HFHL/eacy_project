import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import Date, DateTime, Index, Integer, JSON, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base
from core.db.mixins.timestamp_mixin import TimestampMixin


class Patient(TimestampMixin, Base):
    __tablename__ = "patients"
    __table_args__ = (
        Index("idx_patients_name", "name"),
        Index("idx_patients_department", "department"),
        Index("idx_patients_owner_id", "owner_id"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    gender: Mapped[str | None] = mapped_column(String(20))
    birth_date: Mapped[date | None] = mapped_column(Date)
    age: Mapped[int | None] = mapped_column(Integer)
    department: Mapped[str | None] = mapped_column(String(100))
    main_diagnosis: Mapped[str | None] = mapped_column(String(500))
    doctor_name: Mapped[str | None] = mapped_column(String(100))
    owner_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
    extra_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)
