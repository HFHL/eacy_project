import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Index, JSON, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base
from core.db.mixins.timestamp_mixin import TimestampMixin


class Document(TimestampMixin, Base):
    __tablename__ = "documents"
    __table_args__ = (
        Index("idx_documents_patient_id", "patient_id"),
        Index("idx_documents_status", "status"),
        Index("idx_documents_doc_type", "doc_type"),
        Index("idx_documents_effective_at", "effective_at"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    file_name: Mapped[str | None] = mapped_column(String(255))
    file_path: Mapped[str | None] = mapped_column(Text)
    file_type: Mapped[str | None] = mapped_column(String(50))
    file_hash: Mapped[str | None] = mapped_column(String(64))
    document_type: Mapped[str | None] = mapped_column(String(100))
    document_sub_type: Mapped[str | None] = mapped_column(String(100))
    is_parsed: Mapped[bool | None] = mapped_column(Boolean)
    parsed_content: Mapped[str | None] = mapped_column(Text)
    parsed_data: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    patient_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), ForeignKey("patients.id"))
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_ext: Mapped[str | None] = mapped_column(String(20))
    mime_type: Mapped[str | None] = mapped_column(String(100))
    file_size: Mapped[int | None] = mapped_column(BigInteger)
    storage_provider: Mapped[str | None] = mapped_column(String(50))
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    file_url: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="uploaded")
    ocr_status: Mapped[str | None] = mapped_column(String(50))
    ocr_text: Mapped[str | None] = mapped_column(Text)
    ocr_payload_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    meta_status: Mapped[str | None] = mapped_column(String(50))
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    doc_type: Mapped[str | None] = mapped_column(String(100))
    doc_subtype: Mapped[str | None] = mapped_column(String(100))
    doc_title: Mapped[str | None] = mapped_column(String(255))
    effective_at: Mapped[datetime | None] = mapped_column(DateTime)
    uploaded_by: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime)
