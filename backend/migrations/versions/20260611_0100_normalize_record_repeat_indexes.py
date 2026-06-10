"""Normalize shifted record repeat indexes.

Revision ID: 20260611_0100
Revises: 20260610_1200
Create Date: 2026-06-11 01:00:00.000000
"""

from alembic import op


revision = "20260611_0100"
down_revision = "20260610_1200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # A previous next_repeat_index implementation returned 1 for an empty
    # form, so the first extracted repeatable record could be labeled *_2
    # and rendered behind an empty *_1 placeholder.  Shift only form scopes
    # that do not already have repeat_index 0.
    op.execute(
        """
        CREATE TEMP TABLE tmp_shifted_record_indexes ON COMMIT DROP AS
        WITH shifted_forms AS (
            SELECT
                context_id,
                form_key,
                MIN(repeat_index) AS offset
            FROM record_instances
            GROUP BY context_id, form_key
            HAVING MIN(repeat_index) > 0
               AND BOOL_AND(repeat_index <> 0)
        )
        SELECT
            ri.id,
            ri.repeat_index - sf.offset AS next_repeat_index,
            COALESCE(
                NULLIF(BTRIM(ri.form_title), ''),
                NULLIF(BTRIM(regexp_replace(ri.form_key, '^.*\\.', '')), ''),
                'Record'
            ) AS title
        FROM record_instances ri
        JOIN shifted_forms sf
          ON sf.context_id = ri.context_id
         AND sf.form_key = ri.form_key
        """
    )
    op.execute(
        """
        UPDATE record_instances ri
           SET repeat_index = -1000000 - sri.next_repeat_index,
               updated_at = NOW()
          FROM tmp_shifted_record_indexes sri
         WHERE ri.id = sri.id
        """
    )
    op.execute(
        """
        UPDATE record_instances ri
           SET repeat_index = sr.next_repeat_index,
               instance_label = CASE
                   WHEN sr.next_repeat_index = 0 THEN sr.title
                   ELSE sr.title || '_' || (sr.next_repeat_index + 1)::text
               END,
               updated_at = NOW()
          FROM tmp_shifted_record_indexes sr
         WHERE ri.id = sr.id
        """
    )
    op.execute("DROP TABLE IF EXISTS tmp_shifted_record_indexes")


def downgrade() -> None:
    # Data normalization is intentionally not reversible.
    pass
