"""add indexes on documents.uploaded_by and extraction_jobs patient scope

Revision ID: 20260520_1100
Revises: 20260520_1000
Create Date: 2026-05-20 11:00:00.000000
"""

import sqlalchemy as sa
from alembic import op


revision = "20260520_1100"
down_revision = "20260520_1000"
branch_labels = None
depends_on = None


def _index_names(bind, table_name: str) -> set[str]:
    return {index["name"] for index in sa.inspect(bind).get_indexes(table_name)}


def upgrade():
    bind = op.get_bind()
    document_indexes = _index_names(bind, "documents")
    if "idx_documents_uploaded_by_status" not in document_indexes:
        op.create_index(
            "idx_documents_uploaded_by_status",
            "documents",
            ["uploaded_by", "status"],
        )

    job_indexes = _index_names(bind, "extraction_jobs")
    if "idx_jobs_patient_type_status" not in job_indexes:
        op.create_index(
            "idx_jobs_patient_type_status",
            "extraction_jobs",
            ["patient_id", "job_type", "status"],
        )


def downgrade():
    bind = op.get_bind()
    document_indexes = _index_names(bind, "documents")
    if "idx_documents_uploaded_by_status" in document_indexes:
        op.drop_index("idx_documents_uploaded_by_status", table_name="documents")

    job_indexes = _index_names(bind, "extraction_jobs")
    if "idx_jobs_patient_type_status" in job_indexes:
        op.drop_index("idx_jobs_patient_type_status", table_name="extraction_jobs")
