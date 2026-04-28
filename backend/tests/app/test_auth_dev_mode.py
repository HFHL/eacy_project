import jwt
from fastapi.testclient import TestClient

from app.server import app
from core.config import config


client = TestClient(app)


def test_auth_me_returns_dev_admin_without_token(monkeypatch):
    monkeypatch.setattr(config, "ENABLE_AUTH", False)

    response = client.get("/api/v1/auth/me")

    assert response.status_code == 200
    assert response.json() == {
        "id": "dev_admin",
        "username": "dev_admin",
        "role": "admin",
        "permissions": ["*"],
    }


def test_business_route_allows_dev_admin_without_token(monkeypatch):
    monkeypatch.setattr(config, "ENABLE_AUTH", False)

    response = client.get("/api/v1/patients/")

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"items", "total", "page", "page_size"}


def test_auth_me_requires_token_when_auth_enabled(monkeypatch):
    monkeypatch.setattr(config, "ENABLE_AUTH", True)

    response = client.get("/api/v1/auth/me")

    assert response.status_code == 401
    assert response.json()["detail"] == "Missing authorization token"


def test_auth_me_returns_jwt_user_when_auth_enabled(monkeypatch):
    monkeypatch.setattr(config, "ENABLE_AUTH", True)
    token = jwt.encode(
        {
            "user_id": 42,
            "username": "alice",
            "role": "researcher",
            "permissions": ["patients:read"],
        },
        config.JWT_SECRET_KEY,
        algorithm=config.JWT_ALGORITHM,
    )

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": "42",
        "username": "alice",
        "role": "researcher",
        "permissions": ["patients:read"],
    }
