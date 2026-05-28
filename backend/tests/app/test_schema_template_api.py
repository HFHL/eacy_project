from datetime import datetime
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.core.auth import CurrentUser, get_current_user
from app.api.v1.templates.router import get_schema_service
from app.services.schema_service import SchemaNotFoundError
from app.server import app


client = TestClient(app)


class FakeSchemaService:
    def __init__(self):
        self.templates = {}
        self.versions = {}

    async def list_templates(self, **kwargs):
        created_by = kwargs.get("created_by")
        items = list(self.templates.values())
        if created_by is not None:
            items = [
                item
                for item in items
                if getattr(item, "created_by", None) == created_by or getattr(item, "is_system", False)
            ]
        return items, len(items)

    async def get_template(self, template_id, **kwargs):
        template = self.templates.get(template_id)
        created_by = kwargs.get("created_by")
        if template is None:
            return None
        if created_by is not None and getattr(template, "created_by", None) != created_by and not getattr(template, "is_system", False):
            return None
        return template

    async def list_versions(self, template_id):
        return [version for version in self.versions.values() if version.template_id == template_id]

    async def create_template(self, **params):
        template = SimpleNamespace(
            id="template-1",
            created_at=datetime(2026, 1, 1),
            updated_at=None,
            is_system=False,
            **params,
        )
        self.templates[template.id] = template
        return template

    async def update_template(self, template_id, **params):
        template = self.templates.get(template_id)
        if template is None:
            raise SchemaNotFoundError("Schema template not found")
        for key, value in params.items():
            setattr(template, key, value)
        template.updated_at = datetime(2026, 1, 2)
        return template

    async def archive_template(self, template_id):
        template = self.templates.get(template_id)
        if template is None:
            raise SchemaNotFoundError("Schema template not found")
        template.status = "archived"
        template.updated_at = datetime(2026, 1, 2)
        return template

    async def create_version(self, **params):
        if params["template_id"] not in self.templates:
            raise SchemaNotFoundError("Schema template not found")
        version = SimpleNamespace(
            id=f"version-{len(self.versions) + 1}",
            published_at=None,
            created_at=datetime(2026, 1, 1),
            updated_at=None,
            **params,
        )
        self.versions[version.id] = version
        return version

    async def publish_version(self, version_id):
        version = self.versions.get(version_id)
        if version is None:
            raise SchemaNotFoundError("Schema template version not found")
        version.status = "published"
        version.published_at = datetime(2026, 1, 2)
        return version

    async def delete_version(self, version_id):
        version = self.versions.get(version_id)
        if version is None:
            raise SchemaNotFoundError("Schema template version not found")
        if version.status == "draft":
            del self.versions[version_id]
        else:
            version.status = "deprecated"


def test_schema_template_create_version_publish_archive_flow():
    fake_service = FakeSchemaService()
    app.dependency_overrides[get_schema_service] = lambda: fake_service

    create_response = client.post(
        "/api/v1/schema-templates",
        json={
            "template_code": "ehr_default",
            "template_name": "Default EHR",
            "template_type": "ehr",
            "description": "Default patient EHR schema",
        },
    )
    assert create_response.status_code == 201
    template = create_response.json()
    assert template["template_code"] == "ehr_default"
    assert template["status"] == "active"

    list_response = client.get("/api/v1/schema-templates", params={"page": 1, "page_size": 10})
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 1

    update_response = client.patch(
        f"/api/v1/schema-templates/{template['id']}",
        json={"template_name": "Updated EHR", "description": "Updated description"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["template_name"] == "Updated EHR"
    assert update_response.json()["description"] == "Updated description"

    version_response = client.post(
        f"/api/v1/schema-templates/{template['id']}/versions",
        json={
            "version_no": 1,
            "version_name": "v1",
            "schema_json": {"groups": [{"key": "basic", "forms": []}]},
        },
    )
    assert version_response.status_code == 201
    version = version_response.json()
    assert version["status"] == "draft"

    detail_response = client.get(f"/api/v1/schema-templates/{template['id']}")
    assert detail_response.status_code == 200
    assert detail_response.json()["versions"][0]["id"] == version["id"]

    publish_response = client.post(f"/api/v1/schema-template-versions/{version['id']}/publish")
    assert publish_response.status_code == 200
    assert publish_response.json()["status"] == "published"
    assert publish_response.json()["published_at"] is not None

    delete_version_response = client.delete(f"/api/v1/schema-template-versions/{version['id']}")
    assert delete_version_response.status_code == 204
    assert fake_service.versions[version["id"]].status == "deprecated"

    archive_response = client.delete(f"/api/v1/schema-templates/{template['id']}")
    assert archive_response.status_code == 200
    assert archive_response.json()["status"] == "archived"

    app.dependency_overrides.clear()


def test_schema_template_list_includes_system_templates_for_regular_users():
    fake_service = FakeSchemaService()
    fake_service.templates = {
        "own-template": SimpleNamespace(
            id="own-template",
            template_code="own_crf",
            template_name="Own CRF",
            template_type="crf",
            description=None,
            status="active",
            created_by="11111111-1111-4111-8111-111111111111",
            is_system=False,
            created_at=datetime(2026, 1, 1),
            updated_at=None,
        ),
        "system-template": SimpleNamespace(
            id="system-template",
            template_code="admin_system_crf",
            template_name="Admin System CRF",
            template_type="crf",
            description=None,
            status="active",
            created_by="55555555-5555-4555-8555-555555555555",
            is_system=True,
            created_at=datetime(2026, 1, 2),
            updated_at=None,
        ),
        "other-template": SimpleNamespace(
            id="other-template",
            template_code="other_crf",
            template_name="Other CRF",
            template_type="crf",
            description=None,
            status="active",
            created_by="22222222-2222-4222-8222-222222222222",
            is_system=False,
            created_at=datetime(2026, 1, 3),
            updated_at=None,
        ),
    }
    app.dependency_overrides[get_schema_service] = lambda: fake_service
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        id="11111111-1111-4111-8111-111111111111",
        username="user1",
        role="user",
        permissions=[],
    )

    list_response = client.get("/api/v1/schema-templates", params={"template_type": "crf"})

    assert list_response.status_code == 200
    payload = list_response.json()
    codes = {item["template_code"] for item in payload["items"]}
    assert codes == {"own_crf", "admin_system_crf"}
    assert any(item["template_code"] == "admin_system_crf" and item["is_system"] for item in payload["items"])

    detail_response = client.get("/api/v1/schema-templates/system-template")
    assert detail_response.status_code == 200
    assert detail_response.json()["is_system"] is True

    hidden_detail_response = client.get("/api/v1/schema-templates/other-template")
    assert hidden_detail_response.status_code == 404

    app.dependency_overrides.clear()
