"""add system flag to schema templates

Revision ID: 20260527_1430
Revises: 20260520_1100
Create Date: 2026-05-27 14:30:00.000000
"""

import sqlalchemy as sa
from alembic import op


revision = "20260527_1430"
down_revision = "20260520_1100"
branch_labels = None
depends_on = None


ADMIN_USER_ID = "55555555-5555-4555-8555-555555555555"


def _table_names(bind) -> set[str]:
    return set(sa.inspect(bind).get_table_names())


def _column_names(bind, table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(bind).get_columns(table_name)}


def upgrade():
    bind = op.get_bind()
    if "schema_templates" not in _table_names(bind):
        return

    columns = _column_names(bind, "schema_templates")
    if "is_system" not in columns:
        op.add_column(
            "schema_templates",
            sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
        )

    bind.execute(
        sa.text(
            """
            UPDATE schema_templates
            SET is_system = true
            WHERE created_by = :admin_user_id
              AND status != 'archived'
            """
        ),
        {"admin_user_id": ADMIN_USER_ID},
    )


def downgrade():
    bind = op.get_bind()
    if "schema_templates" not in _table_names(bind):
        return
    if "is_system" in _column_names(bind, "schema_templates"):
        op.drop_column("schema_templates", "is_system")
