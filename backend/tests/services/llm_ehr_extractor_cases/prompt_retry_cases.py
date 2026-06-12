from .common import *

def test_llm_ehr_extractor_builds_current_design_prompt():
    extractor = LlmEhrExtractor()
    fields = [
        SchemaField(
            field_key="性别",
            field_path="基本信息.人口学情况.身份信息.性别",
            field_title="性别",
            value_type="text",
            options=["男", "女"],
            record_form_key="基本信息.人口学情况",
        )
    ]

    state = {
        "text": "性别：男",
        "fields": fields,
        "document_id": "doc-1",
        "document_meta": {},
        "reading_units": [{"source_type": "line", "source_id": "p1-l1", "page_no": 1, "text": "性别：男"}],
        "ocr_evidence_units": [{"source_type": "line", "source_id": "p1-l1", "page_no": 1, "text": "性别：男"}],
    }
    prepared = extractor._node_prepare(state)

    assert "records" in prepared["system_prompt"]
    assert "不要自行决定数据库是否覆盖 current" in prepared["system_prompt"]
    assert "基本信息.人口学情况.身份信息.性别" in prepared["system_prompt"]
    assert "reading_units" in prepared["user_prompt"]
    assert "性别：男" in prepared["user_prompt"]
    assert "p1-l1" in prepared["user_prompt"]


def test_llm_ehr_extractor_validation_retries_parse_error(monkeypatch):
    extractor = LlmEhrExtractor()
    calls = iter(
        [
            "不是 JSON",
            (
                '{"fields":[{"field_path":"基本信息.人口学情况.身份信息.性别",'
                '"value_type":"text","value_text":"男性","confidence":0.9,'
                '"evidences":[{"quote_text":"性别：男性"}]}]}'
            ),
        ]
    )

    def fake_call_llm(state):
        content = next(calls)
        attempt = int(state.get("attempt") or 0) + 1
        try:
            return {"attempt": attempt, "raw_content": content, "raw_output": extractor._parse_json_content(content), "parse_error": None}
        except Exception as exc:
            return {"attempt": attempt, "raw_content": content, "raw_output": None, "parse_error": str(exc)}

    monkeypatch.setattr(extractor, "_node_call_llm", fake_call_llm)
    monkeypatch.setattr("core.config.config.OPENAI_API_KEY", "test-key")

    class FakeGraph:
        def invoke(self, state):
            state.update(extractor._node_prepare(state))
            while True:
                state.update(extractor._node_call_llm(state))
                state.update(extractor._node_validate(state))
                if extractor._route_after_validate(state) != "retry":
                    break
            state.update(extractor._node_normalize(state))
            state.update(extractor._node_resolve_merge(state))
            return state

    monkeypatch.setattr(extractor, "_build_graph", lambda: FakeGraph())

    result = extractor.extract(
        text="性别：男性",
        document_id="doc-1",
        fields=[
            SchemaField(
                field_key="性别",
                field_path="基本信息.人口学情况.身份信息.性别",
                field_title="性别",
                value_type="text",
                options=["男", "女"],
                record_form_key="基本信息.人口学情况",
            )
        ],
    )

    assert result["attempt_count"] == 2
    assert result["validation_log"][0]["status"] == "invalid"
    assert result["validation_log"][1]["status"] == "valid"
    assert result["fields"][0]["value_text"] == "男"


def test_llm_ehr_extractor_discards_invalid_items_after_final_attempt():
    extractor = LlmEhrExtractor()
    field_specs = [
        {
            "field_key": "性别",
            "field_path": "基本信息.人口学情况.身份信息.性别",
            "field_title": "性别",
            "value_type": "text",
            "record_form_key": "基本信息.人口学情况",
            "options": ["男", "女"],
        }
    ]
    state = {
        "text": "性别：男",
        "field_specs": field_specs,
        "raw_output": {
            "fields": [
                {
                    "field_path": "基本信息.人口学情况.身份信息.性别",
                    "value_type": "text",
                    "value_text": "男",
                    "confidence": 0.9,
                    "evidences": [{"quote_text": "性别：男"}],
                },
                {
                    "field_path": "基本信息.人口学情况.身份信息.未知字段",
                    "value_type": "text",
                    "value_text": "坏值",
                    "confidence": 0.8,
                    "evidences": [{"quote_text": "性别：男"}],
                },
            ]
        },
        "attempt": 3,
        "max_attempts": 3,
        "validation_log": [],
    }

    update = extractor._node_validate(state)

    assert update["validation_status"] == "valid"
    assert update["validation_errors"] == []
    assert len(update["raw_output"]["fields"]) == 1
    assert update["raw_output"]["fields"][0]["field_path"] == "基本信息.人口学情况.身份信息.性别"
    assert "Discarded 1 invalid extraction item" in update["validation_warnings"][0]
    assert update["validation_log"][-1]["discarded_items"][0]["index"] == 1


def test_llm_ehr_extractor_batches_fields_by_record_form():
    extractor = LlmEhrExtractor()
    fields = [
        SchemaField(field_key="姓名", field_path="基本信息.人口学情况.姓名", field_title="姓名", value_type="text", record_form_key="基本信息.人口学情况"),
        SchemaField(field_key="性别", field_path="基本信息.人口学情况.性别", field_title="性别", value_type="text", record_form_key="基本信息.人口学情况"),
        SchemaField(field_key="诊断", field_path="诊断记录.诊断记录.诊断", field_title="诊断", value_type="text", record_form_key="诊断记录.诊断记录"),
    ]

    batches = extractor._field_batches(fields, batch_size=2)

    assert [[field.field_key for field in batch] for batch in batches] == [["姓名", "性别"], ["诊断"]]
