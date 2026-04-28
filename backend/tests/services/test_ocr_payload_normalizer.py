from app.services.ocr_payload_normalizer import normalize_textin_ocr_payload


def test_normalize_textin_ocr_payload_preserves_pages_lines_blocks_and_tables():
    raw_response = {
        "code": 200,
        "message": "success",
        "result": {
            "markdown": "# Report\n\nhello",
            "total_page_number": 1,
            "valid_page_number": 1,
            "pages": [
                {
                    "page_id": 0,
                    "status": "success",
                    "width": 1000,
                    "height": 1400,
                    "angle": 0,
                    "image_id": "image-1",
                    "raw_ocr": [
                        {
                            "text": "hello",
                            "score": 0.99,
                            "position": [10, 20, 90, 20, 90, 40, 10, 40],
                        }
                    ],
                }
            ],
            "detail": [
                {
                    "page_id": 1,
                    "paragraph_id": 10,
                    "type": "table",
                    "sub_type": "table",
                    "text": "A",
                    "position": [10, 50, 200, 50, 200, 120, 10, 120],
                    "cells": [
                        {
                            "row": 1,
                            "col": 1,
                            "text": "A",
                            "position": [10, 50, 90, 50, 90, 80, 10, 80],
                        }
                    ],
                }
            ],
        },
    }

    payload = normalize_textin_ocr_payload(raw_response, request_snapshot={"document_id": "document-1"})

    assert payload["provider"] == "textin"
    assert payload["markdown"] == "# Report\n\nhello"
    assert payload["request"]["document_id"] == "document-1"
    assert payload["pages"][0]["page_no"] == 1
    assert payload["pages"][0]["width"] == 1000
    assert payload["lines"][0]["line_id"] == "p1-l1"
    assert payload["lines"][0]["polygon"] == [10, 20, 90, 20, 90, 40, 10, 40]
    assert payload["blocks"][0]["block_id"] == "b1"
    assert payload["blocks"][0]["table_id"] == "t1"
    assert payload["tables"][0]["cells"][0]["cell_key"] == "t1-c1"


def test_normalize_textin_ocr_payload_falls_back_to_raw_ocr_text():
    raw_response = {
        "code": 200,
        "message": "success",
        "result": {
            "pages": [
                {"page_id": 1, "raw_ocr": [{"text": "line 1"}, {"text": "line 2"}]},
                {"page_id": 2, "raw_ocr": [{"text": "line 3"}]},
            ]
        },
    }

    payload = normalize_textin_ocr_payload(raw_response)

    assert payload["markdown"] == "line 1\nline 2\n\nline 3"
