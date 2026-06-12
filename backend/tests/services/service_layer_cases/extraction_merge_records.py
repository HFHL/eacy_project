from .common import *

def _ct_fields(*, exam_date: str, report_no: str, body_part: str) -> list[dict[str, Any]]:
    merge_binding = "anchor=检查日期;group_key=检查编号(影像号)+检查部位;fallback=报告日期"
    return [
        {
            "field_key": "检查日期",
            "field_path": "影像检查.CT.检查日期",
            "field_title": "检查日期",
            "record_form_key": "影像检查.CT",
            "record_form_title": "CT",
            "merge_binding": merge_binding,
            "value_type": "date",
            "value_date": exam_date,
            "confidence": 0.9,
        },
        {
            "field_key": "检查编号(影像号)",
            "field_path": "影像检查.CT.检查编号(影像号)",
            "field_title": "检查编号(影像号)",
            "record_form_key": "影像检查.CT",
            "record_form_title": "CT",
            "merge_binding": merge_binding,
            "value_type": "text",
            "value_text": report_no,
            "confidence": 0.9,
        },
        {
            "field_key": "检查部位",
            "field_path": "影像检查.CT.检查部位",
            "field_title": "检查部位",
            "record_form_key": "影像检查.CT",
            "record_form_title": "CT",
            "merge_binding": merge_binding,
            "value_type": "text",
            "value_text": body_part,
            "confidence": 0.9,
        },
    ]


def _ct_fields_without_anchor() -> list[dict[str, Any]]:
    merge_binding = "anchor=检查日期;group_key=检查编号(影像号)+检查部位;fallback=报告日期"
    return [
        {
            "field_key": "检查结果",
            "field_path": "影像检查.CT.检查结果",
            "field_title": "检查结果",
            "record_form_key": "影像检查.CT",
            "record_form_title": "CT",
            "merge_binding": merge_binding,
            "value_type": "text",
            "value_text": "未见明显异常",
            "confidence": 0.8,
        }
    ]


@pytest.mark.asyncio
async def test_extraction_service_creates_new_record_for_different_report_anchor():
    value_service = FakeExtractionValueService()
    record_repository = FakeExtractionRecordRepository(
        records=[
            SimpleNamespace(
                id="ct-1",
                context_id="context-1",
                group_key="影像检查",
                group_title="影像检查",
                form_key="影像检查.CT",
                form_title="CT",
                repeat_index=0,
                anchor_json=None,
                source_document_id=None,
                created_by_run_id=None,
            )
        ]
    )
    service = ExtractionService(
        job_repository=SimpleNamespace(),
        run_repository=SimpleNamespace(),
        record_repository=record_repository,
        document_repository=FakeExtractionDocumentRepository(),
        value_service=value_service,
    )

    await service._write_extracted_values(
        job=SimpleNamespace(id="job-1", context_id="context-1", document_id="document-1", requested_by=None),
        run=SimpleNamespace(id="run-1"),
        parsed_output={"fields": _ct_fields(exam_date="2024-01-01", report_no="CT001", body_part="胰腺")},
    )
    await service._write_extracted_values(
        job=SimpleNamespace(id="job-2", context_id="context-1", document_id="document-2", requested_by=None),
        run=SimpleNamespace(id="run-2"),
        parsed_output={"fields": _ct_fields(exam_date="2024-01-02", report_no="CT002", body_part="肝脏")},
    )

    assert len(record_repository.created) == 1
    assert record_repository.records[0].anchor_json["merge_key"] != record_repository.created[0].anchor_json["merge_key"]
    assert record_repository.created[0].repeat_index == 1
    assert record_repository.created[0].instance_label == "CT_2"
    assert {event["record_instance_id"] for event in value_service.events[:3]} == {"ct-1"}
    assert {event["record_instance_id"] for event in value_service.events[3:]} == {"record-2"}
    assert {event["field_path"] for event in value_service.events} == {
        "影像检查.CT.检查日期",
        "影像检查.CT.检查编号(影像号)",
        "影像检查.CT.检查部位",
    }


