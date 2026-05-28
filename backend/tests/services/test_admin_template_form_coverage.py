from app.services.admin_task_service import AdminTaskService


def test_schema_form_coverage_counts_forms_with_and_without_primary_sources():
    service = AdminTaskService()
    schema = {
        "type": "object",
        "properties": {
            "出院情况": {
                "type": "object",
                "properties": {
                    "出院记录": {
                        "type": "object",
                        "x-display-name": "出院记录",
                        "x-sources": {"primary": ["discharge_summary"]},
                        "properties": {"医院": {"type": "string"}},
                    },
                    "护理记录": {
                        "type": "object",
                        "x-display-name": "护理记录",
                        "properties": {"备注": {"type": "string"}},
                    },
                },
            },
            "检验检查": {
                "type": "object",
                "properties": {
                    "病理诊断报告": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "x-display-name": "病理诊断报告",
                            "x-sources": {"primary": []},
                            "properties": {"诊断": {"type": "string"}},
                        },
                    },
                },
            },
        },
    }

    coverage = service._schema_form_coverage(schema)
    assert coverage["total_forms"] == 3
    assert coverage["with_primary_sources"] == 1
    missing_keys = sorted(form["form_key"] for form in coverage["missing_primary"])
    assert missing_keys == ["出院情况.护理记录", "检验检查.病理诊断报告"]


def test_schema_form_coverage_with_empty_schema_returns_zero():
    service = AdminTaskService()
    coverage = service._schema_form_coverage(None)
    assert coverage == {
        "total_forms": 0,
        "with_primary_sources": 0,
        "missing_primary": [],
    }


def test_schema_form_coverage_includes_array_form_sources_on_items():
    """Some templates declare x-sources on the array.items rather than on the
    array node itself. The coverage helper should still recognise primary
    sources defined in either place."""
    service = AdminTaskService()
    schema = {
        "type": "object",
        "properties": {
            "检验检查": {
                "type": "object",
                "properties": {
                    "其他检测": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "x-display-name": "其他检测",
                            "x-sources": {"primary": ["lab_other"]},
                            "properties": {"结果": {"type": "string"}},
                        },
                    },
                },
            },
        },
    }
    coverage = service._schema_form_coverage(schema)
    assert coverage["total_forms"] == 1
    assert coverage["with_primary_sources"] == 1
    assert coverage["missing_primary"] == []
