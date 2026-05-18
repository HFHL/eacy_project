"""merge profile fields and llm logs heads

Revision ID: 20260518_1700
Revises: 20260518_1000, 20260518_1500
Create Date: 2026-05-18 17:00:00.000000

Merges the two parallel migration heads that both descend from
`20260511_1100`:

- `20260518_1000` adds profile fields (phone/organization/department/job_title)
  to the `users` table.
- `20260518_1500` adds the `llm_call_logs` table plus extraction status /
  timeout columns.

This is a no-op merge; both branches stay schema-additive.
"""

from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401


revision = "20260518_1700"
down_revision = ("20260518_1000", "20260518_1500")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
