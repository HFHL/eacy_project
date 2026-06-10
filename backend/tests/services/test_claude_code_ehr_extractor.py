import pytest

from app.services.agent import ClaudeCodeEhrExtractor, ClaudeCodeRunResult, ClaudeCodeValidationError
from app.services.schema_field_planner import SchemaField


class FakeRunner:
    def __init__(self, outputs):
        self.outputs = list(outputs)
        self.calls = []

    def run_extraction(self, **kwargs):
        self.calls.append(kwargs)
        parsed = self.outputs.pop(0)
        return ClaudeCodeRunResult(
            parsed_result=parsed,
            wrapper_json={"usage": {"input_tokens": 1, "output_tokens": 2}, "session_id": "s1"},
            stdout='{"result": {}}',
            stderr="",
            exit_code=0,
            duration_ms=10,
            workspace_path="/tmp/work",
            result_source="stdout_result_object",
            prompt="prompt",
            command=["claude", "-p", "prompt"],
            input_hashes={"input/ocr_text.md": "hash"},
        )


def _field():
    return SchemaField(
        field_key="诊断",
        field_path="诊断记录.诊断.诊断名称",
        field_title="诊断名称",
        value_type="text",
        options=None,
        record_form_key="诊断记录.诊断",
    )


def _multiselect_field():
    return SchemaField(
        field_key="症状",
        field_path="症状记录.主诉.症状",
        field_title="症状",
        value_type="json",
        options=["腹痛", "黄疸", "消瘦"],
        record_form_key="症状记录.主诉",
        display_type="checkbox",
        schema_type="array",
    )


def _drug_name_field():
    return SchemaField(
        field_key="药物名称",
        field_path="治疗情况.药物治疗.药物名称",
        field_title="药物名称",
        value_type="text",
        options=None,
        record_form_key="治疗情况.药物治疗",
    )


def test_claude_code_ehr_extractor_normalizes_valid_fields():
    extractor = ClaudeCodeEhrExtractor(
        runner=FakeRunner(
            [
                {
                    "fields": [
                        {
                            "field_path": "诊断记录.诊断.诊断名称",
                            "value_type": "text",
                            "value_text": "胰腺癌",
                            "confidence": 0.91,
                            "quote_text": "诊断：胰腺癌",
                        }
                    ]
                }
            ]
        )
    )

    result = extractor.extract(
        text="诊断：胰腺癌",
        fields=[_field()],
        schema_json={"properties": {}},
        document_id="doc-1",
    )

    assert result["extractor"] == "ClaudeCodeEhrExtractor"
    assert result["validation_status"] == "valid"
    assert result["fields"][0]["field_path"] == "诊断记录.诊断.诊断名称"
    assert result["fields"][0]["value_text"] == "胰腺癌"


def test_claude_code_ehr_extractor_accepts_multiselect_value_json():
    runner = FakeRunner(
        [
            {
                "fields": [
                    {
                        "field_path": "症状记录.主诉.症状",
                        "value_type": "json",
                        "value_json": ["腹痛", "黄疸"],
                        "confidence": 0.88,
                        "quote_text": "腹痛伴黄疸",
                    }
                ]
            }
        ]
    )
    extractor = ClaudeCodeEhrExtractor(runner=runner)

    result = extractor.extract(
        text="腹痛伴黄疸",
        fields=[_multiselect_field()],
        schema_json={"properties": {}},
        document_id="doc-1",
    )

    assert runner.calls[0]["field_specs"][0]["display_type"] == "checkbox"
    assert result["validation_status"] == "valid"
    assert result["fields"][0]["value_json"] == ["腹痛", "黄疸"]


def test_claude_code_ehr_extractor_canonicalizes_indexed_field_path():
    runner = FakeRunner(
        [
            {
                "fields": [
                    {
                        "field_path": "治疗情况.药物治疗.3.药物名称",
                        "value_type": "text",
                        "value_text": "头孢呋辛",
                        "confidence": 0.88,
                        "quote_text": "头孢呋辛",
                    }
                ]
            }
        ]
    )
    extractor = ClaudeCodeEhrExtractor(runner=runner)

    result = extractor.extract(
        text="头孢呋辛",
        fields=[_drug_name_field()],
        schema_json={"properties": {}},
        document_id="doc-1",
    )

    assert result["validation_status"] == "valid"
    assert result["fields"][0]["field_path"] == "治疗情况.药物治疗.药物名称"
    assert result["fields"][0]["record_form_key"] == "治疗情况.药物治疗"
    assert result["fields"][0]["repeat_index"] == 3
    assert result["fields"][0]["value_text"] == "头孢呋辛"


def test_claude_code_ehr_extractor_repairs_once_after_invalid_output():
    runner = FakeRunner(
        [
            {
                "fields": [
                    {
                        "field_path": "不存在.字段",
                        "value_type": "text",
                        "value_text": "胰腺癌",
                        "confidence": 0.9,
                    }
                ]
            },
            {
                "fields": [
                    {
                        "field_path": "诊断记录.诊断.诊断名称",
                        "value_type": "text",
                        "value_text": "胰腺癌",
                        "confidence": 0.9,
                        "quote_text": "诊断：胰腺癌",
                    }
                ]
            },
        ]
    )
    extractor = ClaudeCodeEhrExtractor(runner=runner)

    result = extractor.extract(
        text="诊断：胰腺癌",
        fields=[_field()],
        schema_json={"properties": {}},
        document_id="doc-1",
    )

    assert len(runner.calls) == 2
    assert runner.calls[1]["repair_errors"]
    assert result["attempt_count"] == 2
    assert result["validation_log"][0]["status"] == "invalid"
    assert result["validation_log"][1]["status"] == "valid"


def test_claude_code_ehr_extractor_requires_confidence():
    extractor = ClaudeCodeEhrExtractor(
        runner=FakeRunner(
            [
                {
                    "fields": [
                        {
                            "field_path": "诊断记录.诊断.诊断名称",
                            "value_type": "text",
                            "value_text": "胰腺癌",
                        }
                    ]
                },
                {
                    "fields": [
                        {
                            "field_path": "诊断记录.诊断.诊断名称",
                            "value_type": "text",
                            "value_text": "胰腺癌",
                        }
                    ]
                },
            ]
        )
    )

    with pytest.raises(ClaudeCodeValidationError):
        extractor.extract(
            text="诊断：胰腺癌",
            fields=[_field()],
            schema_json={"properties": {}},
            document_id="doc-1",
        )
