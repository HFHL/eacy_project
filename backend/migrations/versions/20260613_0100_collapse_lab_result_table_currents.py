"""Collapse split lab result table currents into JSON table values.

Revision ID: 20260613_0100
Revises: 20260611_0200
Create Date: 2026-06-13 01:00:00.000000
"""

from alembic import op


revision = "20260613_0100"
down_revision = "20260611_0200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Older extraction treated nested lab table rows (for example
    # 实验室检查.血常规.检验结果.检测值) as repeated outer records.  Rebuild one
    # parent JSON table current per extraction run/source document while keeping
    # historical leaf events for audit/evidence review.
    op.execute(
        """
        CREATE TEMP TABLE tmp_lab_result_table_events ON COMMIT DROP AS
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
            gen_random_uuid() AS event_id,
            context_id,
            extraction_run_id,
            source_document_id,
            target_record_instance_id,
            substring(table_path from '[^.]+$') AS field_key,
            table_path AS field_path,
            substring(table_path from '[^.]+$') AS field_title,
            table_json,
            confidence,
            COALESCE(created_at, NOW()) AS created_at
        FROM resolved_targets rt
        WHERE target_record_instance_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM field_value_events existing
              WHERE existing.context_id = rt.context_id
                AND existing.record_instance_id = rt.target_record_instance_id
                AND existing.field_path = rt.table_path
                AND existing.extraction_run_id IS NOT DISTINCT FROM rt.extraction_run_id
                AND existing.source_document_id IS NOT DISTINCT FROM rt.source_document_id
                AND existing.value_type = 'json'
          )
        """
    )

    op.execute(
        """
        INSERT INTO field_value_events (
            id,
            context_id,
            record_instance_id,
            field_key,
            field_path,
            field_title,
            event_type,
            value_type,
            value_json,
            confidence,
            extraction_run_id,
            source_document_id,
            review_status,
            created_at
        )
        SELECT
            event_id,
            context_id,
            target_record_instance_id,
            field_key,
            field_path,
            field_title,
            'ai_extracted',
            'json',
            table_json::json,
            confidence,
            extraction_run_id,
            source_document_id,
            'accepted',
            created_at
        FROM tmp_lab_result_table_events
        """
    )

    op.execute(
        """
        INSERT INTO field_current_values (
            id,
            context_id,
            record_instance_id,
            field_key,
            field_path,
            selected_event_id,
            value_type,
            value_json,
            selected_at,
            review_status,
            updated_at
        )
        SELECT
            gen_random_uuid(),
            context_id,
            target_record_instance_id,
            field_key,
            field_path,
            event_id,
            'json',
            table_json::json,
            NOW(),
            'unreviewed',
            NOW()
        FROM (
            SELECT DISTINCT ON (context_id, target_record_instance_id, field_path)
                *
            FROM tmp_lab_result_table_events
            ORDER BY
                context_id,
                target_record_instance_id,
                field_path,
                created_at DESC,
                event_id
        ) latest_table_event
        ON CONFLICT ON CONSTRAINT uk_current_field DO UPDATE
            SET field_key = EXCLUDED.field_key,
                selected_event_id = EXCLUDED.selected_event_id,
                value_type = EXCLUDED.value_type,
                value_json = EXCLUDED.value_json,
                selected_at = EXCLUDED.selected_at,
                review_status = EXCLUDED.review_status,
                updated_at = EXCLUDED.updated_at
            WHERE field_current_values.review_status IN ('unreviewed', 'candidate')
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

    op.execute("DROP TABLE IF EXISTS tmp_lab_result_table_events")


def downgrade() -> None:
    # Data folding is intentionally not reversible.
    pass
