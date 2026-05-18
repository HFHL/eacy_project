"""add profile fields to users (phone, organization, department, job_title)

Revision ID: 20260518_1000
Revises: 20260511_1100
Create Date: 2026-05-18 10:00:00.000000

"""

import sqlalchemy as sa
from alembic import op


revision = "20260518_1000"
down_revision = "20260511_1100"
branch_labels = None
depends_on = None


PROFILE_COLUMNS = [
    ("phone", sa.String(length=32)),
    ("organization", sa.String(length=200)),
    ("department", sa.String(length=200)),
    ("job_title", sa.String(length=100)),
]


def _column_names(bind, table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(bind).get_columns(table_name)}


def upgrade():
    bind = op.get_bind()
    if "users" not in sa.inspect(bind).get_table_names():
        return
    existing = _column_names(bind, "users")
    for name, col_type in PROFILE_COLUMNS:
        if name not in existing:
            op.add_column("users", sa.Column(name, col_type, nullable=True))


def downgrade():
    bind = op.get_bind()
    if "users" not in sa.inspect(bind).get_table_names():
        return
    existing = _column_names(bind, "users")
    for name, _ in reversed(PROFILE_COLUMNS):
        if name in existing:
            op.drop_column("users", name)
