from datetime import datetime
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api.v1.patients.router import get_patient_service
from app.server import app


client = TestClient(app)


class FakePatientService:
    def __init__(self):
        self.patients = {}

    async def create_patient(self, **params):
        patient = SimpleNamespace(
            id="patient-1",
            created_at=datetime(2026, 1, 1),
            updated_at=None,
            deleted_at=None,
            **{key: params.get(key) for key in (
                "name",
                "gender",
                "birth_date",
                "age",
                "department",
                "main_diagnosis",
                "doctor_name",
                "extra_json",
            )},
        )
        self.patients[patient.id] = patient
        return patient

    async def list_patients(self, **kwargs):
        return list(self.patients.values()), len(self.patients)

    async def get_patient(self, patient_id):
        return self.patients.get(patient_id)

    async def update_patient(self, patient_id, **params):
        patient = self.patients[patient_id]
        for key, value in params.items():
            setattr(patient, key, value)
        patient.updated_at = datetime(2026, 1, 2)
        return patient

    async def delete_patient(self, patient_id):
        self.patients.pop(patient_id, None)


def test_patient_crud_flow():
    fake_service = FakePatientService()
    app.dependency_overrides[get_patient_service] = lambda: fake_service

    create_response = client.post(
        "/api/v1/patients",
        json={
            "name": "Test Patient",
            "gender": "female",
            "age": 42,
            "department": "Cardiology",
            "main_diagnosis": "Hypertension",
            "doctor_name": "Dr. Chen",
        },
    )

    assert create_response.status_code == 201
    created = create_response.json()
    patient_id = created["id"]
    assert created["name"] == "Test Patient"

    list_response = client.get("/api/v1/patients", params={"keyword": "Test", "page": 1, "page_size": 10})
    assert list_response.status_code == 200
    listed = list_response.json()
    assert listed["total"] == 1
    assert listed["items"][0]["id"] == patient_id

    detail_response = client.get(f"/api/v1/patients/{patient_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["department"] == "Cardiology"

    update_response = client.patch(
        f"/api/v1/patients/{patient_id}",
        json={"department": "Neurology", "age": 43},
    )
    assert update_response.status_code == 200
    assert update_response.json()["department"] == "Neurology"
    assert update_response.json()["age"] == 43

    delete_response = client.delete(f"/api/v1/patients/{patient_id}")
    assert delete_response.status_code == 204

    missing_response = client.get(f"/api/v1/patients/{patient_id}")
    assert missing_response.status_code == 404

    empty_list_response = client.get("/api/v1/patients")
    assert empty_list_response.status_code == 200
    assert empty_list_response.json()["total"] == 0

    app.dependency_overrides.clear()
