"""Retarget field values attached to mismatched records.

Revision ID: 20260611_0200
Revises: 20260611_0100
Create Date: 2026-06-11 02:00:00.000000
"""

from alembic import op


revision = "20260611_0200"
down_revision = "20260611_0100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Some historical writes trusted a stale record_instance_id from the UI.
    # That left values such as 检验检查.血常规.* attached to unrelated records
    # like 费用信息.住院病案首页.  The field path is the source of truth for the
    # target form/repeat row, so rebuild that mapping and retarget events/current
    # values to matching record_instances.
    op.execute(
        """
        CREATE TEMP TABLE tmp_field_record_target_specs ON COMMIT DROP AS
        WITH source_rows AS (
            SELECT DISTINCT fcv.context_id, fcv.field_path
            FROM field_current_values fcv
            JOIN record_instances ri ON ri.id = fcv.record_instance_id
            WHERE ri.form_key IS NOT NULL
              AND fcv.field_path NOT LIKE ri.form_key || '.%'
              AND fcv.field_path <> ri.form_key
            UNION
            SELECT DISTINCT fve.context_id, fve.field_path
            FROM field_value_events fve
            JOIN record_instances ri ON ri.id = fve.record_instance_id
            WHERE ri.form_key IS NOT NULL
              AND fve.field_path NOT LIKE ri.form_key || '.%'
              AND fve.field_path <> ri.form_key
        ),
        parsed AS (
            SELECT
                sr.context_id,
                parsed_parts.non_numeric_parts,
                parsed_parts.first_index
            FROM source_rows sr
            CROSS JOIN LATERAL (
                SELECT
                    ARRAY(
                        SELECT part
                        FROM unnest(string_to_array(sr.field_path, '.')) WITH ORDINALITY AS path(part, ord)
                        WHERE part <> '' AND part !~ '^[0-9]+$'
                        ORDER BY ord
                    ) AS non_numeric_parts,
                    (
                        SELECT part::int
                        FROM unnest(string_to_array(sr.field_path, '.')) WITH ORDINALITY AS path(part, ord)
                        WHERE part ~ '^[0-9]+$'
                        ORDER BY ord
                        LIMIT 1
                    ) AS first_index
            ) parsed_parts
            WHERE array_length(parsed_parts.non_numeric_parts, 1) >= 2
        )
        SELECT DISTINCT
            context_id,
            non_numeric_parts[1] || '.' || non_numeric_parts[2] AS target_form_key,
            COALESCE(first_index, 0) AS target_repeat_index
        FROM parsed
        """
    )
    op.execute(
        """
        INSERT INTO record_instances (
            id,
            context_id,
            group_key,
            group_title,
            form_key,
            form_title,
            repeat_index,
            instance_label,
            anchor_json,
            source_document_id,
            created_by_run_id,
            review_status,
            created_at,
            updated_at
        )
        SELECT
            gen_random_uuid(),
            specs.context_id,
            split_part(specs.target_form_key, '.', 1),
            split_part(specs.target_form_key, '.', 1),
            specs.target_form_key,
            split_part(specs.target_form_key, '.', 2),
            specs.target_repeat_index,
            CASE
                WHEN specs.target_repeat_index = 0 THEN split_part(specs.target_form_key, '.', 2)
                ELSE split_part(specs.target_form_key, '.', 2) || '_' || (specs.target_repeat_index + 1)::text
            END,
            json_build_object(
                'version', 1,
                'repaired_from', '20260611_0200_retarget_mismatched_field_records',
                'form_key', specs.target_form_key,
                'repeat_index', specs.target_repeat_index
            ),
            NULL,
            NULL,
            'unreviewed',
            NOW(),
            NOW()
        FROM tmp_field_record_target_specs specs
        WHERE NOT EXISTS (
            SELECT 1
            FROM record_instances existing
            WHERE existing.context_id = specs.context_id
              AND existing.form_key = specs.target_form_key
              AND existing.repeat_index = specs.target_repeat_index
        )
        ON CONFLICT ON CONSTRAINT uk_record_instance DO NOTHING
        """
    )
    op.execute(
        """
        CREATE TEMP TABLE tmp_current_record_retargets ON COMMIT DROP AS
        WITH mismatched AS (
            SELECT
                fcv.id AS current_value_id,
                fcv.context_id,
                fcv.record_instance_id AS old_record_instance_id,
                fcv.field_path,
                parsed_parts.non_numeric_parts[1] || '.' || parsed_parts.non_numeric_parts[2] AS target_form_key,
                COALESCE(parsed_parts.first_index, 0) AS target_repeat_index
            FROM field_current_values fcv
            JOIN record_instances ri ON ri.id = fcv.record_instance_id
            CROSS JOIN LATERAL (
                SELECT
                    ARRAY(
                        SELECT part
                        FROM unnest(string_to_array(fcv.field_path, '.')) WITH ORDINALITY AS path(part, ord)
                        WHERE part <> '' AND part !~ '^[0-9]+$'
                        ORDER BY ord
                    ) AS non_numeric_parts,
                    (
                        SELECT part::int
                        FROM unnest(string_to_array(fcv.field_path, '.')) WITH ORDINALITY AS path(part, ord)
                        WHERE part ~ '^[0-9]+$'
                        ORDER BY ord
                        LIMIT 1
                    ) AS first_index
            ) parsed_parts
            WHERE ri.form_key IS NOT NULL
              AND fcv.field_path NOT LIKE ri.form_key || '.%'
              AND fcv.field_path <> ri.form_key
              AND array_length(parsed_parts.non_numeric_parts, 1) >= 2
        )
        SELECT
            mismatched.*,
            target.id AS target_record_instance_id
        FROM mismatched
        JOIN record_instances target
          ON target.context_id = mismatched.context_id
         AND target.form_key = mismatched.target_form_key
         AND target.repeat_index = mismatched.target_repeat_index
        WHERE mismatched.old_record_instance_id <> target.id
        """
    )
    op.execute(
        """
        CREATE TEMP TABLE tmp_event_record_retargets ON COMMIT DROP AS
        WITH mismatched AS (
            SELECT
                fve.id AS event_id,
                fve.context_id,
                fve.record_instance_id AS old_record_instance_id,
                fve.field_path,
                parsed_parts.non_numeric_parts[1] || '.' || parsed_parts.non_numeric_parts[2] AS target_form_key,
                COALESCE(parsed_parts.first_index, 0) AS target_repeat_index
            FROM field_value_events fve
            JOIN record_instances ri ON ri.id = fve.record_instance_id
            CROSS JOIN LATERAL (
                SELECT
                    ARRAY(
                        SELECT part
                        FROM unnest(string_to_array(fve.field_path, '.')) WITH ORDINALITY AS path(part, ord)
                        WHERE part <> '' AND part !~ '^[0-9]+$'
                        ORDER BY ord
                    ) AS non_numeric_parts,
                    (
                        SELECT part::int
                        FROM unnest(string_to_array(fve.field_path, '.')) WITH ORDINALITY AS path(part, ord)
                        WHERE part ~ '^[0-9]+$'
                        ORDER BY ord
                        LIMIT 1
                    ) AS first_index
            ) parsed_parts
            WHERE ri.form_key IS NOT NULL
              AND fve.field_path NOT LIKE ri.form_key || '.%'
              AND fve.field_path <> ri.form_key
              AND array_length(parsed_parts.non_numeric_parts, 1) >= 2
        )
        SELECT
            mismatched.*,
            target.id AS target_record_instance_id
        FROM mismatched
        JOIN record_instances target
          ON target.context_id = mismatched.context_id
         AND target.form_key = mismatched.target_form_key
         AND target.repeat_index = mismatched.target_repeat_index
        WHERE mismatched.old_record_instance_id <> target.id
        """
    )
    op.execute(
        """
        UPDATE field_value_events event
           SET record_instance_id = target.target_record_instance_id
          FROM tmp_event_record_retargets target
         WHERE event.id = target.event_id
        """
    )
    op.execute(
        """
        DELETE FROM field_current_values current_value
        USING tmp_current_record_retargets target
        JOIN field_current_values existing
          ON existing.context_id = target.context_id
         AND existing.record_instance_id = target.target_record_instance_id
         AND existing.field_path = target.field_path
         AND existing.id <> target.current_value_id
        WHERE current_value.id = target.current_value_id
        """
    )
    op.execute(
        """
        UPDATE field_current_values current_value
           SET record_instance_id = target.target_record_instance_id,
               updated_at = NOW()
          FROM tmp_current_record_retargets target
         WHERE current_value.id = target.current_value_id
           AND current_value.record_instance_id <> target.target_record_instance_id
        """
    )
    op.execute("DROP TABLE IF EXISTS tmp_event_record_retargets")
    op.execute("DROP TABLE IF EXISTS tmp_current_record_retargets")
    op.execute("DROP TABLE IF EXISTS tmp_field_record_target_specs")


def downgrade() -> None:
    # Data retargeting is intentionally not reversible.
    pass
