"""align existing eacy tables with minimal schema

Revision ID: 20260427_2315
Revises: 20260427_2245
Create Date: 2026-04-27 23:15:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260427_2315"
down_revision = "20260427_2245"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {column["name"] for column in inspector.get_columns(table_name)}


def _add_missing(table_name: str, column: sa.Column) -> None:
    if column.name not in _columns(table_name):
        op.add_column(table_name, column)


def _copy_if_columns_exist(table_name: str, target: str, source: str) -> None:
    columns = _columns(table_name)
    if target in columns and source in columns:
        op.execute(
            f"update {table_name} set {target} = {source} "
            f"where {target} is null and {source} is not null"
        )


def upgrade():
    _add_missing("patients", sa.Column("department", sa.String(length=100), nullable=True))
    _add_missing("patients", sa.Column("main_diagnosis", sa.String(length=500), nullable=True))
    _add_missing("patients", sa.Column("doctor_name", sa.String(length=100), nullable=True))
    _add_missing("patients", sa.Column("extra_json", sa.JSON(), nullable=True))
    _add_missing("patients", sa.Column("deleted_at", sa.DateTime(), nullable=True))

    _add_missing("documents", sa.Column("patient_id", sa.Uuid(as_uuid=False), nullable=True))
    _add_missing("documents", sa.Column("original_filename", sa.String(length=255), nullable=True))
    _add_missing("documents", sa.Column("file_ext", sa.String(length=20), nullable=True))
    _add_missing("documents", sa.Column("mime_type", sa.String(length=100), nullable=True))
    _add_missing("documents", sa.Column("storage_provider", sa.String(length=50), nullable=True))
    _add_missing("documents", sa.Column("storage_path", sa.Text(), nullable=True))
    _add_missing("documents", sa.Column("file_url", sa.Text(), nullable=True))
    _add_missing("documents", sa.Column("ocr_status", sa.String(length=50), nullable=True))
    _add_missing("documents", sa.Column("ocr_text", sa.Text(), nullable=True))
    _add_missing("documents", sa.Column("ocr_payload_json", sa.JSON(), nullable=True))
    _add_missing("documents", sa.Column("meta_status", sa.String(length=50), nullable=True))
    _add_missing("documents", sa.Column("metadata_json", sa.JSON(), nullable=True))
    _add_missing("documents", sa.Column("doc_type", sa.String(length=100), nullable=True))
    _add_missing("documents", sa.Column("doc_subtype", sa.String(length=100), nullable=True))
    _add_missing("documents", sa.Column("doc_title", sa.String(length=255), nullable=True))
    _add_missing("documents", sa.Column("effective_at", sa.DateTime(), nullable=True))
    _add_missing("documents", sa.Column("archived_at", sa.DateTime(), nullable=True))
    _add_missing("documents", sa.Column("updated_at", sa.DateTime(), nullable=True))

    _add_missing("extraction_jobs", sa.Column("job_type", sa.String(length=50), nullable=True))
    _add_missing("extraction_jobs", sa.Column("priority", sa.Integer(), nullable=True))
    _add_missing("extraction_jobs", sa.Column("patient_id", sa.Uuid(as_uuid=False), nullable=True))
    _add_missing("extraction_jobs", sa.Column("document_id", sa.Uuid(as_uuid=False), nullable=True))
    _add_missing("extraction_jobs", sa.Column("project_patient_id", sa.Uuid(as_uuid=False), nullable=True))
    _add_missing("extraction_jobs", sa.Column("context_id", sa.Uuid(as_uuid=False), nullable=True))
    _add_missing("extraction_jobs", sa.Column("schema_version_id", sa.Uuid(as_uuid=False), nullable=True))
    _add_missing("extraction_jobs", sa.Column("target_form_key", sa.String(length=100), nullable=True))
    _add_missing("extraction_jobs", sa.Column("input_json", sa.JSON(), nullable=True))
    _add_missing("extraction_jobs", sa.Column("progress", sa.Integer(), nullable=True))
    _add_missing("extraction_jobs", sa.Column("error_message", sa.Text(), nullable=True))
    _add_missing("extraction_jobs", sa.Column("requested_by", sa.Uuid(as_uuid=False), nullable=True))
    _add_missing("extraction_jobs", sa.Column("finished_at", sa.DateTime(), nullable=True))
    _add_missing("extraction_jobs", sa.Column("created_at", sa.DateTime(), nullable=True))
    _add_missing("extraction_jobs", sa.Column("updated_at", sa.DateTime(), nullable=True))

    _add_missing("project_patients", sa.Column("enroll_no", sa.String(length=100), nullable=True))
    _add_missing("project_patients", sa.Column("enrolled_at", sa.DateTime(), nullable=True))
    _add_missing("project_patients", sa.Column("withdrawn_at", sa.DateTime(), nullable=True))
    _add_missing("project_patients", sa.Column("extra_json", sa.JSON(), nullable=True))
    _add_missing("project_patients", sa.Column("updated_at", sa.DateTime(), nullable=True))

    _copy_if_columns_exist("patients", "department", "department_name")
    _copy_if_columns_exist("patients", "main_diagnosis", "diagnosis")
    _copy_if_columns_exist("patients", "doctor_name", "attending_doctor_name")
    _copy_if_columns_exist("documents", "original_filename", "file_name")
    _copy_if_columns_exist("documents", "file_ext", "file_type")
    _copy_if_columns_exist("documents", "storage_path", "file_path")
    _copy_if_columns_exist("documents", "doc_type", "document_type")
    _copy_if_columns_exist("documents", "doc_subtype", "document_sub_type")
    _copy_if_columns_exist("documents", "effective_at", "document_effective_date")
    _copy_if_columns_exist("documents", "ocr_text", "parsed_content")
    _copy_if_columns_exist("documents", "metadata_json", "parsed_data")
    _copy_if_columns_exist("project_patients", "enroll_no", "subject_id")
    _copy_if_columns_exist("project_patients", "enrolled_at", "enrollment_date")


def downgrade():
    pass
