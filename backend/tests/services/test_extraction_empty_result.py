from app.services.extraction_service import ExtractionService


def test_empty_result_message_none_when_fields_present():
    service = ExtractionService()
    assert service._empty_result_message(
        parsed={"fields": [{"field_path": "a.b.c", "value_text": "x"}], "attempt_count": 1},
        validation_status="valid",
        target_form_key="出院情况.出院记录",
    ) is None


def test_empty_result_message_for_valid_empty_includes_form_key():
    service = ExtractionService()
    msg = service._empty_result_message(
        parsed={"fields": [], "attempt_count": 1},
        validation_status="valid_empty",
        target_form_key="出院情况.出院记录",
    )
    assert msg is not None
    assert "出院情况.出院记录" in msg
    assert "LLM" in msg


def test_empty_result_message_for_normalized_empty_explains_dropping():
    service = ExtractionService()
    msg = service._empty_result_message(
        parsed={"fields": [], "attempt_count": 2},
        validation_status="valid",
        target_form_key=None,
    )
    assert msg is not None
    assert "规范化" in msg or "丢弃" in msg


def test_empty_result_message_handles_missing_parsed_payload():
    service = ExtractionService()
    msg = service._empty_result_message(
        parsed=None,
        validation_status="valid_empty",
        target_form_key=None,
    )
    assert msg is not None
