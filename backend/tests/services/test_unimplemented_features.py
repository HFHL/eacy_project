import pytest
from fastapi import HTTPException

from app.services.document_upload_validation import validate_upload_file
from app.services.schema_field_planner import plan_schema_fields


def test_validate_upload_file_rejects_legacy_doc():
    with pytest.raises(HTTPException) as exc:
        validate_upload_file(filename="report.doc", content_type="application/msword", size=1024)
    assert exc.value.status_code == 400
    assert ".doc" in str(exc.value.detail)


def test_validate_upload_file_rejects_oversized_file(monkeypatch):
    monkeypatch.setattr(
        "app.services.document_upload_validation.config.DOCUMENT_MAX_FILE_SIZE_BYTES",
        100 * 1024 * 1024,
    )
    with pytest.raises(HTTPException) as exc:
        validate_upload_file(
            filename="report.pdf",
            content_type="application/pdf",
            size=100 * 1024 * 1024 + 1,
        )
    assert exc.value.status_code == 413
    assert "100MB" in str(exc.value.detail)


def test_validate_upload_file_accepts_pdf():
    validate_upload_file(filename="report.pdf", content_type="application/pdf", size=1024)


def test_plan_schema_fields_skips_x_skip_extraction():
    schema_json = {
        "type": "object",
        "properties": {
            "folderA": {
                "type": "object",
                "properties": {
                    "formA": {
                        "type": "object",
                        "properties": {
                            "includedField": {"type": "string", "x-display-name": "保留字段"},
                            "skippedField": {
                                "type": "string",
                                "x-display-name": "跳过字段",
                                "x-skip-extraction": True,
                            },
                        },
                    }
                },
            }
        },
    }

    fields = plan_schema_fields(schema_json)
    paths = {field.field_path for field in fields}

    assert "folderA.formA.includedField" in paths
    assert "folderA.formA.skippedField" not in paths
