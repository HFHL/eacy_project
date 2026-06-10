"""Extraction closure correctness fixes.

Revision ID: 20260610_1200
Revises: 20260531_1730
Create Date: 2026-06-10 12:00:00.000000
"""

from alembic import op


revision = "20260610_1200"
down_revision = "20260531_1730"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE record_instances
        SET instance_label = regexp_replace(instance_label, '\\s+#([0-9]+)$', '_\\1')
        WHERE instance_label ~ '\\s+#[0-9]+$'
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM data_contexts
                WHERE context_type = 'project_crf'
                  AND project_patient_id IS NOT NULL
                GROUP BY project_patient_id, schema_version_id
                HAVING COUNT(*) > 1
            ) THEN
                RAISE NOTICE 'Skipped uk_data_contexts_project_patient_schema_crf because duplicate project_crf contexts exist';
            ELSE
                CREATE UNIQUE INDEX IF NOT EXISTS uk_data_contexts_project_patient_schema_crf
                ON data_contexts (project_patient_id, schema_version_id)
                WHERE context_type = 'project_crf' AND project_patient_id IS NOT NULL;
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uk_data_contexts_project_patient_schema_crf")
