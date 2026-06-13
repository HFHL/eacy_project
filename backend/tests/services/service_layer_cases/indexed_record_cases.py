from .common import *


@pytest.mark.asyncio
async def test_ehr_service_resolves_indexed_field_path_to_repeat_record():
    record_repository = FakeExtractionRecordRepository(
        records=[
            SimpleNamespace(
                id="medication-1",
                context_id="context-1",
                group_key="care",
                group_title="care",
                form_key="care.medication",
                form_title="Medication",
                repeat_index=0,
            )
        ]
    )
    service = EhrService(record_repository=record_repository)

    record = await service._resolve_record_for_field_path(
        context_id="context-1",
        record_instance_id=None,
        field_path="care.medication.1.drug_name",
    )

    assert record.id == "record-2"
    assert record.repeat_index == 1
    assert service._storage_field_path("care.medication.1.drug_name") == "care.medication.drug_name"


def test_ehr_service_current_values_include_record_repeat_index():
    service = EhrService()
    schema_json = {
        "properties": {
            "影像检查": {
                "properties": {
                    "CT": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "检查日期": {"type": "string", "format": "date"},
                            },
                        },
                    }
                }
            }
        }
    }
    records = [
        SimpleNamespace(id="ct-1", form_key="影像检查.CT", repeat_index=0),
        SimpleNamespace(id="ct-2", form_key="影像检查.CT", repeat_index=1),
    ]
    current_values = [
        SimpleNamespace(record_instance_id="ct-1", field_path="影像检查.CT.检查日期", value_date="2024-01-01"),
        SimpleNamespace(record_instance_id="ct-2", field_path="影像检查.CT.检查日期", value_date="2024-01-02"),
    ]

    output = service._current_values_by_display_path(current_values, schema_json, records)

    assert set(output.keys()) == {"影像检查.CT.0.检查日期", "影像检查.CT.1.检查日期"}
    assert output["影像检查.CT.1.检查日期"].record_instance_id == "ct-2"


def test_ehr_service_current_values_compact_sparse_record_repeat_indexes():
    service = EhrService()
    schema_json = {
        "properties": {
            "实验室检查": {
                "properties": {
                    "血常规": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "检验结果": {
                                    "type": "array",
                                    "x-display": "table",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "指标名称(中文)": {"type": "string"},
                                            "检测值": {"type": "string"},
                                        },
                                    },
                                },
                            },
                        },
                    }
                }
            }
        }
    }
    records = [
        SimpleNamespace(id="blood-1", form_key="实验室检查.血常规", repeat_index=0),
        SimpleNamespace(id="blood-stale", form_key="实验室检查.血常规", repeat_index=1),
        SimpleNamespace(id="blood-2", form_key="实验室检查.血常规", repeat_index=27),
    ]
    current_values = [
        SimpleNamespace(record_instance_id="blood-1", field_path="实验室检查.血常规.检验结果", value_json=[]),
        SimpleNamespace(record_instance_id="blood-2", field_path="实验室检查.血常规.检验结果", value_json=[]),
    ]

    output = service._current_values_by_display_path(current_values, schema_json, records)

    assert set(output.keys()) == {"实验室检查.血常规.0.检验结果", "实验室检查.血常规.1.检验结果"}
    assert output["实验室检查.血常规.1.检验结果"].record_instance_id == "blood-2"


def test_ehr_service_hides_scalar_only_lab_record_when_table_records_exist():
    service = EhrService()
    schema_json = {
        "properties": {
            "实验室检查": {
                "properties": {
                    "血常规": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "检查机构": {"type": "string"},
                                "检验结果": {
                                    "type": "array",
                                    "x-display": "table",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "指标名称(中文)": {"type": "string"},
                                            "检测值": {"type": "string"},
                                        },
                                    },
                                },
                            },
                        },
                    }
                }
            }
        }
    }
    records = [
        SimpleNamespace(id="blood-1", form_key="实验室检查.血常规", repeat_index=0),
        SimpleNamespace(id="blood-stale", form_key="实验室检查.血常规", repeat_index=26),
        SimpleNamespace(id="blood-2", form_key="实验室检查.血常规", repeat_index=27),
    ]
    current_values = [
        SimpleNamespace(
            record_instance_id="blood-1",
            field_path="实验室检查.血常规.检查机构",
            value_text="上海市第四人民医院",
        ),
        SimpleNamespace(
            record_instance_id="blood-1",
            field_path="实验室检查.血常规.检验结果",
            value_type="json",
            value_json=[{"指标名称(中文)": "白细胞", "检测值": "12.00"}],
        ),
        SimpleNamespace(
            record_instance_id="blood-stale",
            field_path="实验室检查.血常规.检查机构",
            value_text="上海市第四人民医院",
        ),
        SimpleNamespace(
            record_instance_id="blood-2",
            field_path="实验室检查.血常规.检验结果",
            value_type="json",
            value_json=[{"指标名称(中文)": "血红蛋白", "检测值": "146"}],
        ),
    ]

    output = service._current_values_by_display_path(current_values, schema_json, records)

    assert set(output.keys()) == {
        "实验室检查.血常规.0.检查机构",
        "实验室检查.血常规.0.检验结果",
        "实验室检查.血常规.1.检验结果",
    }
    assert output["实验室检查.血常规.1.检验结果"].record_instance_id == "blood-2"


async def test_research_service_resolves_indexed_field_path_to_repeat_record():
    record_repository = FakeExtractionRecordRepository(
        records=[
            SimpleNamespace(
                id="visit-1",
                context_id="context-1",
                group_key="followup",
                group_title="followup",
                form_key="followup.visit",
                form_title="Visit",
                repeat_index=0,
            )
        ]
    )
    service = ResearchProjectService(record_repository=record_repository)

    record = await service._resolve_record_for_field_path(
        context_id="context-1",
        record_instance_id=None,
        field_path="followup.visit.2.date",
    )

    assert record.id == "record-2"
    assert record.repeat_index == 2
    assert service._storage_field_path("followup.visit.2.date") == "followup.visit.date"


@pytest.mark.asyncio
async def test_extraction_service_reuses_sibling_location_for_derived_enum_evidence():
    service = ExtractionService(value_service=FakeExtractionValueService())
    record = SimpleNamespace(id="record-1")
    field_entries = [
        {
            "field": {"field_path": "治疗情况.药物治疗.药物名称"},
            "record": record,
            "evidences": [
                {
                    "quote_text": "左乙拉西坦",
                    "page_no": 1,
                    "bbox_json": {
                        "polygon": [10, 20, 110, 20, 110, 50, 10, 50],
                        "renderable": True,
                    },
                }
            ],
        },
        {
            "field": {"field_path": "治疗情况.药物治疗.药物类型"},
            "record": record,
            "evidences": [{"quote_text": "神经系统药物", "page_no": None, "bbox_json": None}],
        },
    ]

    service._apply_sibling_evidence_fallback(field_entries)

    evidence = field_entries[1]["evidences"][0]
    assert evidence["quote_text"] == "神经系统药物"
    assert evidence["page_no"] == 1
    assert evidence["bbox_json"]["fallback_strategy"] == "sibling_page_hint"
    assert evidence["bbox_json"].get("polygon") is None
    assert evidence["bbox_json"]["renderable"] is False
