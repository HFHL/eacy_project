from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api.v1.research.router import get_research_project_service
from app.server import app


client = TestClient(app)


class FakeResearchProjectService:
    async def batch_crf_group_fields(self, **kwargs):
        ids = kwargs.get("project_patient_ids") or []
        return [{"project_patient_id": pp_id, "fields": {"a/b/c": {"value": "x"}}} for pp_id in ids]


def test_batch_crf_group_fields_endpoint():
    app.dependency_overrides[get_research_project_service] = lambda: FakeResearchProjectService()
    response = client.post(
        "/api/v1/projects/project-1/patients/crf-group-fields",
        json={"group_id": "a/b", "project_patient_ids": ["pp-1", "pp-2"]},
    )
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["items"]) == 2
    assert payload["items"][0]["fields"]["a/b/c"]["value"] == "x"
    app.dependency_overrides.clear()
