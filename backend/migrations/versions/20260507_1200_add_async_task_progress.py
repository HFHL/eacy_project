"""add async task progress tables

Revision ID: 20260507_1200
Revises: 20260429_0910
Create Date: 2026-05-07 12:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "20260507_1200"
down_revision = "20260429_0910"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "async_task_batches",
        sa.Column("id", sa.Uuid(as_uuid=False), primary_key=True),
        sa.Column("task_type", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("scope_type", sa.String(length=40), nullable=True),
        sa.Column("patient_id", sa.Uuid(as_uuid=False), nullable=True),
        sa.Column("document_id", sa.Uuid(as_uuid=False), nullable=True),
        sa.Column("project_id", sa.Uuid(as_uuid=False), nullable=True),
        sa.Column("project_patient_id", sa.Uuid(as_uuid=False), nullable=True),
        sa.Column("total_items", sa.Integer(), nullable=False),
        sa.Column("succeeded_items", sa.Integer(), nullable=False),
        sa.Column("failed_items", sa.Integer(), nullable=False),
        sa.Column("cancelled_items", sa.Integer(), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("requested_by", sa.Uuid(as_uuid=False), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("heartbeat_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("idx_async_task_batches_status", "async_task_batches", ["status", "updated_at"])
    op.create_index("idx_async_task_batches_patient", "async_task_batches", ["patient_id"])
    op.create_index("idx_async_task_batches_project_patient", "async_task_batches", ["project_id", "project_patient_id"])

    op.create_table(
        "async_task_items",
        sa.Column("id", sa.Uuid(as_uuid=False), primary_key=True),
        sa.Column("batch_id", sa.Uuid(as_uuid=False), sa.ForeignKey("async_task_batches.id"), nullable=True),
        sa.Column("task_type", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("stage", sa.String(length=80), nullable=True),
        sa.Column("stage_label", sa.String(length=120), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("celery_task_id", sa.String(length=255), nullable=True),
        sa.Column("extraction_job_id", sa.Uuid(as_uuid=False), sa.ForeignKey("extraction_jobs.id"), nullable=True),
        sa.Column("extraction_run_id", sa.Uuid(as_uuid=False), sa.ForeignKey("extraction_runs.id"), nullable=True),
        sa.Column("document_id", sa.Uuid(as_uuid=False), sa.ForeignKey("documents.id"), nullable=True),
        sa.Column("patient_id", sa.Uuid(as_uuid=False), sa.ForeignKey("patients.id"), nullable=True),
        sa.Column("project_id", sa.Uuid(as_uuid=False), sa.ForeignKey("research_projects.id"), nullable=True),
        sa.Column("project_patient_id", sa.Uuid(as_uuid=False), sa.ForeignKey("project_patients.id"), nullable=True),
        sa.Column("context_id", sa.Uuid(as_uuid=False), sa.ForeignKey("data_contexts.id"), nullable=True),
        sa.Column("target_form_key", sa.String(length=100), nullable=True),
        sa.Column("current_step", sa.Integer(), nullable=True),
        sa.Column("total_steps", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("heartbeat_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("idx_async_task_items_batch", "async_task_items", ["batch_id", "status"])
    op.create_index("idx_async_task_items_extraction_job", "async_task_items", ["extraction_job_id"])
    op.create_index("idx_async_task_items_document", "async_task_items", ["document_id", "task_type"])
    op.create_index("idx_async_task_items_patient", "async_task_items", ["patient_id"])

    op.create_table(
        "async_task_events",
        sa.Column("id", sa.Uuid(as_uuid=False), primary_key=True),
        sa.Column("batch_id", sa.Uuid(as_uuid=False), sa.ForeignKey("async_task_batches.id"), nullable=True),
        sa.Column("item_id", sa.Uuid(as_uuid=False), sa.ForeignKey("async_task_items.id"), nullable=True),
        sa.Column("event_type", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=True),
        sa.Column("progress", sa.Integer(), nullable=True),
        sa.Column("stage", sa.String(length=80), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("payload_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("idx_async_task_events_item", "async_task_events", ["item_id", "created_at"])
    op.create_index("idx_async_task_events_batch", "async_task_events", ["batch_id", "created_at"])


def downgrade():
    op.drop_index("idx_async_task_events_batch", table_name="async_task_events")
    op.drop_index("idx_async_task_events_item", table_name="async_task_events")
    op.drop_table("async_task_events")
    op.drop_index("idx_async_task_items_patient", table_name="async_task_items")
    op.drop_index("idx_async_task_items_document", table_name="async_task_items")
    op.drop_index("idx_async_task_items_extraction_job", table_name="async_task_items")
    op.drop_index("idx_async_task_items_batch", table_name="async_task_items")
    op.drop_table("async_task_items")
    op.drop_index("idx_async_task_batches_project_patient", table_name="async_task_batches")
    op.drop_index("idx_async_task_batches_patient", table_name="async_task_batches")
    op.drop_index("idx_async_task_batches_status", table_name="async_task_batches")
    op.drop_table("async_task_batches")
