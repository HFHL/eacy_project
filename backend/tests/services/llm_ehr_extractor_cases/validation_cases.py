from .common import *

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
    assert any("confidence is required" in error for error in errors)
    assert any("evidences is required" in error for error in errors)
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


def test_llm_ehr_extractor_missing_source_id_is_error_when_units_available():
    extractor = LlmEhrExtractor()

    errors, warnings, _ = extractor._validate_raw_output(
        {
            "fields": [
                {
                    "field_path": "基本信息.人口学情况.身份信息.性别",
                    "value_type": "text",
                    "value_text": "男",
                    "evidences": [{"quote_text": "性别：男"}],
                    "confidence": 0.9,
                }
            ]
        },
        [
            {
                "field_key": "性别",
                "field_path": "基本信息.人口学情况.身份信息.性别",
                "field_title": "性别",
                "value_type": "text",
                "record_form_key": "基本信息.人口学情况",
                "options": ["男", "女"],
            }
        ],
        text="性别：男",
        require_source_id=True,
    )

    assert any("missing source_id" in error for error in errors)
    assert warnings == []


def test_llm_ehr_extractor_rejects_unknown_source_id():
    extractor = LlmEhrExtractor()

    errors, warnings, _ = extractor._validate_raw_output(
        {
            "fields": [
                {
                    "field_path": "基本信息.人口学情况.身份信息.性别",
                    "value_type": "text",
                    "value_text": "男",
                    "confidence": 0.9,
                    "evidences": [{"source_type": "line", "source_id": "p9-l9", "quote_text": "性别：男"}],
                }
            ]
        },
        [
            {
                "field_key": "性别",
                "field_path": "基本信息.人口学情况.身份信息.性别",
                "field_title": "性别",
                "value_type": "text",
                "record_form_key": "基本信息.人口学情况",
                "options": ["男", "女"],
            }
        ],
        text="性别：男",
        reading_units=[{"source_type": "line", "source_id": "p1-l1", "text": "性别：男"}],
        require_source_id=True,
    )

    assert any("source_id is not in reading_units" in error for error in errors)
    assert warnings == []


def test_llm_ehr_extractor_rejects_quote_from_wrong_source_id():
    extractor = LlmEhrExtractor()

    errors, warnings, _ = extractor._validate_raw_output(
        {
            "fields": [
                {
                    "field_path": "基本信息.人口学情况.身份信息.性别",
                    "value_type": "text",
                    "value_text": "男",
                    "confidence": 0.9,
                    "evidences": [{"source_type": "line", "source_id": "p1-l2", "quote_text": "性别：男"}],
                }
            ]
        },
        [
            {
                "field_key": "性别",
                "field_path": "基本信息.人口学情况.身份信息.性别",
                "field_title": "性别",
                "value_type": "text",
                "record_form_key": "基本信息.人口学情况",
                "options": ["男", "女"],
            }
        ],
        text="性别：男",
        reading_units=[
            {"source_type": "line", "source_id": "p1-l1", "text": "性别：男"},
            {"source_type": "line", "source_id": "p1-l2", "text": "姓名：张三"},
        ],
        require_source_id=True,
    )

    assert any("quote_text is not from source_id" in error for error in errors)
    assert warnings == []


def test_llm_ehr_extractor_rejects_non_object_evidence_items():
    extractor = LlmEhrExtractor()

    errors, _, _ = extractor._validate_raw_output(
        {
            "fields": [
                {
                    "field_path": "基本信息.人口学情况.身份信息.性别",
                    "value_type": "text",
                    "value_text": "男",
                    "confidence": 0.9,
                    "evidences": ["性别：男"],
                }
            ]
        },
        [
            {
                "field_key": "性别",
                "field_path": "基本信息.人口学情况.身份信息.性别",
                "field_title": "性别",
                "value_type": "text",
                "record_form_key": "基本信息.人口学情况",
                "options": ["男", "女"],
            }
        ],
        text="性别：男",
    )

    assert any("evidences[0] must be an object" in error for error in errors)


def test_llm_ehr_extractor_quote_validation_accepts_reading_unit_text():
    extractor = LlmEhrExtractor()
    reading_units = [{"source_type": "block", "source_id": "b1", "page_no": 1, "text": "姓名：张三"}]

    warnings = extractor._quote_validation_warnings(
        ["姓名：张三"],
        text="",
        reading_units=reading_units,
        label="fields[0]",
    )

    assert warnings == []


def test_llm_ehr_extractor_quote_mismatch_is_warning_not_error():
    extractor = LlmEhrExtractor()

    errors, warnings, status_hint = extractor._validate_raw_output(
        {
            "records": [
                {
                    "form_path": "基本信息.人口学情况",
                    "record": {"姓名": "张三"},
                    "confidence": 0.8,
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
