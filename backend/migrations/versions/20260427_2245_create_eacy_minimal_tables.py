"""create eacy minimal tables

Revision ID: 20260427_2245
Revises: 20260316_proj_extract_tasks
Create Date: 2026-04-27 22:45:00.000000

"""

from alembic import op

import app.models  # noqa: F401
from core.db import Base


# revision identifiers, used by Alembic.
revision = "20260427_2245"
down_revision = "20260316_proj_extract_tasks"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade():
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
