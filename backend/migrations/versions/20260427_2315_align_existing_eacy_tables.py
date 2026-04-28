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

    op.execute("update patients set department = department_name where department is null and department_name is not null")
    op.execute("update patients set main_diagnosis = diagnosis where main_diagnosis is null and diagnosis is not null")
    op.execute("update patients set doctor_name = attending_doctor_name where doctor_name is null and attending_doctor_name is not null")
    op.execute("update documents set original_filename = file_name where original_filename is null and file_name is not null")
    op.execute("update documents set file_ext = file_type where file_ext is null and file_type is not null")
    op.execute("update documents set storage_path = file_path where storage_path is null and file_path is not null")
    op.execute("update documents set doc_type = document_type where doc_type is null and document_type is not null")
    op.execute("update documents set doc_subtype = document_sub_type where doc_subtype is null and document_sub_type is not null")
    op.execute("update documents set effective_at = document_effective_date where effective_at is null and document_effective_date is not null")
    op.execute("update documents set ocr_text = parsed_content where ocr_text is null and parsed_content is not null")
    op.execute("update documents set metadata_json = parsed_data where metadata_json is null and parsed_data is not null")
    op.execute("update project_patients set enroll_no = subject_id where enroll_no is null and subject_id is not null")
    op.execute("update project_patients set enrolled_at = enrollment_date where enrolled_at is null and enrollment_date is not null")


def downgrade():
    pass
