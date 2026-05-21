"""add plan_json to async_task_batches

Revision ID: 20260520_1000
Revises: 20260518_1700
Create Date: 2026-05-20 10:00:00.000000
"""

import sqlalchemy as sa
from alembic import op


revision = "20260520_1000"
down_revision = "20260518_1700"
branch_labels = None
depends_on = None


def _column_names(bind, table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(bind).get_columns(table_name)}


def upgrade():
    bind = op.get_bind()
    if "plan_json" not in _column_names(bind, "async_task_batches"):
        op.add_column("async_task_batches", sa.Column("plan_json", sa.JSON(), nullable=True))


def downgrade():
    bind = op.get_bind()
    if "plan_json" in _column_names(bind, "async_task_batches"):
        op.drop_column("async_task_batches", "plan_json")
