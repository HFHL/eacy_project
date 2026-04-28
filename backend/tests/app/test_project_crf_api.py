from datetime import datetime
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api.v1.research.router import get_research_project_service
from app.server import app


client = TestClient(app)


class FakeProjectCrfService:
    def __init__(self):
        self.context = SimpleNamespace(
            id="context-1",
            context_type="project_crf",
            patient_id="patient-1",
            project_id="project-1",
            project_patient_id="project-patient-1",
            schema_version_id="schema-version-1",
            status="draft",
            created_by="dev_admin",
            created_at=datetime(2026, 1, 1),
            updated_at=None,
        )
        self.record = SimpleNamespace(
            id="record-1",
            context_id="context-1",
            group_key="baseline",
            group_title="Baseline",
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
        self.current = None
        self.event = SimpleNamespace(
            id="event-1",
            context_id="context-1",
            record_instance_id="record-1",
            field_key="gender",
            field_path="baseline.demographics.gender",
            field_title="Gender",
            event_type="ai_extracted",
            value_type="text",
            value_text="female",
            value_number=None,
            value_date=None,
            value_datetime=None,
            value_json=None,
            unit=None,
            normalized_text="female",
            confidence=0.98,
            extraction_run_id="run-1",
            source_document_id="document-1",
            source_event_id=None,
            review_status="candidate",
            created_by=None,
            created_at=datetime(2026, 1, 1),
            note=None,
        )
        self.evidence = SimpleNamespace(
            id="evidence-1",
            value_event_id="event-1",
            document_id="document-1",
            page_no=1,
            bbox_json=None,
            quote_text="female",
            evidence_type="mock",
            row_key=None,
            cell_key=None,
            start_offset=None,
            end_offset=None,
            evidence_score=0.98,
            created_at=datetime(2026, 1, 1),
        )

    async def get_project_crf(self, **kwargs):
        return {
            "context": self.context,
            "schema": {"groups": [{"key": "baseline", "forms": [{"key": "demographics"}]}]},
            "records": [self.record],
            "current_values": {} if self.current is None else {self.current.field_path: self.current},
        }

    async def manual_update_crf_field(self, **kwargs):
        self.current = SimpleNamespace(
            id="current-1",
            context_id="context-1",
            record_instance_id=kwargs.get("record_instance_id") or "record-1",
            field_key=kwargs.get("field_key") or "gender",
            field_path=kwargs["field_path"],
            selected_event_id="manual-event-1",
            value_type=kwargs["value_type"],
            value_text=kwargs["values"].get("value_text"),
            value_number=kwargs["values"].get("value_number"),
            value_date=kwargs["values"].get("value_date"),
            value_datetime=kwargs["values"].get("value_datetime"),
            value_json=kwargs["values"].get("value_json"),
            unit=kwargs["values"].get("unit"),
            selected_by=kwargs.get("edited_by"),
            selected_at=datetime(2026, 1, 2),
            review_status="confirmed",
            updated_at=datetime(2026, 1, 2),
        )
        return self.current

    async def list_crf_field_events(self, **kwargs):
        return [self.event]

    async def select_crf_field_event(self, **kwargs):
        self.current = SimpleNamespace(
            id="current-1",
            context_id="context-1",
            record_instance_id="record-1",
            field_key="gender",
            field_path=kwargs["field_path"],
            selected_event_id=kwargs["event_id"],
            value_type="text",
            value_text="female",
            value_number=None,
            value_date=None,
            value_datetime=None,
            value_json=None,
            unit=None,
            selected_by=kwargs.get("selected_by"),
            selected_at=datetime(2026, 1, 3),
            review_status="confirmed",
            updated_at=datetime(2026, 1, 3),
        )
        return self.current

    async def list_crf_field_evidence(self, **kwargs):
        return [self.evidence]


def test_project_crf_view_edit_events_select_and_evidence_flow():
    fake_service = FakeProjectCrfService()
    app.dependency_overrides[get_research_project_service] = lambda: fake_service

    crf_response = client.get("/api/v1/projects/project-1/patients/project-patient-1/crf")
    assert crf_response.status_code == 200
    crf = crf_response.json()
    assert crf["context"]["context_type"] == "project_crf"
    assert crf["records"][0]["id"] == "record-1"

    update_response = client.patch(
        "/api/v1/projects/project-1/patients/project-patient-1/crf/fields/baseline.demographics.gender",
        json={"record_instance_id": "record-1", "value_type": "text", "value_text": "female"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["value_text"] == "female"

    events_response = client.get(
        "/api/v1/projects/project-1/patients/project-patient-1/crf/fields/baseline.demographics.gender/events"
    )
    assert events_response.status_code == 200
    assert events_response.json()[0]["id"] == "event-1"

    select_response = client.post(
        "/api/v1/projects/project-1/patients/project-patient-1/crf/fields/baseline.demographics.gender/select-event",
        json={"event_id": "event-1"},
    )
    assert select_response.status_code == 200
    assert select_response.json()["selected_event_id"] == "event-1"

    evidence_response = client.get(
        "/api/v1/projects/project-1/patients/project-patient-1/crf/fields/baseline.demographics.gender/evidence"
    )
    assert evidence_response.status_code == 200
    assert evidence_response.json()[0]["document_id"] == "document-1"

    app.dependency_overrides.clear()
