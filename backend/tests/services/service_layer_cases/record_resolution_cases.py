from .common import *

@pytest.mark.asyncio
async def test_project_crf_record_resolution_ignores_mismatched_record_id():
    record_repository = FakeExtractionRecordRepository(
        records=[
            SimpleNamespace(
                id="wrong-record",
                context_id="context-1",
                group_key="费用信息",
                group_title="费用信息",
                form_key="费用信息.住院病案首页",
                form_title="住院病案首页",
                repeat_index=0,
            ),
            SimpleNamespace(
                id="blood-record",
                context_id="context-1",
                group_key="检验检查",
                group_title="检验检查",
                form_key="检验检查.血常规",
                form_title="血常规",
                repeat_index=1,
            ),
        ]
    )
    service = ResearchProjectService(record_repository=record_repository)

    record = await service._resolve_record_for_field_path(
        context_id="context-1",
        record_instance_id="wrong-record",
        field_path="检验检查.血常规.1.白细胞",
    )

    assert record.id == "blood-record"


@pytest.mark.asyncio
async def test_ehr_record_resolution_ignores_mismatched_record_id():
    record_repository = FakeExtractionRecordRepository(
        records=[
            SimpleNamespace(
                id="wrong-record",
                context_id="context-1",
                group_key="费用信息",
                group_title="费用信息",
                form_key="费用信息.住院病案首页",
                form_title="住院病案首页",
                repeat_index=0,
            ),
            SimpleNamespace(
                id="blood-record",
                context_id="context-1",
                group_key="检验检查",
                group_title="检验检查",
                form_key="检验检查.血常规",
                form_title="血常规",
                repeat_index=1,
            ),
        ]
    )
    service = EhrService(record_repository=record_repository)

    record = await service._resolve_record_for_field_path(
        context_id="context-1",
        record_instance_id="wrong-record",
        field_path="检验检查.血常规.1.白细胞",
    )

    assert record.id == "blood-record"


@pytest.mark.asyncio
async def test_extraction_service_reuses_singleton_form_without_merge_binding_across_documents():
    value_service = FakeExtractionValueService()
    record_repository = FakeExtractionRecordRepository(
        records=[
            SimpleNamespace(
                id="demo-1",
                context_id="context-1",
                group_key="basic",
                group_title="basic",
                form_key="basic.demographics",
                form_title="Demographics",
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
    parsed_output = {
        "fields": [
            {
                "field_key": "gender",
                "field_path": "basic.demographics.gender",
                "field_title": "性别",
                "record_form_key": "basic.demographics",
                "record_form_title": "Demographics",
                "value_type": "text",
                "value_text": "女",
                "confidence": 0.9,
            }
        ]
    }

    await service._write_extracted_values(
        job=SimpleNamespace(id="job-1", context_id="context-1", document_id="document-1", requested_by=None),
        run=SimpleNamespace(id="run-1"),
        parsed_output=parsed_output,
    )
    await service._write_extracted_values(
        job=SimpleNamespace(id="job-2", context_id="context-1", document_id="document-2", requested_by=None),
        run=SimpleNamespace(id="run-2"),
        parsed_output=parsed_output,
    )

    assert record_repository.created == []
    assert {event["record_instance_id"] for event in value_service.events} == {"demo-1"}
    assert record_repository.records[0].anchor_json["merge_key"] == "form=basic.demographics"


@pytest.mark.asyncio
async def test_extraction_service_skips_field_without_resolvable_form_key():
    value_service = FakeExtractionValueService()
    service = ExtractionService(
        job_repository=SimpleNamespace(),
        run_repository=SimpleNamespace(),
        record_repository=FakeExtractionRecordRepository(),
        document_repository=FakeExtractionDocumentRepository(),
        value_service=value_service,
    )

    await service._write_extracted_values(
        job=SimpleNamespace(id="job-1", context_id="context-1", document_id="document-1", requested_by=None),
        run=SimpleNamespace(id="run-1"),
        parsed_output={
            "fields": [
                {
                    "field_key": "orphan",
                    "field_path": "orphan",
                    "value_type": "text",
                    "value_text": "不应写入",
                    "confidence": 0.9,
                }
            ]
        },
    )

    assert value_service.events == []
