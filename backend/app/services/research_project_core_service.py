from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select, text

from app.models import (
    DataContext,
    FieldCurrentValue,
    FieldValueEvent,
    FieldValueEvidence,
    ProjectPatient,
    ProjectTemplateBinding,
    RecordInstance,
    ResearchProject,
    User,
)
from app.repositories import DataContextRepository
from app.services.record_instance_label import record_instance_label
from app.services.research_project_errors import ResearchProjectConflictError, ResearchProjectNotFoundError
from app.services.schema_field_planner import schema_dataset_group_paths, schema_leaf_paths, schema_top_level_forms
from core.db import Transactional, session


class ResearchProjectCoreMixin:
    async def list_projects(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        status: str | None = None,
        search: str | None = None,
        owner_id: str | None = None,
    ) -> tuple[list[ResearchProject], int]:
        offset = (page - 1) * page_size
        projects = await self.project_repository.list_projects(
            status=status,
            search=search,
            limit=page_size,
            offset=offset,
            owner_id=owner_id,
        )
        total = await self.project_repository.count_projects(status=status, search=search, owner_id=owner_id)
        return projects, total

    async def list_projects_with_stats(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        status: str | None = None,
        search: str | None = None,
        owner_id: str | None = None,
    ) -> tuple[list[ResearchProject], int, dict[str, dict[str, Any]]]:
        """同 list_projects，但额外返回每个项目的统计信息（入组人数、平均完整度、负责人名等）。"""
        projects, total = await self.list_projects(
            page=page,
            page_size=page_size,
            status=status,
            search=search,
            owner_id=owner_id,
        )
        stats = await self.compute_project_stats(projects)
        return projects, total, stats

    async def get_project(self, project_id: str, *, owner_id: str | None = None) -> ResearchProject | None:
        project = await self.project_repository.get_by_id(project_id)
        if project is None:
            return None
        if owner_id is not None and str(project.owner_id) != str(owner_id):
            return None
        return project

    async def get_project_stats(self, project: ResearchProject) -> dict[str, Any]:
        """单个项目详情的轻量统计。

        项目详情页会并行加载受试者分页并在前端按当前页重算完整度；这里避免同步扫描
        全项目 CRF 字段值，防止大项目详情接口被完整度聚合拖慢。
        """
        patient_counts = await self.project_patient_repository.count_active_by_projects([project.id])
        pi_names = await self._resolve_principal_investigator_names([project])
        stats = self._empty_project_stats(project)
        stats["actual_patient_count"] = int(patient_counts.get(project.id, 0))
        stats["principal_investigator_name"] = pi_names.get(project.id, "")
        return stats

    async def compute_project_stats(self, projects: list[ResearchProject]) -> dict[str, dict[str, Any]]:
        """对传入的项目集合批量计算 actual_patient_count / avg_completeness / PI 名等。

        实现要点：
        - 入组人数：单次 group-by 查询（status != withdrawn）。
        - 完整度：按项目当前生效的 primary_crf 绑定 schema，对每个 project_patient 的
          project_crf 上下文里"已填字段去重数 / schema 叶子字段数"取平均；项目无绑定或
          无入组时返回 0。
        - PI 名：优先用 extra_json.principal_investigator_name；否则用 owner_id 对应的
          User.name/username；否则空串。
        """
        if not projects:
            return {}
        project_ids = [project.id for project in projects]

        patient_counts = await self.project_patient_repository.count_active_by_projects(project_ids)
        completeness_by_project = await self._compute_project_completeness(project_ids)
        pi_names = await self._resolve_principal_investigator_names(projects)

        results: dict[str, dict[str, Any]] = {}
        for project in projects:
            extra = project.extra_json if isinstance(project.extra_json, dict) else {}
            expected = extra.get("expected_patient_count") or extra.get("target_patient_count")
            try:
                expected_int = int(expected) if expected is not None else None
            except (TypeError, ValueError):
                expected_int = None
            results[project.id] = {
                "actual_patient_count": int(patient_counts.get(project.id, 0)),
                "expected_patient_count": expected_int,
                "avg_completeness": float(completeness_by_project.get(project.id, 0.0)),
                "principal_investigator_name": pi_names.get(project.id, ""),
            }
        return results

    def _empty_project_stats(self, project: ResearchProject) -> dict[str, Any]:
        extra = project.extra_json if isinstance(project.extra_json, dict) else {}
        expected = extra.get("expected_patient_count") or extra.get("target_patient_count")
        try:
            expected_int = int(expected) if expected is not None else None
        except (TypeError, ValueError):
            expected_int = None
        return {
            "actual_patient_count": 0,
            "expected_patient_count": expected_int,
            "avg_completeness": 0.0,
            "principal_investigator_name": "",
        }

    async def _compute_project_completeness(self, project_ids: list[str]) -> dict[str, float]:
        """返回 {project_id: avg_completeness(0~100)}。"""
        if not project_ids:
            return {}
        bindings = await self.binding_repository.list_active_primary_crf_by_projects(project_ids)
        if not bindings:
            return {project_id: 0.0 for project_id in project_ids}

        # 预加载 schema 叶子字段集合（同一 schema_version 只算一次）
        version_ids = list({binding.schema_version_id for binding in bindings})
        leaf_paths_by_version: dict[str, set[str]] = {}
        for version_id in version_ids:
            version = await self.schema_service.get_version(version_id)
            if version is None or not isinstance(version.schema_json, dict):
                leaf_paths_by_version[version_id] = set()
            else:
                leaf_paths_by_version[version_id] = schema_leaf_paths(version.schema_json)

        binding_by_project: dict[str, ProjectTemplateBinding] = {
            binding.project_id: binding for binding in bindings
        }

        active_pps = await self.project_patient_repository.list_active_by_projects(project_ids)
        pp_by_project: dict[str, list[ProjectPatient]] = {}
        for pp in active_pps:
            pp_by_project.setdefault(pp.project_id, []).append(pp)

        all_pp_ids = [pp.id for pp in active_pps]
        contexts = await self.context_repository.list_project_crfs_by_project_patients(all_pp_ids)
        context_by_pp_and_version: dict[tuple[str, str], DataContext] = {}
        for context in contexts:
            key = (context.project_patient_id, context.schema_version_id)
            # 同一组合理论唯一；若有多个保留最新
            existing = context_by_pp_and_version.get(key)
            if existing is None or (context.created_at or datetime.min) > (existing.created_at or datetime.min):
                context_by_pp_and_version[key] = context

        all_context_ids = [context.id for context in context_by_pp_and_version.values()]
        current_values = await self.current_repository.list_by_contexts(all_context_ids)
        filled_paths_by_context: dict[str, set[str]] = {}
        for value in current_values:
            if not self._is_value_filled(value):
                continue
            canonical = self._canonical_field_path(value.field_path)
            if not canonical:
                continue
            filled_paths_by_context.setdefault(value.context_id, set()).add(canonical)

        completeness: dict[str, float] = {}
        for project_id in project_ids:
            binding = binding_by_project.get(project_id)
            if binding is None:
                completeness[project_id] = 0.0
                continue
            leaves = leaf_paths_by_version.get(binding.schema_version_id) or set()
            total_required = len(leaves)
            if total_required == 0:
                completeness[project_id] = 0.0
                continue
            pps = pp_by_project.get(project_id) or []
            if not pps:
                completeness[project_id] = 0.0
                continue
            ratios: list[float] = []
            for pp in pps:
                context = context_by_pp_and_version.get((pp.id, binding.schema_version_id))
                if context is None:
                    ratios.append(0.0)
                    continue
                filled = filled_paths_by_context.get(context.id) or set()
                filled_in_schema = filled & leaves
                ratios.append(len(filled_in_schema) / total_required)
            completeness[project_id] = round(sum(ratios) / len(ratios) * 100.0, 2) if ratios else 0.0
        return completeness

    async def _resolve_principal_investigator_names(
        self,
        projects: list[ResearchProject],
    ) -> dict[str, str]:
        """优先用 extra_json.principal_investigator_name；否则取 owner_id 对应 User 的名字。"""
        names: dict[str, str] = {}
        pending_owner_ids: set[str] = set()
        for project in projects:
            extra = project.extra_json if isinstance(project.extra_json, dict) else {}
            explicit = extra.get("principal_investigator_name") or extra.get("pi_name")
            if isinstance(explicit, str) and explicit.strip():
                names[project.id] = explicit.strip()
                continue
            if project.owner_id:
                pending_owner_ids.add(project.owner_id)

        owner_name_map: dict[str, str] = {}
        if pending_owner_ids:
            result = await session.execute(
                select(User.id, User.name, User.username).where(User.id.in_(list(pending_owner_ids)))
            )
            for user_id, user_name, username in result.all():
                owner_name_map[str(user_id)] = (user_name or username or "").strip()

        for project in projects:
            if project.id in names:
                continue
            owner_id = project.owner_id
            names[project.id] = owner_name_map.get(str(owner_id), "") if owner_id else ""
        return names

    @staticmethod
    def _is_value_filled(value: FieldCurrentValue) -> bool:
        if value.value_text is not None and str(value.value_text).strip() != "":
            return True
        if value.value_number is not None:
            return True
        if value.value_date is not None:
            return True
        if value.value_datetime is not None:
            return True
        if value.value_json is not None and value.value_json != [] and value.value_json != {}:
            return True
        return False

    @Transactional()
    async def create_project(self, *, project_code: str, project_name: str, **params: Any) -> ResearchProject:
        existing = await self.project_repository.get_by_code(project_code)
        if existing is not None:
            raise ResearchProjectConflictError("Research project code already exists")
        return await self.project_repository.create(
            {"project_code": project_code, "project_name": project_name, **params}
        )

    @Transactional()
    async def update_project(self, project_id: str, *, owner_id: str | None = None, **params: Any) -> ResearchProject:
        project = await self.get_project(project_id, owner_id=owner_id)
        if project is None:
            raise ResearchProjectNotFoundError("Research project not found")
        for key, value in params.items():
            setattr(project, key, value)
        return await self.project_repository.save(project)

    @Transactional()
    async def archive_project(self, project_id: str, *, owner_id: str | None = None) -> ResearchProject:
        project = await self.get_project(project_id, owner_id=owner_id)
        if project is None:
            raise ResearchProjectNotFoundError("Research project not found")
        project.status = "deleted"
        return await self.project_repository.save(project)
