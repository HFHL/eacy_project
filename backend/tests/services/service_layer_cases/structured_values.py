from .common import *

@pytest.mark.asyncio
async def test_ehr_service_initializes_non_repeatable_forms_only():
    record_repository = FakeRecordRepository()
    service = EhrService(context_repository=SimpleNamespace(), record_repository=record_repository)
    schema_json = {
        "groups": [
            {
                "key": "basic",
                "title": "基本信息",
                "forms": [
                    {"key": "demographics", "title": "人口学情况", "repeatable": False},
                    {"key": "diagnosis", "title": "诊断记录", "repeatable": True},
                ],
            }
        ]
    }

    records = await service.initialize_default_record_instances(
        context_id="context-1",
        schema_json=schema_json,
    )

    assert len(records) == 1
    assert records[0].form_key == "demographics"
    assert records[0].repeat_index == 0


@pytest.mark.asyncio
async def test_structured_value_service_selects_event_as_current_value():
    event_repository = FakeEventRepository()
    current_repository = FakeCurrentRepository()
    service = StructuredValueService(
        event_repository=event_repository,
        current_repository=current_repository,
        evidence_repository=FakeEvidenceRepository(),
    )
    event = SimpleNamespace(
        id="event-1",
        context_id="context-1",
        record_instance_id="record-1",
        field_key="age",
        field_path="basic.demographics.age",
        value_type="number",
        value_text=None,
        value_number=38,
        value_date=None,
        value_datetime=None,
        value_json=None,
        unit="岁",
        review_status="candidate",
    )

    current = await service.select_current_value(event=event, selected_by="user-1")

    assert current.selected_event_id == "event-1"
    assert current.value_number == 38
    assert current.unit == "岁"
    assert event.review_status == "accepted"


@pytest.mark.asyncio
async def test_structured_value_service_deletes_current_and_falls_back_to_latest_candidate():
    event_repository = FakeEventRepository()
    current_repository = FakeCurrentRepository()
    service = StructuredValueService(
        event_repository=event_repository,
        current_repository=current_repository,
        evidence_repository=FakeEvidenceRepository(),
    )
    current_event = SimpleNamespace(
        id="event-current",
        context_id="context-1",
        record_instance_id="record-1",
        field_key="age",
        field_path="basic.demographics.age",
        value_type="number",
        value_text=None,
        value_number=38,
        value_date=None,
        value_datetime=None,
        value_json=None,
        unit="岁",
        review_status="accepted",
        created_at=datetime(2026, 1, 1, 10, 0, 0),
    )
    older_candidate = SimpleNamespace(
        id="event-older",
        context_id="context-1",
        record_instance_id="record-1",
        field_key="age",
        field_path="basic.demographics.age",
        value_type="number",
        value_text=None,
        value_number=39,
        value_date=None,
        value_datetime=None,
        value_json=None,
        unit="岁",
        review_status="candidate",
        created_at=datetime(2026, 1, 1, 11, 0, 0),
    )
    latest_candidate = SimpleNamespace(
        id="event-latest",
        context_id="context-1",
        record_instance_id="record-1",
        field_key="age",
        field_path="basic.demographics.age",
        value_type="number",
        value_text=None,
        value_number=40,
        value_date=None,
        value_datetime=None,
        value_json=None,
        unit="岁",
        review_status="candidate",
        created_at=datetime(2026, 1, 1, 12, 0, 0),
    )
    event_repository.events = [current_event, older_candidate, latest_candidate]
    current_repository.current = SimpleNamespace(
        context_id="context-1",
        record_instance_id="record-1",
        field_key="age",
        field_path="basic.demographics.age",
        selected_event_id="event-current",
        value_type="number",
        value_text=None,
        value_number=38,
        value_date=None,
        value_datetime=None,
        value_json=None,
        unit="岁",
        selected_by="user-1",
        selected_at=datetime(2026, 1, 1, 10, 5, 0),
        review_status="confirmed",
        updated_at=datetime(2026, 1, 1, 10, 5, 0),
    )

    fallback = await service.clear_current_value_with_fallback(
        context_id="context-1",
        record_instance_id="record-1",
        field_path="basic.demographics.age",
    )

    assert fallback is current_repository.current
    assert fallback.selected_event_id == "event-latest"
    assert fallback.value_number == 40
    assert fallback.review_status == "unreviewed"
    assert current_event.review_status == "candidate"
    assert latest_candidate.review_status == "accepted"
    assert current_repository.deleted == [
        {
            "context_id": "context-1",
            "record_instance_id": "record-1",
            "field_path": "basic.demographics.age",
        }
    ]
    assert len(current_repository.locks) >= 2


