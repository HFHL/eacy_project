from fastapi.testclient import TestClient

from app.server import app


client = TestClient(app)


def test_health_check():
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_openapi_contains_v1_module_routes():
    schema = client.get("/openapi.json").json()

    expected_paths = {
        "/api/v1/auth/",
        "/api/v1/patients/",
        "/api/v1/documents/",
        "/api/v1/extraction-jobs",
        "/api/v1/ehr/",
        "/api/v1/schema-templates",
        "/api/v1/projects",
        "/api/v1/admin/",
    }

    assert expected_paths.issubset(set(schema["paths"]))
