from datetime import datetime
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api.v1.patients.router import get_ehr_service
from app.server import app


client = TestClient(app)


class FakeEhrService:
    def __init__(self):
        self.context = SimpleNamespace(
            id="context-1",
            context_type="patient_ehr",
            patient_id="patient-1",
            project_id=None,
            project_patient_id=None,
            schema_version_id="schema-version-1",
            status="draft",
            created_by="dev_admin",
            created_at=datetime(2026, 1, 1),
            updated_at=None,
        )
        self.record = SimpleNamespace(
            id="record-1",
            context_id="context-1",
            group_key="basic",
            group_title="Basic",
            form_key="demographics",
            form_title="Demographics",
            repeat_index=0,
            instance_label="Demographics",
            anchor_json=None,
            source_document_id=None,
            created_by_run_id=None,
            review_status="unreviewed",
            created_at=datetime(2026, 1, 1),
            updated_at=None,
        )
        self.event = SimpleNamespace(
            id="event-1",
            context_id="context-1",
            record_instance_id="record-1",
            field_key="age",
            field_path="basic.demographics.age",
            field_title="Age",
            event_type="ai_extracted",
            value_type="number",
            value_text=None,
            value_number=42,
            value_date=None,
            value_datetime=None,
            value_json=None,
            unit="years",
            normalized_text=None,
            confidence=0.95,
            extraction_run_id=None,
            source_document_id="document-1",
            source_event_id=None,
            review_status="candidate",
            created_by=None,
            created_at=datetime(2026, 1, 2),
            note=None,
        )
        self.current = None
        self.evidence = SimpleNamespace(
            id="evidence-1",
            value_event_id="event-1",
            document_id="document-1",
            page_no=1,
            bbox_json=None,
            quote_text="Age 42",
            evidence_type="field",
            row_key=None,
            cell_key=None,
            start_offset=0,
            end_offset=6,
            evidence_score=0.9,
            created_at=datetime(2026, 1, 2),
        )

    async def get_patient_ehr(self, patient_id, created_by=None):
        return {
            "context": self.context,
            "schema": {"groups": [{"key": "basic", "forms": [{"key": "demographics"}]}]},
            "records": [self.record],
            "current_values": {} if self.current is None else {self.current.field_path: self.current},
        }

    async def manual_update_field(self, **kwargs):
        values = kwargs["values"]
        self.current = SimpleNamespace(
            id="current-1",
            context_id="context-1",
            record_instance_id=kwargs.get("record_instance_id") or "record-1",
            field_key=kwargs.get("field_key") or "age",
            field_path=kwargs["field_path"],
            selected_event_id="event-2",
            value_type=kwargs["value_type"],
            value_text=values.get("value_text"),
            value_number=values.get("value_number"),
            value_date=values.get("value_date"),
            value_datetime=values.get("value_datetime"),
            value_json=values.get("value_json"),
            unit=values.get("unit"),
            selected_by=kwargs.get("edited_by"),
            selected_at=datetime(2026, 1, 3),
            review_status="confirmed",
            updated_at=datetime(2026, 1, 3),
        )
        return self.current

    async def list_field_events(self, **kwargs):
        return [self.event]

    async def select_field_event(self, **kwargs):
        self.current = SimpleNamespace(
            id="current-1",
            context_id="context-1",
            record_instance_id="record-1",
            field_key="age",
            field_path=kwargs["field_path"],
            selected_event_id=kwargs["event_id"],
            value_type="number",
            value_text=None,
            value_number=42,
            value_date=None,
            value_datetime=None,
            value_json=None,
            unit="years",
            selected_by=kwargs.get("selected_by"),
            selected_at=datetime(2026, 1, 4),
            review_status="confirmed",
            updated_at=datetime(2026, 1, 4),
        )
        return self.current

    async def list_field_evidence(self, **kwargs):
        return [self.evidence]


def test_patient_ehr_read_update_events_select_and_evidence_flow():
    fake_service = FakeEhrService()
    app.dependency_overrides[get_ehr_service] = lambda: fake_service

    ehr_response = client.get("/api/v1/patients/patient-1/ehr")
    assert ehr_response.status_code == 200
    ehr = ehr_response.json()
    assert ehr["context"]["id"] == "context-1"
    assert ehr["records"][0]["id"] == "record-1"

    update_response = client.patch(
        "/api/v1/patients/patient-1/ehr/fields/basic.demographics.age",
        json={
            "record_instance_id": "record-1",
            "field_key": "age",
            "value_type": "number",
            "value_number": 43,
            "unit": "years",
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["value_number"] == 43
    assert update_response.json()["selected_event_id"] == "event-2"

    events_response = client.get("/api/v1/patients/patient-1/ehr/fields/basic.demographics.age/events")
    assert events_response.status_code == 200
    assert events_response.json()[0]["event_type"] == "ai_extracted"

    select_response = client.post(
        "/api/v1/patients/patient-1/ehr/fields/basic.demographics.age/select-event",
        json={"event_id": "event-1"},
    )
    assert select_response.status_code == 200
    assert select_response.json()["selected_event_id"] == "event-1"

    evidence_response = client.get("/api/v1/patients/patient-1/ehr/fields/basic.demographics.age/evidence")
    assert evidence_response.status_code == 200
    assert evidence_response.json()[0]["document_id"] == "document-1"

    app.dependency_overrides.clear()