@pytest.mark.asyncio
async def test_ehr_delete_field_value_keeps_history_and_falls_back_to_candidate():
    event_repository = FakeEventRepository()
    current_repository = FakeCurrentRepository()
    current_event = SimpleNamespace(
        id="event-current",
        context_id="context-1",
        record_instance_id="record-1",
        field_key="gender",
        field_path="basic.demographics.gender",
        value_type="text",
        value_text="男",
        value_number=None,
        value_date=None,
        value_datetime=None,
        value_json=None,
        unit=None,
        review_status="accepted",
        created_at=datetime(2026, 1, 1, 10, 0, 0),
    )
    latest_candidate = SimpleNamespace(
        id="event-latest",
        context_id="context-1",
        record_instance_id="record-1",
        field_key="gender",
        field_path="basic.demographics.gender",
        value_type="text",
        value_text="女",
        value_number=None,
        value_date=None,
        value_datetime=None,
        value_json=None,
        unit=None,
        review_status="candidate",
        created_at=datetime(2026, 1, 1, 11, 0, 0),
    )
    event_repository.events = [current_event, latest_candidate]
    current_repository.current = SimpleNamespace(
        context_id="context-1",
        record_instance_id="record-1",
        field_key="gender",
        field_path="basic.demographics.gender",
        selected_event_id="event-current",
        value_type="text",
        value_text="男",
        value_number=None,
        value_date=None,
        value_datetime=None,
        value_json=None,
        unit=None,
        selected_by="user-1",
        selected_at=datetime(2026, 1, 1, 10, 5, 0),
        review_status="confirmed",
        updated_at=datetime(2026, 1, 1, 10, 5, 0),
    )

    class FakeEhrContextRepository:
        async def get_latest_patient_ehr(self, patient_id):
            return SimpleNamespace(id="context-1", patient_id=patient_id, context_type="patient_ehr")

    value_service = StructuredValueService(
        event_repository=event_repository,
        current_repository=current_repository,
        evidence_repository=FakeEvidenceRepository(),
    )
    service = EhrService(
        context_repository=FakeEhrContextRepository(),
        patient_repository=FakePatientRepository(),
        value_service=value_service,
        current_repository=current_repository,
        event_repository=event_repository,
        evidence_repository=FakeEvidenceRepository(),
    )

    await service.delete_field_value(
        patient_id="patient-1",
        field_path="basic.demographics.gender",
        owner_id="user-1",
    )

    assert current_repository.current.selected_event_id == "event-latest"
    assert current_repository.current.value_text == "女"
    assert current_repository.current.review_status == "unreviewed"
    assert current_event.review_status == "candidate"
    assert latest_candidate.review_status == "accepted"
    assert {event.id for event in event_repository.events} == {"event-current", "event-latest"}


@pytest.mark.asyncio
async def test_structured_value_service_records_ai_event_and_evidence():
    event_repository = FakeEventRepository()
    current_repository = FakeCurrentRepository()
    evidence_repository = FakeEvidenceRepository()
    service = StructuredValueService(
        event_repository=event_repository,
        current_repository=current_repository,
        evidence_repository=evidence_repository,
    )

    event = await service.record_ai_extracted_value(
        context_id="context-1",
        record_instance_id="record-1",
        field_key="gender",
        field_path="basic.demographics.gender",
        value_type="single_select",
        value_text="男",
        evidences=[
            {
                "document_id": "document-1",
                "evidence_type": "field",
                "quote_text": "性别：男",
            }
        ],
    )

    assert event.event_type == "ai_extracted"
    assert len(evidence_repository.created) == 1
    assert evidence_repository.created[0].value_event_id == event.id
    assert current_repository.current.selected_event_id == event.id
