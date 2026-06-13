"""Rebuild lab result table JSON values after JSON null folding.

Revision ID: 20260613_0200
Revises: 20260613_0100
Create Date: 2026-06-13 02:00:00.000000
"""

from alembic import op


revision = "20260613_0200"
down_revision = "20260613_0100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The previous collapse migration must treat JSON literal null as no JSON
    # value.  Production had already run it once, so rebuild the parent table
    # current/event payloads from the retained accepted leaf events.
    op.execute(
        """
        CREATE TEMP TABLE tmp_lab_result_table_rebuild ON COMMIT DROP AS
        WITH accepted_cells AS (
            SELECT DISTINCT ON (
                fve.context_id,
                fve.extraction_run_id,
                fve.source_document_id,
                fve.record_instance_id,
                fve.field_path
            )
                fve.context_id,
                fve.extraction_run_id,
                fve.source_document_id,
                fve.record_instance_id,
                ri.form_key,
                ri.repeat_index AS row_repeat_index,
                regexp_replace(fve.field_path, '\\.检验结果\\..*$', '.检验结果') AS table_path,
                fve.field_key,
                CASE
                    WHEN fve.value_json IS NOT NULL AND fve.value_json::text <> 'null' THEN fve.value_json::jsonb
                    WHEN fve.value_number IS NOT NULL THEN to_jsonb(fve.value_number)
                    WHEN fve.value_date IS NOT NULL THEN to_jsonb(fve.value_date::text)
                    WHEN fve.value_datetime IS NOT NULL THEN to_jsonb(fve.value_datetime::text)
                    ELSE to_jsonb(fve.value_text)
                END AS cell_value,
                fve.confidence,
                fve.created_at
            FROM field_value_events fve
            JOIN record_instances ri ON ri.id = fve.record_instance_id
            WHERE fve.field_path LIKE '%.检验结果.%'
              AND fve.review_status = 'accepted'
              AND (
                    (fve.value_json IS NOT NULL AND fve.value_json::text <> 'null')
                 OR fve.value_number IS NOT NULL
                 OR fve.value_date IS NOT NULL
                 OR fve.value_datetime IS NOT NULL
                 OR NULLIF(fve.value_text, '') IS NOT NULL
              )
            ORDER BY
                fve.context_id,
                fve.extraction_run_id,
                fve.source_document_id,
                fve.record_instance_id,
                fve.field_path,
                fve.created_at DESC
        ),
        table_rows AS (
            SELECT
                context_id,
                extraction_run_id,
                source_document_id,
                form_key,
                table_path,
                record_instance_id AS row_record_instance_id,
                MIN(row_repeat_index) AS row_order,
                jsonb_object_agg(field_key, cell_value ORDER BY field_key) AS row_json,
                MAX(confidence) AS confidence,
                MAX(created_at) AS created_at
            FROM accepted_cells
            GROUP BY
                context_id,
                extraction_run_id,
                source_document_id,
                form_key,
                table_path,
                record_instance_id
        ),
        table_groups AS (
            SELECT
                context_id,
                extraction_run_id,
                source_document_id,
                form_key,
                table_path,
                jsonb_agg(row_json ORDER BY row_order, created_at, row_record_instance_id) AS table_json,
                MAX(confidence) AS confidence,
                MAX(created_at) AS created_at
            FROM table_rows
            WHERE row_json <> '{}'::jsonb
            GROUP BY
                context_id,
                extraction_run_id,
                source_document_id,
                form_key,
                table_path
        ),
        resolved_targets AS (
            SELECT
                tg.*,
                COALESCE(report_record.id, fallback_record.id) AS target_record_instance_id
            FROM table_groups tg
            LEFT JOIN LATERAL (
                SELECT ri.id
                FROM record_instances ri
                WHERE ri.context_id = tg.context_id
                  AND ri.form_key = tg.form_key
                  AND (
                        ri.source_document_id IS NOT DISTINCT FROM tg.source_document_id
                     OR EXISTS (
                            SELECT 1
                            FROM field_value_events event
                            WHERE event.record_instance_id = ri.id
                              AND event.extraction_run_id IS NOT DISTINCT FROM tg.extraction_run_id
                              AND event.source_document_id IS NOT DISTINCT FROM tg.source_document_id
                              AND event.field_path NOT LIKE tg.table_path || '.%'
                        )
                  )
                ORDER BY
                    CASE
                        WHEN EXISTS (
                            SELECT 1
                            FROM field_value_events event
                            WHERE event.record_instance_id = ri.id
                              AND event.extraction_run_id IS NOT DISTINCT FROM tg.extraction_run_id
                              AND event.source_document_id IS NOT DISTINCT FROM tg.source_document_id
                              AND event.field_path NOT LIKE tg.table_path || '.%'
                        )
                        THEN 0 ELSE 1
                    END,
                    CASE
                        WHEN ri.anchor_json->>'anchor_source' = 'anchor' THEN 0
                        ELSE 1
                    END,
                    ri.repeat_index,
                    ri.created_at
                LIMIT 1
            ) report_record ON TRUE
            LEFT JOIN LATERAL (
                SELECT tr.row_record_instance_id AS id
                FROM table_rows tr
                WHERE tr.context_id = tg.context_id
                  AND tr.extraction_run_id IS NOT DISTINCT FROM tg.extraction_run_id
                  AND tr.source_document_id IS NOT DISTINCT FROM tg.source_document_id
                  AND tr.form_key = tg.form_key
                  AND tr.table_path = tg.table_path
                ORDER BY tr.row_order, tr.created_at, tr.row_record_instance_id
                LIMIT 1
            ) fallback_record ON TRUE
        )
        SELECT
            context_id,
            extraction_run_id,
            source_document_id,
            target_record_instance_id,
            table_path AS field_path,
            table_json,
            confidence
        FROM resolved_targets
        WHERE target_record_instance_id IS NOT NULL
        """
    )

    op.execute(
        """
        UPDATE field_value_events event
        SET value_json = rebuild.table_json::json,
            confidence = COALESCE(rebuild.confidence, event.confidence)
        FROM tmp_lab_result_table_rebuild rebuild
        WHERE event.context_id = rebuild.context_id
          AND event.record_instance_id = rebuild.target_record_instance_id
          AND event.field_path = rebuild.field_path
          AND event.extraction_run_id IS NOT DISTINCT FROM rebuild.extraction_run_id
          AND event.source_document_id IS NOT DISTINCT FROM rebuild.source_document_id
          AND event.value_type = 'json'
        """
    )

    op.execute(
        """
        UPDATE field_current_values current_value
        SET value_json = rebuild.table_json::json,
            selected_at = COALESCE(current_value.selected_at, NOW()),
            updated_at = NOW()
        FROM tmp_lab_result_table_rebuild rebuild
        WHERE current_value.context_id = rebuild.context_id
          AND current_value.record_instance_id = rebuild.target_record_instance_id
          AND current_value.field_path = rebuild.field_path
          AND current_value.value_type = 'json'
        """
    )

    op.execute(
        """
        DELETE FROM field_current_values current_value
        WHERE current_value.field_path LIKE '%.检验结果.%'
          AND EXISTS (
              SELECT 1
              FROM field_current_values parent_value
              WHERE parent_value.context_id = current_value.context_id
                AND parent_value.field_path = regexp_replace(current_value.field_path, '\\.检验结果\\..*$', '.检验结果')
          )
        """
    )

    op.execute("DROP TABLE IF EXISTS tmp_lab_result_table_rebuild")


def downgrade() -> None:
    # Data repair is intentionally not reversible.
    pass
