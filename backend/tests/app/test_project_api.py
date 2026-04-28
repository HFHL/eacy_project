from datetime import datetime
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api.v1.research.router import get_research_project_service
from app.server import app


client = TestClient(app)


class FakeResearchProjectService:
    def __init__(self):
        self.projects = {}
        self.bindings = {}
        self.project_patients = {}
        self.created_contexts = []

    async def list_projects(self, **kwargs):
        return list(self.projects.values()), len(self.projects)

    async def create_project(self, **params):
        project = SimpleNamespace(
            id="project-1",
            created_at=datetime(2026, 1, 1),
            updated_at=None,
            **params,
        )
        self.projects[project.id] = project
        return project

    async def get_project(self, project_id):
        return self.projects.get(project_id)

    async def update_project(self, project_id, **params):
        project = self.projects[project_id]
        for key, value in params.items():
            setattr(project, key, value)
        project.updated_at = datetime(2026, 1, 2)
        return project

    async def archive_project(self, project_id):
        project = self.projects[project_id]
        project.status = "archived"
        return project

    async def bind_crf_template(self, **params):
        binding = SimpleNamespace(
            id="binding-1",
            status="active",
            locked_at=None,
            created_at=datetime(2026, 1, 1),
            updated_at=None,
            **params,
        )
        self.bindings[binding.id] = binding
        return binding

    async def disable_template_binding(self, *, project_id, binding_id):
        binding = self.bindings[binding_id]
        binding.status = "disabled"
        return binding

    async def list_project_patients(self, project_id):
        return [patient for patient in self.project_patients.values() if patient.project_id == project_id]

    async def enroll_patient(self, **params):
        project_patient = SimpleNamespace(
            id="project-patient-1",
            status="enrolled",
            enrolled_at=datetime(2026, 1, 1),
            withdrawn_at=None,
            created_at=datetime(2026, 1, 1),
            updated_at=None,
            **params,
        )
        self.project_patients[project_patient.id] = project_patient
        self.created_contexts.append(
            {
                "context_type": "project_crf",
                "project_id": params["project_id"],
                "project_patient_id": project_patient.id,
            }
        )
        return project_patient

    async def withdraw_project_patient(self, *, project_id, project_patient_id):
        project_patient = self.project_patients[project_patient_id]
        project_patient.status = "withdrawn"
        project_patient.withdrawn_at = datetime(2026, 1, 2)
        return project_patient


def test_project_binding_enrollment_and_archive_flow():
    fake_service = FakeResearchProjectService()
    app.dependency_overrides[get_research_project_service] = lambda: fake_service

    create_response = client.post(
        "/api/v1/projects",
        json={
            "project_code": "study_001",
            "project_name": "Study 001",
            "description": "CRF study",
        },
    )
    assert create_response.status_code == 201
    project = create_response.json()
    assert project["status"] == "active"

    list_response = client.get("/api/v1/projects", params={"page": 1, "page_size": 10})
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 1

    update_response = client.patch(f"/api/v1/projects/{project['id']}", json={"project_name": "Study 001A"})
    assert update_response.status_code == 200
    assert update_response.json()["project_name"] == "Study 001A"

    binding_response = client.post(
        f"/api/v1/projects/{project['id']}/template-bindings",
        json={
            "template_id": "template-1",
            "schema_version_id": "version-1",
            "binding_type": "primary_crf",
        },
    )
    assert binding_response.status_code == 201
    binding = binding_response.json()
    assert binding["status"] == "active"

    enroll_response = client.post(
        f"/api/v1/projects/{project['id']}/patients",
        json={"patient_id": "patient-1", "enroll_no": "S001-001"},
    )
    assert enroll_response.status_code == 201
    project_patient = enroll_response.json()
    assert project_patient["status"] == "enrolled"
    assert fake_service.created_contexts[0]["context_type"] == "project_crf"

    patients_response = client.get(f"/api/v1/projects/{project['id']}/patients")
    assert patients_response.status_code == 200
    assert patients_response.json()[0]["id"] == project_patient["id"]

    withdraw_response = client.delete(f"/api/v1/projects/{project['id']}/patients/{project_patient['id']}")
    assert withdraw_response.status_code == 200
    assert withdraw_response.json()["status"] == "withdrawn"
    assert withdraw_response.json()["withdrawn_at"] is not None

    disable_binding_response = client.delete(f"/api/v1/projects/{project['id']}/template-bindings/{binding['id']}")
    assert disable_binding_response.status_code == 200
    assert disable_binding_response.json()["status"] == "disabled"

    archive_response = client.delete(f"/api/v1/projects/{project['id']}")
    assert archive_response.status_code == 200
    assert archive_response.json()["status"] == "archived"

    app.dependency_overrides.clear()
