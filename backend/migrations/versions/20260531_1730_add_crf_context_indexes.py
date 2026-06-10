"""Add indexes for project CRF context lookups."""

from alembic import op


revision = "20260531_1730"
down_revision = "20260527_1430"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_data_contexts_project_patient_crf
        ON data_contexts (context_type, project_patient_id, schema_version_id)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_data_contexts_project_crf
        ON data_contexts (context_type, project_id, schema_version_id)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_data_contexts_patient_schema
        ON data_contexts (context_type, patient_id, schema_version_id)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_data_contexts_patient_schema")
    op.execute("DROP INDEX IF EXISTS idx_data_contexts_project_crf")
    op.execute("DROP INDEX IF EXISTS idx_data_contexts_project_patient_crf")
