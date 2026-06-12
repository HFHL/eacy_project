from .common import *


@pytest.mark.asyncio
async def test_research_project_service_enrollment_creates_crf_context_and_records():
    project_patient_repository = FakeProjectPatientRepository()
    context_repository = FakeContextRepository()
    record_repository = FakeRecordRepository()
    service = ResearchProjectService(
        project_repository=FakeProjectRepository(),
        project_patient_repository=project_patient_repository,
        binding_repository=FakeBindingRepository(),
        context_repository=context_repository,
        patient_repository=FakePatientRepository(),
        record_repository=record_repository,
        schema_service=FakeSchemaService(),
    )

    project_patient = await service.enroll_patient(
        project_id="project-1",
        patient_id="patient-1",
        enroll_no="S001-001",
        created_by="user-1",
    )

    assert project_patient.status == "enrolled"
    assert len(context_repository.created) == 1
    context = context_repository.created[0]
    assert context.context_type == "project_crf"
    assert context.project_patient_id == "project-patient-1"
    assert len(record_repository.created) == 1
    assert record_repository.created[0].form_key == "baseline"


@pytest.mark.asyncio
async def test_project_crf_new_schema_context_copies_previous_current_values():
    old_context = SimpleNamespace(
        id="context-old",
        context_type="project_crf",
        patient_id="patient-1",
        project_id="project-1",
        project_patient_id="project-patient-1",
        schema_version_id="schema-version-1",
        created_at=datetime(2026, 1, 1, 9, 0, 0),
    )
    context_repository = FakeMigrationContextRepository([old_context])
    source_record = SimpleNamespace(
        id="record-old",
        context_id="context-old",
        group_key="crf",
        group_title="CRF",
        form_key="baseline",
        form_title="Baseline",
        repeat_index=0,
        instance_label="Baseline",
        anchor_json={"source": "old"},
        source_document_id="document-1",
        created_by_run_id="run-1",
        review_status="confirmed",
    )
    record_repository = FakeExtractionRecordRepository(records=[source_record])

    source_event = SimpleNamespace(
        id="event-old",
        context_id="context-old",
        record_instance_id="record-old",
        field_key="gender",
        field_path="baseline.gender",
        field_title="性别",
        event_type="manual_selected",
        value_type="text",
        value_text="女",
        value_number=None,
        value_date=None,
        value_datetime=None,
        value_json=None,
        unit=None,
        normalized_text="女",
        confidence=0.99,
        extraction_run_id="run-1",
        source_document_id="document-1",
        source_event_id=None,
        review_status="accepted",
        created_by="reviewer-1",
        created_at=datetime(2026, 1, 1, 10, 0, 0),
        note=None,
    )
    event_repository = FakeEventRepository()
    event_repository.events = [source_event]

    class FakeMigrationCurrentRepository:
        def __init__(self):
            self.currents = [
                SimpleNamespace(
                    id="current-old",
                    context_id="context-old",
                    record_instance_id="record-old",
                    field_key="gender",
                    field_path="baseline.gender",
                    selected_event_id="event-old",
                    value_type="text",
                    value_text="女",
                    value_number=None,
                    value_date=None,
                    value_datetime=None,
                    value_json=None,
                    unit=None,
                    selected_by="reviewer-1",
                    selected_at=datetime(2026, 1, 1, 10, 5, 0),
                    review_status="confirmed",
                    updated_at=datetime(2026, 1, 1, 10, 5, 0),
                )
            ]
            self.upserts = []

        async def list_by_context(self, context_id):
            return [current for current in self.currents if current.context_id == context_id]

        async def upsert_selected_value(self, values):
            current = SimpleNamespace(id=f"current-{len(self.currents) + 1}", **values)
            self.currents.append(current)
            self.upserts.append(values)
            return current

    current_repository = FakeMigrationCurrentRepository()
    evidence_repository = FakeEvidenceRepository()
    evidence_repository.created = [
        SimpleNamespace(
            id="evidence-old",
            value_event_id="event-old",
            document_id="document-1",
            page_no=1,
            bbox_json={"polygon": [1, 2, 3, 4]},
            quote_text="性别：女",
            evidence_type="field",
            row_key=None,
            cell_key=None,
            start_offset=0,
            end_offset=4,
            evidence_score=0.9,
            created_at=datetime(2026, 1, 1, 10, 0, 0),
        )
    ]
    service = ResearchProjectService(
        context_repository=context_repository,
        record_repository=record_repository,
        schema_service=FakeSchemaService(),
        current_repository=current_repository,
        event_repository=event_repository,
        evidence_repository=evidence_repository,
    )

    target_context = await service.get_or_create_project_crf_context(
        project_patient=SimpleNamespace(
            id="project-patient-1",
            patient_id="patient-1",
            project_id="project-1",
        ),
        binding=SimpleNamespace(schema_version_id="schema-version-2"),
        created_by="user-2",
    )

    assert target_context.schema_version_id == "schema-version-2"
    target_record = record_repository.created[0]
    assert target_record.context_id == target_context.id
    assert target_record.form_key == "baseline"

    migrated_event = event_repository.events[-1]
    assert migrated_event.event_type == "schema_version_migration"
    assert migrated_event.context_id == target_context.id
    assert migrated_event.record_instance_id == target_record.id
    assert migrated_event.source_event_id == "event-old"
    assert migrated_event.value_text == "女"
    assert migrated_event.review_status == "accepted"
    assert migrated_event.created_by == "user-2"

    assert current_repository.upserts[0]["context_id"] == target_context.id
    assert current_repository.upserts[0]["record_instance_id"] == target_record.id
    assert current_repository.upserts[0]["selected_event_id"] == migrated_event.id
    assert current_repository.upserts[0]["review_status"] == "confirmed"

    copied_evidence = [
        evidence for evidence in evidence_repository.created if evidence.value_event_id == migrated_event.id
    ]
    assert len(copied_evidence) == 1
    assert copied_evidence[0].quote_text == "性别：女"
    assert copied_evidence[0].bbox_json == {"polygon": [1, 2, 3, 4]}
