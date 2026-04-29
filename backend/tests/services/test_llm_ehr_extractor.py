from app.services.llm_ehr_extractor import LlmEhrExtractor
from app.services.schema_field_planner import SchemaField


def test_llm_ehr_extractor_normalizes_records_to_flat_fields():
    extractor = LlmEhrExtractor()
    state = {
        "document_id": "document-1",
        "field_specs": [
            {
                "field_key": "患者姓名",
                "field_path": "基本信息.人口学情况.身份信息.患者姓名",
                "field_title": "患者姓名",
                "value_type": "text",
                "record_form_key": "基本信息.人口学情况",
            },
            {
                "field_key": "联系电话",
                "field_path": "基本信息.人口学情况.联系方式.联系电话",
                "field_title": "联系电话",
                "value_type": "text",
                "record_form_key": "基本信息.人口学情况",
            },
        ],
        "raw_output": {
            "records": [
                {
                    "form_path": "基本信息.人口学情况",
                    "record": {
                        "身份信息": {"患者姓名": "张三"},
                        "联系方式": [{"联系电话": "13800138001"}],
                    },
                    "confidence": 0.91,
                    "evidences": [{"source_type": "line", "source_id": "p1-l1", "quote_text": "姓名：张三 电话：13800138001"}],
                }
            ]
        },
    }

    result = extractor._node_normalize(state)

    assert result["fields_output"] == [
        {
            "field_key": "患者姓名",
            "field_path": "基本信息.人口学情况.身份信息.患者姓名",
            "field_title": "患者姓名",
            "record_form_key": "基本信息.人口学情况",
            "value_type": "text",
            "value_text": "张三",
            "confidence": 0.91,
            "quote_text": "姓名：张三 电话：13800138001",
            "evidences": [{"source_type": "line", "source_id": "p1-l1", "quote_text": "姓名：张三 电话：13800138001"}],
            "evidence_type": "llm_extract",
        },
        {
            "field_key": "联系电话",
            "field_path": "基本信息.人口学情况.联系方式.0.联系电话",
            "field_title": "联系电话",
            "record_form_key": "基本信息.人口学情况",
            "value_type": "text",
            "value_text": "13800138001",
            "confidence": 0.91,
            "quote_text": "姓名：张三 电话：13800138001",
            "evidences": [{"source_type": "line", "source_id": "p1-l1", "quote_text": "姓名：张三 电话：13800138001"}],
            "evidence_type": "llm_extract",
        },
    ]


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
        "ocr_evidence_units": [{"source_type": "line", "source_id": "p1-l1", "page_no": 1, "text": "性别：男"}],
    }
    prepared = extractor._node_prepare(state)

    assert "records" in prepared["system_prompt"]
    assert "不要自行决定数据库是否覆盖 current" in prepared["system_prompt"]
    assert "基本信息.人口学情况.身份信息.性别" in prepared["system_prompt"]
    assert "性别：男" in prepared["user_prompt"]
    assert "p1-l1" in prepared["user_prompt"]


def test_llm_ehr_extractor_validation_retries_parse_error(monkeypatch):
    extractor = LlmEhrExtractor()
    calls = iter(["不是 JSON", '{"fields":[{"field_path":"基本信息.人口学情况.身份信息.性别","value_type":"text","value_text":"男性","quote_text":"性别：男性"}]}'])

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


def test_llm_ehr_extractor_validates_structure_slots_dates_and_evidence():
    extractor = LlmEhrExtractor()
    field_specs = [
        {
            "field_key": "日期",
            "field_path": "病程.入院记录.入院日期",
            "field_title": "入院日期",
            "value_type": "date",
            "record_form_key": "病程.入院记录",
            "options": None,
        }
    ]

    errors, warnings, status_hint = extractor._validate_raw_output(
        {
            "fields": [
                {
                    "field_path": "病程.入院记录.入院日期",
                    "value_type": "date",
                    "value_text": "2026年4月10日",
                    "quote_text": "不存在证据",
                }
            ]
        },
        field_specs,
        text="入院日期：2026年4月10日",
    )

    assert any("must use value_date" in error for error in errors)
    assert any("YYYY-MM-DD" in error for error in errors)
    assert any("OCR substring" in warning for warning in warnings)
    assert status_hint is None


def test_llm_ehr_extractor_validates_record_form_path():
    extractor = LlmEhrExtractor()
    errors, warnings, status_hint = extractor._validate_raw_output(
        {"records": [{"form_path": "错误.表单", "record": {"姓名": "张三"}}]},
        [
            {
                "field_key": "姓名",
                "field_path": "基本信息.人口学情况.姓名",
                "field_title": "姓名",
                "value_type": "text",
                "record_form_key": "基本信息.人口学情况",
                "options": None,
            }
        ],
        text="姓名：张三",
    )

    assert any("form_path" in error for error in errors)
    assert warnings == []
    assert status_hint is None


def test_llm_ehr_extractor_allows_empty_output_as_valid_empty():
    extractor = LlmEhrExtractor()

    errors, warnings, status_hint = extractor._validate_raw_output({}, [], text="无相关内容")

    assert errors == []
    assert warnings == ["No extractable records[] or fields[] returned"]
    assert status_hint == "valid_empty"


def test_llm_ehr_extractor_quote_mismatch_is_warning_not_error():
    extractor = LlmEhrExtractor()

    errors, warnings, status_hint = extractor._validate_raw_output(
        {
            "records": [
                {
                    "form_path": "基本信息.人口学情况",
                    "record": {"姓名": "张三"},
                    "evidences": [{"quote_text": "整理后的证据"}],
                }
            ]
        },
        [
            {
                "field_key": "姓名",
                "field_path": "基本信息.人口学情况.姓名",
                "field_title": "姓名",
                "value_type": "text",
                "record_form_key": "基本信息.人口学情况",
                "options": None,
            }
        ],
        text="姓名：张三",
    )

    assert errors == []
    assert any("OCR substring" in warning for warning in warnings)
    assert status_hint is None
