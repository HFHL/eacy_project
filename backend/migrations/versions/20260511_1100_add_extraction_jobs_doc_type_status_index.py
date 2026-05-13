"""add composite index on extraction_jobs (document_id, job_type, status)

Revision ID: 20260511_1100
Revises: 20260507_1200
Create Date: 2026-05-11 11:00:00.000000

"""

from alembic import op


revision = "20260511_1100"
down_revision = "20260507_1200"
branch_labels = None
depends_on = None


def upgrade():
    # Composite index used by GET /documents list endpoints to batch-aggregate
    # per-document EHR extract status (filters: document_id IN (...) AND job_type IN (...)).
    op.create_index(
        "idx_jobs_document_type_status",
        "extraction_jobs",
        ["document_id", "job_type", "status"],
    )


def downgrade():
    op.drop_index("idx_jobs_document_type_status", table_name="extraction_jobs")