@pytest.mark.asyncio
async def test_extraction_service_reuses_record_for_same_report_anchor():
    value_service = FakeExtractionValueService()
    record_repository = FakeExtractionRecordRepository(
        records=[
            SimpleNamespace(
                id="ct-1",
                context_id="context-1",
                group_key="影像检查",
                group_title="影像检查",
                form_key="影像检查.CT",
                form_title="CT",
                repeat_index=0,
                anchor_json=None,
                source_document_id=None,
                created_by_run_id=None,
            )
        ]
    )
    service = ExtractionService(
        job_repository=SimpleNamespace(),
        run_repository=SimpleNamespace(),
        record_repository=record_repository,
        document_repository=FakeExtractionDocumentRepository(),
        value_service=value_service,
    )
    fields = _ct_fields(exam_date="2024-01-01", report_no="CT001", body_part="胰腺")

    await service._write_extracted_values(
        job=SimpleNamespace(id="job-1", context_id="context-1", document_id="document-1", requested_by=None),
        run=SimpleNamespace(id="run-1"),
        parsed_output={"fields": fields},
    )
    await service._write_extracted_values(
        job=SimpleNamespace(id="job-2", context_id="context-1", document_id="document-1", requested_by=None),
        run=SimpleNamespace(id="run-2"),
        parsed_output={"fields": fields},
    )

    assert record_repository.created == []
    assert record_repository.records[0].anchor_json["merge_key"]
    assert {event["record_instance_id"] for event in value_service.events} == {"ct-1"}


@pytest.mark.asyncio
async def test_extraction_service_marks_missing_merge_anchor_as_suspicious_duplicate():
    value_service = FakeExtractionValueService()
    record_repository = FakeExtractionRecordRepository(
        records=[
            SimpleNamespace(
                id="ct-1",
                context_id="context-1",
                group_key="影像检查",
                group_title="影像检查",
                form_key="影像检查.CT",
                form_title="CT",
                repeat_index=0,
                anchor_json=None,
                source_document_id=None,
                created_by_run_id=None,
            )
        ]
    )
    service = ExtractionService(
        job_repository=SimpleNamespace(),
        run_repository=SimpleNamespace(),
        record_repository=record_repository,
        document_repository=FakeExtractionDocumentRepository(),
        value_service=value_service,
    )

    await service._write_extracted_values(
        job=SimpleNamespace(id="job-1", context_id="context-1", document_id="document-1", requested_by=None),
        run=SimpleNamespace(id="run-1"),
        parsed_output={"fields": _ct_fields_without_anchor()},
    )
    await service._write_extracted_values(
        job=SimpleNamespace(id="job-2", context_id="context-1", document_id="document-2", requested_by=None),
        run=SimpleNamespace(id="run-2"),
        parsed_output={"fields": _ct_fields_without_anchor()},
    )

    assert len(record_repository.created) == 1
    first_anchor = record_repository.records[0].anchor_json
    second_anchor = record_repository.created[0].anchor_json
    assert first_anchor["duplicate_suspect"] is True
    assert first_anchor["duplicate_suspect_reason"] == "missing_merge_anchor"
    assert first_anchor["anchor_missing"] is True
    assert second_anchor["duplicate_suspect"] is True
    assert first_anchor["merge_key"] != second_anchor["merge_key"]
    assert {event["record_instance_id"] for event in value_service.events} == {"ct-1", "record-2"}


@pytest.mark.asyncio
async def test_extraction_service_creates_first_record_when_repeatable_form_has_no_default():
    value_service = FakeExtractionValueService()
    record_repository = FakeExtractionRecordRepository(
        records=[
            SimpleNamespace(
                id="basic-1",
                context_id="context-1",
                group_key="基本信息",
                group_title="基本信息",
                form_key="基本信息.人口学",
                form_title="人口学",
                repeat_index=0,
                anchor_json=None,
                source_document_id=None,
                created_by_run_id=None,
            )
        ]
    )
    service = ExtractionService(
        job_repository=SimpleNamespace(),
        run_repository=SimpleNamespace(),
        record_repository=record_repository,
        document_repository=FakeExtractionDocumentRepository(),
        value_service=value_service,
    )

    await service._write_extracted_values(
        job=SimpleNamespace(id="job-1", context_id="context-1", document_id="document-1", requested_by=None),
        run=SimpleNamespace(id="run-1"),
        parsed_output={"fields": _ct_fields(exam_date="2024-01-01", report_no="CT001", body_part="胰腺")},
    )

    assert len(record_repository.created) == 1
    assert record_repository.created[0].form_key == "影像检查.CT"
    assert record_repository.created[0].repeat_index == 0
    assert record_repository.created[0].instance_label == "CT"
    assert {event["record_instance_id"] for event in value_service.events} == {"record-2"}
