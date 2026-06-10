from types import SimpleNamespace

from app.services.agent import ClaudeCodeExitError, ClaudeCodeTimeoutError
from app.services.extraction_service import ExtractionService
from app.services.extraction_strategy import (
    CLAUDE_CODE_QUEUE,
    DEFAULT_EXTRACTION_QUEUE,
    extraction_queue_for_job,
    job_uses_claude_code,
    with_default_extraction_strategy,
)
from app.services.schema_field_planner import plan_schema_fields


def test_job_uses_claude_code_from_input_json():
    assert job_uses_claude_code(
        job_type="project_crf",
        input_json={"extractor_strategy": "claude-code"},
    )


def test_non_schema_job_does_not_use_claude_code():
    assert not job_uses_claude_code(
        job_type="mock",
        input_json={"extractor_strategy": "claude_code"},
    )


def test_with_default_strategy_adds_global_claude_code(monkeypatch):
    monkeypatch.setattr("core.config.config.EACY_EXTRACTION_STRATEGY", "claude_code")

    payload = with_default_extraction_strategy(
        job_type="patient_ehr",
        input_json={"source": "test"},
    )

    assert payload == {"source": "test", "extractor_strategy": "claude_code"}


def test_extraction_queue_for_claude_code_job():
    job = SimpleNamespace(job_type="targeted_schema", input_json={"extractor_strategy": "claude_code"})
    assert extraction_queue_for_job(job) == CLAUDE_CODE_QUEUE


def test_extraction_queue_for_regular_job():
    job = SimpleNamespace(job_type="patient_ehr", input_json={"extractor_strategy": "llm"})
    assert extraction_queue_for_job(job) == DEFAULT_EXTRACTION_QUEUE


def test_extraction_service_classifies_claude_code_errors():
    service = ExtractionService()

    assert service._classify_extraction_error(ClaudeCodeTimeoutError("timeout")) == "llm_timeout"
    assert service._classify_extraction_error(ClaudeCodeExitError("exit")) == "claude_code_exit_error"


def test_schema_field_planner_exports_component_metadata_and_boolean_json_type():
    fields = plan_schema_fields(
        {
            "properties": {
                "crf": {
                    "type": "object",
                    "properties": {
                        "baseline": {
                            "type": "object",
                            "properties": {
                                "symptoms": {
                                    "type": "array",
                                    "items": {"type": "string", "enum": ["腹痛", "黄疸"]},
                                    "x-display": "checkbox",
                                },
                                "confirmed": {
                                    "type": "boolean",
                                    "x-display": "checkbox",
                                },
                            }
                        }
                    }
                }
            }
        }
    )

    by_key = {field.field_key: field for field in fields}
    assert by_key["symptoms"].display_type == "checkbox"
    assert by_key["symptoms"].value_type == "json"
    assert by_key["symptoms"].options == ["腹痛", "黄疸"]
    assert by_key["confirmed"].value_type == "json"
