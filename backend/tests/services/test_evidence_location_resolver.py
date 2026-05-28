from types import SimpleNamespace

from app.services.evidence_location_resolver import (
    build_ocr_reading_units,
    has_renderable_polygon,
    page_angle_from_payload,
    resolve_evidence_locations,
)


def test_enrich_evidence_location_adds_page_angle_and_renderable_flag():
    document = SimpleNamespace(
        ocr_payload_json={
            "pages": [{"page_no": 1, "width": 1000, "height": 1400, "angle": 90}],
            "blocks": [
                {
                    "block_id": "b1",
                    "page_no": 1,
                    "text": "姓名：张三",
                    "polygon": [10, 10, 80, 10, 80, 30, 10, 30],
                    "page_width": 1000,
                    "page_height": 1400,
                    "coord_space": "pixel",
                }
            ],
        },
        parsed_data=None,
    )

    resolved = resolve_evidence_locations(
        document,
        [{"source_type": "block", "source_id": "b1", "quote_text": "姓名：张三", "page_no": 1}],
    )

    bbox = resolved[0]["bbox_json"]
    assert bbox["page_angle"] == 90
    assert bbox["renderable"] is True
    assert has_renderable_polygon(bbox) is True


def test_page_angle_from_payload_returns_zero_when_missing():
    assert page_angle_from_payload({"pages": [{"page_no": 1, "angle": 270}]}, 1) == 270
    assert page_angle_from_payload({"pages": []}, 1) == 0.0


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


def test_fuzzy_match_respects_page_no():
    document = SimpleNamespace(
        ocr_payload_json={
            "blocks": [
                {
                    "block_id": "b1",
                    "page_no": 1,
                    "text": "姓名：张三",
                    "polygon": [10, 10, 80, 10, 80, 30, 10, 30],
                },
                {
                    "block_id": "b2",
                    "page_no": 2,
                    "text": "姓名：李四",
                    "polygon": [10, 10, 80, 10, 80, 30, 10, 30],
                },
            ]
        },
        parsed_data=None,
    )

    resolved = resolve_evidence_locations(document, [{"quote_text": "姓名：李四", "page_no": 2}])

    assert resolved[0]["bbox_json"]["block_id"] == "b2"


def test_very_low_confidence_fuzzy_match_drops_polygon():
    """Below the LOW_CONFIDENCE floor (0.70) the polygon is stripped entirely."""
    document = SimpleNamespace(
        ocr_payload_json={
            "blocks": [
                {
                    "block_id": "b1",
                    "page_no": 1,
                    "text": "AB",
                    "polygon": [10, 10, 80, 10, 80, 30, 10, 30],
                }
            ]
        },
        parsed_data=None,
    )

    resolved = resolve_evidence_locations(document, [{"quote_text": "XY", "page_no": 1}], fallback_text="ZZ")

    bbox = resolved[0].get("bbox_json")
    assert bbox is None or bbox.get("renderable") is False


def test_medium_confidence_fuzzy_match_keeps_polygon_with_low_confidence_flag():
    """Fuzzy hits in [0.70, 0.88) used to lose their polygon. They now keep it
    but are labelled low_confidence so the UI can render a lighter / dashed box
    instead of dropping the source pointer entirely."""
    document = SimpleNamespace(
        ocr_payload_json={
            "blocks": [
                {
                    "block_id": "b1",
                    "page_no": 1,
                    "text": "完成情况备注栏",
                    "polygon": [10, 10, 80, 10, 80, 30, 10, 30],
                    "page_width": 1000,
                    "page_height": 1400,
                }
            ]
        },
        parsed_data=None,
    )

    resolved = resolve_evidence_locations(
        document,
        [{"quote_text": "完成情况备注", "page_no": 1}],
        fallback_text="完成情况备注",
    )

    bbox = resolved[0]["bbox_json"]
    score = float(bbox.get("match_score") or 0)
    assert 0.70 <= score < 0.88, f"unexpected match_score: {score}"
    assert bbox.get("renderable") is True
    assert bbox.get("low_confidence") is True
    assert bbox.get("coord_warning") == "low_confidence_fuzzy_match"
    assert isinstance(bbox.get("polygon"), list) and len(bbox["polygon"]) >= 8


def test_build_ocr_reading_units_prefers_blocks_and_deduplicates_line_duplicates():
    document = SimpleNamespace(
        ocr_payload_json={
            "blocks": [
                {
                    "block_id": "b1",
                    "page_no": 1,
                    "type": "paragraph",
                    "text": "姓名：张三",
                }
            ],
            "lines": [
                {
                    "line_id": "p1-l1",
                    "page_no": 1,
                    "text": "姓名：张三",
                    "order_index": 1,
                }
            ],
            "tables": [
                {
                    "table_id": "t1",
                    "page_no": 2,
                    "cells": [
                        {"cell_key": "t1-c1", "row": 0, "col": 0, "text": "13800138000"},
                    ],
                }
            ],
        },
        parsed_data=None,
    )

    units = build_ocr_reading_units(document)

    assert [unit["source_id"] for unit in units] == ["b1", "t1-c1"]
    assert units[0]["source_type"] == "block"
    assert units[0]["type"] == "paragraph"
    assert units[1]["source_type"] == "table_cell"
    assert units[1]["row"] == 0
    assert units[1]["col"] == 0


def test_build_ocr_reading_units_returns_empty_without_payload():
    document = SimpleNamespace(ocr_payload_json=None, parsed_data=None)
    assert build_ocr_reading_units(document) == []
