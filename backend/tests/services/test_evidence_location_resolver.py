from types import SimpleNamespace

from app.services.evidence_location_resolver import resolve_evidence_locations


def test_resolve_evidence_locations_prefers_source_id_over_fuzzy_value_match():
    document = SimpleNamespace(
        ocr_payload_json={
            "blocks": [
                {
                    "block_id": "b4",
                    "page_no": 1,
                    "text": "姓名：胡世涛",
                    "polygon": [10, 10, 80, 10, 80, 30, 10, 30],
                },
                {
                    "block_id": "b9",
                    "page_no": 1,
                    "text": "已婚",
                    "polygon": [100, 100, 140, 100, 140, 120, 100, 120],
                },
            ]
        },
        parsed_data=None,
    )

    resolved = resolve_evidence_locations(
        document,
        [{"source_type": "block", "source_id": "b9", "quote_text": "已婚", "page_no": 1}],
        fallback_text="胡世涛",
    )

    assert resolved[0]["bbox_json"]["block_id"] == "b9"
    assert resolved[0]["bbox_json"]["text"] == "已婚"


def test_resolve_evidence_locations_uses_quote_before_fallback_when_source_id_missing():
    document = SimpleNamespace(
        ocr_payload_json={
            "blocks": [
                {
                    "block_id": "b4",
                    "page_no": 1,
                    "text": "姓名：胡世涛",
                    "polygon": [10, 10, 80, 10, 80, 30, 10, 30],
                },
                {
                    "block_id": "b9",
                    "page_no": 1,
                    "text": "已婚",
                    "polygon": [100, 100, 140, 100, 140, 120, 100, 120],
                },
            ]
        },
        parsed_data=None,
    )

    resolved = resolve_evidence_locations(document, [{"quote_text": "已婚", "page_no": 1}], fallback_text="胡世涛")

    assert resolved[0]["bbox_json"]["block_id"] == "b9"
    assert resolved[0]["bbox_json"]["source_text"] == "已婚"
