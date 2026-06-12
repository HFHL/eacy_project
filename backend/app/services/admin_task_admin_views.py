from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import func, select

from app.models import (
    Document,
    Patient,
    ProjectPatient,
    ResearchProject,
    SchemaTemplate,
    SchemaTemplateVersion,
    User,
)
from app.services.admin_task_types import (
    ACTIVE_STATUSES,
    AdminTemplateNotFoundError,
    AdminUserNotFoundError,
    VALID_USER_ROLES,
)
from core.db import session


class AdminTaskAdminViewsMixin:
    async def get_stats(self) -> dict[str, Any]:
        task_rows = await self.list_extraction_tasks(limit=1000, offset=0)
        items = task_rows["items"]
        status_counts: dict[str, int] = {}
        for item in items:
            status_counts[item["status"]] = status_counts.get(item["status"], 0) + 1

        return {
            "overview": {
                "total_users": await self._count(User),
                "total_patients": await self._count(Patient),
                "total_documents": await self._count(Document, Document.status != "deleted"),
                "total_projects": await self._count(ResearchProject, ResearchProject.status != "deleted"),
                "total_templates": await self._count(SchemaTemplate, SchemaTemplate.status != "archived"),
                "active_tasks": sum(status_counts.get(status, 0) for status in ACTIVE_STATUSES),
            },
            "tasks": status_counts,
        }

    async def list_users(self) -> list[dict[str, Any]]:
        result = await session.execute(select(User).order_by(User.created_at.desc()).limit(500))
        return [self._user_payload(user) for user in result.scalars().all()]

    async def update_user_status(self, user_id: str, *, is_active: bool) -> dict[str, Any]:
        user = await session.get(User, user_id)
        if user is None:
            raise AdminUserNotFoundError("User not found")
        user.is_active = is_active
        await session.commit()
        await session.refresh(user)
        return self._user_payload(user)

    async def update_user_role(self, user_id: str, *, role: str) -> dict[str, Any]:
        if role not in VALID_USER_ROLES:
            raise ValueError(f"Invalid role: {role}")
        user = await session.get(User, user_id)
        if user is None:
            raise AdminUserNotFoundError("User not found")
        user.role = role
        await session.commit()
        await session.refresh(user)
        return self._user_payload(user)

    async def update_template_visibility(self, template_id: str, *, is_system: bool) -> dict[str, Any]:
        template = await session.get(SchemaTemplate, template_id)
        if template is None or template.status == "archived":
            raise AdminTemplateNotFoundError("Schema template not found")
        template.is_system = is_system
        template.updated_at = datetime.utcnow()
        await session.commit()
        await session.refresh(template)
        latest_versions = await self._latest_template_versions([template.id])
        return self._template_payload(template, latest_versions)

    @staticmethod
    def _user_payload(user: User) -> dict[str, Any]:
        return {
            "id": user.id,
            "name": user.name or user.username,
            "email": user.email,
            "role": user.role,
            "status": "active" if user.is_active else "inactive",
            "permissions": user.permissions,
            "login_at": user.last_login_at,
            "created_at": user.created_at,
        }

    async def list_projects(self) -> list[dict[str, Any]]:
        result = await session.execute(
            select(ResearchProject)
            .where(ResearchProject.status != "deleted")
            .order_by(ResearchProject.created_at.desc())
            .limit(500)
        )
        projects = list(result.scalars().all())
        patient_counts = await self._project_patient_counts([project.id for project in projects])
        return [
            {
                "id": project.id,
                "project_name": project.project_name,
                "description": project.description,
                "status": project.status,
                "patient_count": patient_counts.get(project.id, 0),
                "pi_name": None,
                "created_at": project.created_at,
            }
            for project in projects
        ]

    async def list_templates(self) -> list[dict[str, Any]]:
        result = await session.execute(
            select(SchemaTemplate)
            .where(SchemaTemplate.status != "archived")
            .where(SchemaTemplate.template_type != "project_crf")
            .order_by(SchemaTemplate.created_at.desc())
            .limit(500)
        )
        templates = list(result.scalars().all())
        latest_versions = await self._latest_template_versions([template.id for template in templates])
        return [self._template_payload(template, latest_versions) for template in templates]

    async def list_documents(self, *, page: int = 1, page_size: int = 20) -> dict[str, Any]:
        offset = max(page - 1, 0) * page_size
        total = await self._count(Document, Document.status != "deleted")
        result = await session.execute(
            select(Document, Patient.name)
            .outerjoin(Patient, Patient.id == Document.patient_id)
            .where(Document.status != "deleted")
            .order_by(Document.created_at.desc())
            .limit(page_size)
            .offset(offset)
        )
        items = [
            {
                "id": document.id,
                "file_name": document.file_name or document.original_filename,
                "original_filename": document.original_filename,
                "file_type": document.file_type or document.file_ext,
                "document_type": document.document_type or document.doc_type,
                "is_parsed": document.is_parsed,
                "file_size": document.file_size,
                "document_patient_name": patient_name,
                "document_organization_name": None,
                "status": document.status,
                "created_at": document.created_at,
            }
            for document, patient_name in result.all()
        ]
        return {"items": items, "total": total, "page": page, "page_size": page_size}

    async def _count(self, model: Any, *conditions: Any) -> int:
        query = select(func.count()).select_from(model)
        for condition in conditions:
            query = query.where(condition)
        result = await session.execute(query)
        return int(result.scalar() or 0)

    async def _project_patient_counts(self, project_ids: list[str]) -> dict[str, int]:
        if not project_ids:
            return {}
        result = await session.execute(
            select(ProjectPatient.project_id, func.count(ProjectPatient.id))
            .where(ProjectPatient.project_id.in_(project_ids))
            .where(ProjectPatient.status != "withdrawn")
            .group_by(ProjectPatient.project_id)
        )
        return {project_id: int(count) for project_id, count in result.all()}

    async def _latest_template_versions(self, template_ids: list[str]) -> dict[str, dict[str, Any]]:
        if not template_ids:
            return {}
        result = await session.execute(
            select(SchemaTemplateVersion)
            .where(SchemaTemplateVersion.template_id.in_(template_ids))
            .order_by(SchemaTemplateVersion.template_id, SchemaTemplateVersion.version_no.desc())
        )
        latest: dict[str, dict[str, Any]] = {}
        for version in result.scalars().all():
            if version.template_id in latest:
                continue
            latest[version.template_id] = {
                "version_no": version.version_no,
                "status": version.status,
                "field_count": self._schema_field_count(version.schema_json),
                "form_coverage": self._schema_form_coverage(version.schema_json),
            }
        return latest

    @staticmethod
    def _template_payload(template: SchemaTemplate, latest_versions: dict[str, dict[str, Any]]) -> dict[str, Any]:
        latest_version = latest_versions.get(template.id, {})
        return {
            "id": template.id,
            "template_name": template.template_name,
            "template_code": template.template_code,
            "category": template.template_type,
            "is_system": template.is_system,
            "is_published": latest_version.get("status") == "published",
            "field_count": latest_version.get("field_count"),
            "version": latest_version.get("version_no"),
            "form_coverage": latest_version.get("form_coverage"),
            "source": "database",
            "created_at": template.created_at,
            "updated_at": template.updated_at,
        }

    def _schema_field_count(self, schema_json: Any) -> int:
        if not isinstance(schema_json, dict):
            return 0
        count = 0

        def walk(node: Any) -> None:
            nonlocal count
            if isinstance(node, dict):
                if node.get("type") != "object" or "properties" not in node:
                    if "type" in node:
                        count += 1
                for child in (node.get("properties") or {}).values():
                    walk(child)
                if "items" in node:
                    walk(node["items"])
            elif isinstance(node, list):
                for child in node:
                    walk(child)

        walk(schema_json)
        return count

    def _schema_form_coverage(self, schema_json: Any) -> dict[str, Any]:
        if not isinstance(schema_json, dict):
            return {"total_forms": 0, "with_primary_sources": 0, "missing_primary": []}

        missing: list[dict[str, Any]] = []
        total = 0
        with_primary = 0
        for group_key, group_schema in (schema_json.get("properties") or {}).items():
            if not isinstance(group_schema, dict):
                continue
            for form_key, form_schema in (group_schema.get("properties") or {}).items():
                if not isinstance(form_schema, dict):
                    continue
                target = (
                    form_schema.get("items")
                    if form_schema.get("type") == "array" and isinstance(form_schema.get("items"), dict)
                    else form_schema
                )
                sources = form_schema.get("x-sources") or (target or {}).get("x-sources") or {}
                primary_list = sources.get("primary") if isinstance(sources, dict) else None
                has_primary = isinstance(primary_list, list) and bool([s for s in primary_list if s])
                total += 1
                if has_primary:
                    with_primary += 1
                else:
                    title = (target or {}).get("x-display-name") or form_schema.get("x-display-name") or form_key
                    missing.append(
                        {
                            "form_key": f"{group_key}.{form_key}",
                            "form_title": str(title),
                            "group_key": str(group_key),
                        }
                    )
        return {"total_forms": total, "with_primary_sources": with_primary, "missing_primary": missing}
