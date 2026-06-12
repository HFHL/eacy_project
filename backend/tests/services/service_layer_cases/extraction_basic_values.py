from .common import *

@pytest.mark.asyncio
async def test_extraction_service_writes_mock_output_to_structured_values():
    value_service = FakeExtractionValueService()
    service = ExtractionService(
        job_repository=SimpleNamespace(),
        run_repository=SimpleNamespace(),
        record_repository=FakeExtractionRecordRepository(),
        document_repository=FakeExtractionDocumentRepository(),
        value_service=value_service,
    )
    job = SimpleNamespace(
        id="job-1",
        context_id="context-1",
        document_id="document-1",
        input_json={
            "mock_fields": [
                {
                    "field_key": "gender",
                    "field_path": "basic.demographics.gender",
                    "field_title": "Gender",
                    "value_type": "text",
                    "value_text": "female",
                    "confidence": 0.98,
                    "quote_text": "female",
                    "evidences": [{"source_type": "line", "source_id": "p1-l1", "quote_text": "性别：女"}],
                }
            ]
        },
    )
    run = SimpleNamespace(id="run-1")
    parsed_output = service.extractor.extract(job=job)

    await service._write_extracted_values(job=job, run=run, parsed_output=parsed_output)

    assert len(value_service.events) == 1
    event = value_service.events[0]
    assert event["field_path"] == "basic.demographics.gender"
    assert event["extraction_run_id"] == "run-1"
    assert event["source_document_id"] == "document-1"
    assert event["evidences"][0]["document_id"] == "document-1"
    assert event["evidences"][0]["bbox_json"]["polygon"] == [10, 20, 110, 20, 110, 50, 10, 50]
    assert event["evidences"][0]["bbox_json"]["line_id"] == "p1-l1"


def test_extraction_service_aligns_evidence_quote_to_source_id_text():
    service = ExtractionService(value_service=FakeExtractionValueService())
    document = SimpleNamespace(
        ocr_payload_json={
            "lines": [
                {
                    "line_id": "p1-l1",
                    "page_no": 1,
                    "text": "姓名：张三",
                    "polygon": [10, 20, 110, 20, 110, 50, 10, 50],
                    "page_width": 1000,
                    "page_height": 1400,
                    "coord_space": "pixel",
                }
            ]
        },
        parsed_data=None,
    )

    evidences = service._build_field_evidences(
        field={
            "field_path": "basic.demographics.name",
            "value_type": "text",
            "value_text": "张三",
            "quote_text": "张三",
            "evidences": [
                {
                    "source_type": "line",
                    "source_id": "p1-l1",
                    "quote_text": "改写后的片段",
                    "page_no": 1,
                }
            ],
        },
        document_id="document-1",
        source_document=document,
    )

    assert evidences[0]["quote_text"] == "姓名：张三"
    assert evidences[0]["bbox_json"]["line_id"] == "p1-l1"
    assert evidences[0]["evidence_type"] == "document_source_id"


def test_extraction_service_marks_record_shared_as_inherited_not_auto_selectable():
    service = ExtractionService(value_service=FakeExtractionValueService())
    document = SimpleNamespace(
        ocr_payload_json={
            "lines": [
                {
                    "line_id": "p1-l1",
                    "page_no": 1,
                    "text": "入院时间：2021-11-02",
                    "polygon": [10, 20, 110, 20, 110, 50, 10, 50],
                    "page_width": 1000,
                    "page_height": 1400,
                    "coord_space": "pixel",
                }
            ]
        },
        parsed_data=None,
    )

    evidences = service._build_field_evidences(
        field={
            "field_path": "visit.summary.stay_days",
            "value_type": "number",
            "value_number": 10,
            "evidences": [
                {
                    "source_type": "line",
                    "source_id": "p1-l1",
                    "quote_text": "入院时间：2021-11-02",
                    "page_no": 1,
                    "record_shared": True,
                }
            ],
        },
        document_id="document-1",
        source_document=document,
    )

    assert evidences[0]["evidence_type"] == "document_record_shared"
    assert evidences[0]["bbox_json"]["record_shared"] is True
    assert service._should_auto_select_field(evidences) is False


@pytest.mark.asyncio
async def test_extraction_service_writes_repeatable_rows_to_separate_records():
    value_service = FakeExtractionValueService()
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
    service = ExtractionService(
        job_repository=SimpleNamespace(),
        run_repository=SimpleNamespace(),
        record_repository=record_repository,
        document_repository=FakeExtractionDocumentRepository(),
        value_service=value_service,
    )
    job = SimpleNamespace(id="job-1", context_id="context-1", document_id="document-1", requested_by=None)
    run = SimpleNamespace(id="run-1")
    parsed_output = {
        "fields": [
            {
                "field_key": "drug_name",
                "field_path": "care.medication.0.drug_name",
                "field_title": "药物名称",
                "record_form_key": "care.medication",
                "record_form_title": "Medication",
                "value_type": "text",
                "value_text": "吉非替尼",
                "confidence": 0.9,
            },
            {
                "field_key": "drug_name",
                "field_path": "care.medication.1.drug_name",
                "field_title": "药物名称",
                "record_form_key": "care.medication",
                "record_form_title": "Medication",
                "value_type": "text",
                "value_text": "奥希替尼",
                "confidence": 0.9,
            },
        ]
    }

    await service._write_extracted_values(job=job, run=run, parsed_output=parsed_output)

    assert len(value_service.events) == 2
    assert value_service.events[0]["record_instance_id"] == "medication-1"
    assert value_service.events[1]["record_instance_id"] == "record-2"
    assert value_service.events[1]["field_path"] == "care.medication.drug_name"
    assert record_repository.created[0].form_key == "care.medication"
    assert record_repository.created[0].repeat_index == 1
