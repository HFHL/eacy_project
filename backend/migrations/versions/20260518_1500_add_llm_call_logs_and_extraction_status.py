"""add llm_call_logs table and extraction status/timeout columns

Revision ID: 20260518_1500
Revises: 20260511_1100
Create Date: 2026-05-18 15:00:00.000000

Adds a dedicated `llm_call_logs` table that records every outbound LLM call
(system/user prompts, raw response, token usage, elapsed time, normalized
status) and extends `extraction_jobs` / `extraction_runs` with `error_type`,
`extraction_jobs.timeout_at`, `extraction_runs.validation_log` so the admin
UI can distinguish timeouts from generic failures without parsing JSON blobs.
"""

import sqlalchemy as sa
from alembic import op


revision = "20260518_1500"
down_revision = "20260511_1100"
branch_labels = None
depends_on = None


def _column_names(bind, table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(bind).get_columns(table_name)}


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "llm_call_logs" not in existing_tables:
        op.create_table(
            "llm_call_logs",
            sa.Column("id", sa.Uuid(as_uuid=False), primary_key=True),
            sa.Column("call_id", sa.String(length=64), nullable=False, unique=True),
            sa.Column("job_id", sa.Uuid(as_uuid=False), sa.ForeignKey("extraction_jobs.id"), nullable=True),
            sa.Column("run_id", sa.Uuid(as_uuid=False), sa.ForeignKey("extraction_runs.id"), nullable=True),
            sa.Column("document_id", sa.Uuid(as_uuid=False), sa.ForeignKey("documents.id"), nullable=True),
            sa.Column("project_id", sa.Uuid(as_uuid=False), sa.ForeignKey("research_projects.id"), nullable=True),
            sa.Column("requested_by", sa.Uuid(as_uuid=False), nullable=True),
            sa.Column("purpose", sa.String(length=32), nullable=True),
            sa.Column("node_name", sa.String(length=64), nullable=True),
            sa.Column("provider", sa.String(length=32), nullable=True),
            sa.Column("model_name", sa.String(length=128), nullable=True),
            sa.Column("prompt_version", sa.String(length=64), nullable=True),
            sa.Column("system_prompt", sa.Text(), nullable=True),
            sa.Column("user_prompt", sa.Text(), nullable=True),
            sa.Column("raw_response", sa.Text(), nullable=True),
            sa.Column("parsed_response", sa.JSON(), nullable=True),
            sa.Column("prompt_tokens", sa.Integer(), nullable=True),
            sa.Column("completion_tokens", sa.Integer(), nullable=True),
            sa.Column("total_tokens", sa.Integer(), nullable=True),
            sa.Column("elapsed_ms", sa.Integer(), nullable=True),
            sa.Column("http_status", sa.Integer(), nullable=True),
            sa.Column("status", sa.String(length=16), nullable=False, server_default="success"),
            sa.Column("error_type", sa.String(length=64), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("retry_no", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("started_at", sa.DateTime(), nullable=False),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
        )
        op.create_index("idx_llm_call_logs_job", "llm_call_logs", ["job_id", "started_at"])
        op.create_index("idx_llm_call_logs_run", "llm_call_logs", ["run_id"])
        op.create_index("idx_llm_call_logs_status", "llm_call_logs", ["status", "started_at"])
        op.create_index("idx_llm_call_logs_document", "llm_call_logs", ["document_id"])
        op.create_index("ix_llm_call_logs_started_at", "llm_call_logs", ["started_at"])

    if "extraction_jobs" in existing_tables:
        existing = _column_names(bind, "extraction_jobs")
        if "error_type" not in existing:
            op.add_column("extraction_jobs", sa.Column("error_type", sa.String(length=64), nullable=True))
        if "timeout_at" not in existing:
            op.add_column("extraction_jobs", sa.Column("timeout_at", sa.DateTime(), nullable=True))

    if "extraction_runs" in existing_tables:
        existing = _column_names(bind, "extraction_runs")
        if "error_type" not in existing:
            op.add_column("extraction_runs", sa.Column("error_type", sa.String(length=64), nullable=True))
        if "validation_log" not in existing:
            op.add_column("extraction_runs", sa.Column("validation_log", sa.JSON(), nullable=True))


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "extraction_runs" in existing_tables:
        existing = _column_names(bind, "extraction_runs")
        if "validation_log" in existing:
            op.drop_column("extraction_runs", "validation_log")
        if "error_type" in existing:
            op.drop_column("extraction_runs", "error_type")

    if "extraction_jobs" in existing_tables:
        existing = _column_names(bind, "extraction_jobs")
        if "timeout_at" in existing:
            op.drop_column("extraction_jobs", "timeout_at")
        if "error_type" in existing:
            op.drop_column("extraction_jobs", "error_type")

    if "llm_call_logs" in existing_tables:
        op.drop_index("ix_llm_call_logs_started_at", table_name="llm_call_logs")
        op.drop_index("idx_llm_call_logs_document", table_name="llm_call_logs")
        op.drop_index("idx_llm_call_logs_status", table_name="llm_call_logs")
        op.drop_index("idx_llm_call_logs_run", table_name="llm_call_logs")
        op.drop_index("idx_llm_call_logs_job", table_name="llm_call_logs")
        op.drop_table("llm_call_logs")
