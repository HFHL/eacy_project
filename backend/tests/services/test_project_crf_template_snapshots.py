from types import SimpleNamespace

import pytest

from app.services.research_project_service import ResearchProjectService
from app.services.schema_service import PROJECT_CRF_TEMPLATE_TYPE, SchemaService


class MemoryTemplateRepository:
    def __init__(self, templates=None):
        self.templates = {item.id: item for item in (templates or [])}
        self.created = []

    async def get_by_id(self, template_id):
        return self.templates.get(template_id)

    async def get_by_code(self, template_code):
        return next((item for item in self.templates.values() if item.template_code == template_code), None)

    async def create(self, params):
        template = SimpleNamespace(id=f"template-{len(self.templates) + 1}", **params)
        self.templates[template.id] = template
        self.created.append(template)
        return template

    async def save(self, template):
        self.templates[template.id] = template
        return template


class MemoryVersionRepository:
    def __init__(self, versions=None):
        self.versions = {item.id: item for item in (versions or [])}
        self.created = []

    async def get_by_id(self, version_id):
        return self.versions.get(version_id)

    async def create(self, params):
        version = SimpleNamespace(id=f"version-{len(self.versions) + 1}", **params)
        self.versions[version.id] = version
        self.created.append(version)
        return version

    async def list_by_template(self, template_id):
        return [item for item in self.versions.values() if item.template_id == template_id]


class MemoryProjectRepository:
    def __init__(self, projects=None):
        self.projects = {item.id: item for item in (projects or [])}
        self.saved = []

    async def get_by_id(self, project_id):
        return self.projects.get(project_id)

    async def save(self, project):
        self.projects[project.id] = project
        self.saved.append(project)
        return project


class MemoryBindingRepository:
    def __init__(self, bindings=None):
        self.bindings = {item.id: item for item in (bindings or [])}
        self.created = []
        self.saved = []

    async def list_by_project(self, project_id):
        return [item for item in self.bindings.values() if item.project_id == project_id]

    async def list_active_bindings_by_template(self, template_id, *, owner_id=None):
        return [
            item
            for item in self.bindings.values()
            if item.template_id == template_id and item.status == "active"
        ]

    async def create(self, params):
        binding = SimpleNamespace(id=f"binding-{len(self.bindings) + 1}", **{"locked_at": None, **params})
        self.bindings[binding.id] = binding
        self.created.append(binding)
        return binding

    async def save(self, binding):
        self.bindings[binding.id] = binding
        self.saved.append(binding)
        return binding


def build_schema_service(project_repository, binding_repository):
    source_template = SimpleNamespace(
        id="global-template",
        template_code="oncology_crf",
        template_name="Oncology CRF",
        template_type="crf",
        description=None,
        status="active",
        created_by="user-1",
        is_system=False,
    )
    source_version = SimpleNamespace(
        id="global-version-1",
        template_id="global-template",
        version_no=3,
        version_name="v3",
        schema_json={"title": "Oncology CRF", "layout_config": {"fieldGroups": []}},
        status="published",
        published_at=None,
        created_by="user-1",
    )
    template_repository = MemoryTemplateRepository([source_template])
    version_repository = MemoryVersionRepository([source_version])
    service = SchemaService(
        template_repository=template_repository,
        version_repository=version_repository,
        binding_repository=binding_repository,
        project_repository=project_repository,
    )
    return service, template_repository, version_repository


@pytest.mark.asyncio
async def test_binding_global_crf_creates_project_snapshot_copy():
    project = SimpleNamespace(
        id="project-1",
        project_name="Study 001",
        status="active",
        owner_id="user-1",
        extra_json=None,
    )
    existing_binding = SimpleNamespace(
        id="binding-old",
        project_id="project-1",
        template_id="old-template",
        schema_version_id="old-version",
        binding_type="primary_crf",
        status="active",
    )
    project_repository = MemoryProjectRepository([project])
    binding_repository = MemoryBindingRepository([existing_binding])
    schema_service, template_repository, version_repository = build_schema_service(
        project_repository,
        binding_repository,
    )
    service = ResearchProjectService(
        project_repository=project_repository,
        binding_repository=binding_repository,
        schema_service=schema_service,
    )

    binding = await ResearchProjectService.bind_crf_template.__wrapped__(
        service,
        project_id="project-1",
        template_id="global-template",
        schema_version_id="global-version-1",
        owner_id="user-1",
    )

    assert binding.template_id != "global-template"
    assert binding.schema_version_id != "global-version-1"
    assert existing_binding.status == "disabled"
    snapshot_template = template_repository.templates[binding.template_id]
    snapshot_version = version_repository.versions[binding.schema_version_id]
    assert snapshot_template.template_type == PROJECT_CRF_TEMPLATE_TYPE
    assert snapshot_version.schema_json["project_snapshot"]["project_id"] == "project-1"
    assert snapshot_version.schema_json["project_snapshot"]["source_template_id"] == "global-template"
    assert project.extra_json["crf_template_id"] == snapshot_template.id
    assert project.extra_json["template_scope_config"]["source_schema_version_id"] == "global-version-1"


@pytest.mark.asyncio
async def test_archiving_global_crf_keeps_existing_project_on_snapshot():
    project = SimpleNamespace(
        id="project-1",
        project_name="Study 001",
        status="active",
        owner_id="user-1",
        extra_json={"crf_template_id": "global-template"},
    )
    legacy_binding = SimpleNamespace(
        id="binding-1",
        project_id="project-1",
        template_id="global-template",
        schema_version_id="global-version-1",
        binding_type="primary_crf",
        status="active",
        locked_at=None,
    )
    project_repository = MemoryProjectRepository([project])
    binding_repository = MemoryBindingRepository([legacy_binding])
    schema_service, template_repository, version_repository = build_schema_service(
        project_repository,
        binding_repository,
    )

    archived = await SchemaService.archive_template.__wrapped__(
        schema_service,
        "global-template",
        editable_by="user-1",
    )

    assert archived.status == "archived"
    assert legacy_binding.status == "disabled"
    active_bindings = [
        item for item in binding_repository.bindings.values() if item.project_id == "project-1" and item.status == "active"
    ]
    assert len(active_bindings) == 1
    active_binding = active_bindings[0]
    snapshot_template = template_repository.templates[active_binding.template_id]
    snapshot_version = version_repository.versions[active_binding.schema_version_id]
    assert snapshot_template.template_type == PROJECT_CRF_TEMPLATE_TYPE
    assert snapshot_version.schema_json["project_snapshot"]["source_template_id"] == "global-template"
    assert project.extra_json["crf_template_id"] == snapshot_template.id
