import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base
from core.db.mixins.timestamp_mixin import TimestampMixin


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        Index("idx_users_email", "email", unique=True),
        Index("idx_users_username", "username", unique=True),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    username: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str | None] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="user")
    permissions: Mapped[str | None] = mapped_column(String(1000))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)
