from datetime import datetime
from typing import Any

from sqlalchemy import select

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
from app.repositories import (
    DataContextRepository,
    FieldCurrentValueRepository,
    FieldValueEventRepository,
    FieldValueEvidenceRepository,
    PatientRepository,
    ProjectPatientRepository,
    ProjectTemplateBindingRepository,
    RecordInstanceRepository,
    ResearchProjectRepository,
)
from app.services.schema_service import SchemaService
from app.services.schema_field_planner import schema_leaf_paths, schema_top_level_forms
from app.services.structured_value_service import StructuredValueService
from core.db import Transactional, session


class ResearchProjectServiceError(ValueError):
    pass


class ResearchProjectNotFoundError(ResearchProjectServiceError):
    pass


class ResearchProjectConflictError(ResearchProjectServiceError):
    pass


class ResearchProjectService:
    def __init__(
        self,
        project_repository: ResearchProjectRepository | None = None,
        project_patient_repository: ProjectPatientRepository | None = None,
        binding_repository: ProjectTemplateBindingRepository | None = None,
        context_repository: DataContextRepository | None = None,
        patient_repository: PatientRepository | None = None,
        record_repository: RecordInstanceRepository | None = None,
        schema_service: SchemaService | None = None,
        value_service: StructuredValueService | None = None,
        current_repository: FieldCurrentValueRepository | None = None,
        event_repository: FieldValueEventRepository | None = None,
        evidence_repository: FieldValueEvidenceRepository | None = None,
    ):
        self.project_repository = project_repository or ResearchProjectRepository()
        self.project_patient_repository = project_patient_repository or ProjectPatientRepository()
        self.binding_repository = binding_repository or ProjectTemplateBindingRepository()
        self.context_repository = context_repository or DataContextRepository()
        self.patient_repository = patient_repository or PatientRepository()
        self.record_repository = record_repository or RecordInstanceRepository()
        self.schema_service = schema_service or SchemaService()
        self.value_service = value_service or StructuredValueService()
        self.current_repository = current_repository or FieldCurrentValueRepository()
        self.event_repository = event_repository or FieldValueEventRepository()
        self.evidence_repository = evidence_repository or FieldValueEvidenceRepository()

    async def list_projects(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        status: str | None = None,
        owner_id: str | None = None,
    ) -> tuple[list[ResearchProject], int]:
        offset = (page - 1) * page_size
        projects = await self.project_repository.list_projects(status=status, limit=page_size, offset=offset, owner_id=owner_id)
        total = await self.project_repository.count_projects(status=status, owner_id=owner_id)
        return projects, total

    async def list_projects_with_stats(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        status: str | None = None,
        owner_id: str | None = None,
    ) -> tuple[list[ResearchProject], int, dict[str, dict[str, Any]]]:
        """同 list_projects，但额外返回每个项目的统计信息（入组人数、平均完整度、负责人名等）。"""
        projects, total = await self.list_projects(page=page, page_size=page_size, status=status, owner_id=owner_id)
        stats = await self.compute_project_stats(projects)
        return projects, total, stats

    async def get_project(self, project_id: str, *, owner_id: str | None = None) -> ResearchProject | None:
        project = await self.project_repository.get_by_id(project_id)
        if project is None:
            return None
        if owner_id is not None and project.owner_id != owner_id:
            return None
        return project

    async def get_project_stats(self, project: ResearchProject) -> dict[str, Any]:
        """单个项目的统计信息（与列表口径一致）。"""
        stats = await self.compute_project_stats([project])
        return stats.get(project.id, self._empty_project_stats(project))

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

    async def list_template_bindings(self, project_id: str, *, owner_id: str | None = None) -> list[ProjectTemplateBinding]:
        project = await self.get_project(project_id, owner_id=owner_id)
        if project is None:
            raise ResearchProjectNotFoundError("Research project not found")
        return await self.binding_repository.list_by_project(project_id)

    async def list_project_patients(self, project_id: str, *, owner_id: str | None = None) -> list[ProjectPatient]:
        project = await self.get_project(project_id, owner_id=owner_id)
        if project is None:
            raise ResearchProjectNotFoundError("Research project not found")
        return await self.project_patient_repository.list_by_project(project_id)

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

    @Transactional()
    async def bind_crf_template(
        self,
        *,
        project_id: str,
        template_id: str,
        schema_version_id: str,
        binding_type: str = "primary_crf",
    ) -> ProjectTemplateBinding:
        project = await self.get_project(project_id)
        if project is None or project.status == "archived":
            raise ResearchProjectNotFoundError("Research project not found")
        version = await self.schema_service.get_version(schema_version_id)
        if version is None or version.template_id != template_id:
            raise ResearchProjectNotFoundError("Schema template version not found")
        return await self.binding_repository.create(
            {
                "project_id": project_id,
                "template_id": template_id,
                "schema_version_id": schema_version_id,
                "binding_type": binding_type,
                "status": "active",
            }
        )

    @Transactional()
    async def disable_template_binding(self, *, project_id: str, binding_id: str) -> ProjectTemplateBinding:
        binding = await self.binding_repository.get_by_id(binding_id)
        if binding is None or binding.project_id != project_id:
            raise ResearchProjectNotFoundError("Project template binding not found")
        binding.status = "disabled"
        return await self.binding_repository.save(binding)

    @Transactional()
    async def enroll_patient(
        self,
        *,
        project_id: str,
        patient_id: str,
        enroll_no: str | None = None,
        extra_json: dict[str, Any] | None = None,
        created_by: str | None = None,
    ) -> ProjectPatient:
        project = await self.get_project(project_id)
        if project is None or project.status == "archived":
            raise ResearchProjectNotFoundError("Research project not found")

        patient = await self.patient_repository.get_active_by_id(patient_id)
        if patient is None:
            raise ResearchProjectNotFoundError("Patient not found")

        existing = await self.project_patient_repository.get_by_project_patient(project_id, patient_id)
        if existing is not None:
            project_patient = existing
            if project_patient.status == "withdrawn":
                project_patient.status = "enrolled"
                project_patient.withdrawn_at = None
                project_patient.enrolled_at = datetime.utcnow()
                project_patient = await self.project_patient_repository.save(project_patient)
        else:
            project_patient = await self.project_patient_repository.create(
                {
                    "project_id": project_id,
                    "patient_id": patient_id,
                    "enroll_no": enroll_no,
                    "status": "enrolled",
                    "enrolled_at": datetime.utcnow(),
                    "extra_json": extra_json,
                }
            )

        binding = await self.binding_repository.get_active_primary_crf(project_id)
        if binding is not None:
            await self.get_or_create_project_crf_context(
                project_patient=project_patient,
                binding=binding,
                created_by=created_by,
            )

        return project_patient

    @Transactional()
    async def withdraw_project_patient(self, *, project_id: str, project_patient_id: str) -> ProjectPatient:
        project_patient = await self.project_patient_repository.get_by_id(project_patient_id)
        if project_patient is None or project_patient.project_id != project_id:
            raise ResearchProjectNotFoundError("Project patient not found")
        project_patient.status = "withdrawn"
        project_patient.withdrawn_at = datetime.utcnow()
        return await self.project_patient_repository.save(project_patient)

    async def get_or_create_project_crf_context(
        self,
        *,
        project_patient: ProjectPatient,
        binding: ProjectTemplateBinding,
        created_by: str | None = None,
    ) -> DataContext:
        context = await self.context_repository.get_project_crf(project_patient.id, binding.schema_version_id)
        if context is not None:
            return context

        context = await self.context_repository.create(
            {
                "context_type": "project_crf",
                "patient_id": project_patient.patient_id,
                "project_id": project_patient.project_id,
                "project_patient_id": project_patient.id,
                "schema_version_id": binding.schema_version_id,
                "status": "draft",
                "created_by": created_by,
            }
        )
        version = await self.schema_service.get_version(binding.schema_version_id)
        if version is not None:
            await self.initialize_default_record_instances(context_id=context.id, schema_json=version.schema_json)
        return context

    async def get_project_crf(
        self,
        *,
        project_id: str,
        project_patient_id: str,
        created_by: str | None = None,
    ) -> dict[str, Any]:
        project_patient = await self._get_project_patient_or_404(project_id, project_patient_id)
        binding = await self.binding_repository.get_active_primary_crf(project_id)
        if binding is None:
            return {"context": None, "schema": None, "records": [], "current_values": {}}

        context = await self.get_or_create_project_crf_context(
            project_patient=project_patient,
            binding=binding,
            created_by=created_by,
        )
        schema_version = await self.schema_service.get_version(context.schema_version_id)
        records = await self.record_repository.list_by_context(context.id)
        current_values = await self.current_repository.list_by_context(context.id)
        return {
            "context": context,
            "schema": schema_version.schema_json if schema_version is not None else None,
            "records": records,
            "current_values": self._current_values_by_display_path(
                current_values,
                schema_version.schema_json if schema_version is not None else None,
            ),
        }

    async def list_crf_field_events(
        self,
        *,
        project_id: str,
        project_patient_id: str,
        field_path: str,
    ) -> list[FieldValueEvent]:
        context = await self._get_project_crf_context_or_404(project_id, project_patient_id)
        for query_path in self._field_path_aliases(field_path):
            events = await self.event_repository.list_by_field(context_id=context.id, field_path=query_path)
            if events:
                evidences = await self.evidence_repository.list_by_field(context_id=context.id, field_path=query_path)
                evidences_by_event_id: dict[str, list[FieldValueEvidence]] = {}
                for evidence in evidences:
                    evidences_by_event_id.setdefault(evidence.value_event_id, []).append(evidence)
                for event in events:
                    event_evidences = evidences_by_event_id.get(event.id, [])
                    relevant_evidences = self._relevant_evidences_for_field(
                        event_evidences,
                        field_path=event.field_path,
                        field_key=event.field_key,
                        field_title=event.field_title,
                        value=self._event_display_value(event),
                    )
                    evidence = relevant_evidences[0] if relevant_evidences else None
                    if evidence is not None:
                        setattr(event, "source_page", evidence.page_no)
                        setattr(event, "source_text", evidence.quote_text)
                        setattr(event, "source_location", self._source_location_from_evidence(evidence))
                return events
        return []

    async def list_crf_field_candidates(
        self,
        *,
        project_id: str,
        project_patient_id: str,
        field_path: str,
    ) -> dict[str, Any]:
        context = await self._get_project_crf_context_or_404(project_id, project_patient_id)
        query_path = await self._resolve_existing_field_path(context_id=context.id, field_path=field_path)
        events = await self.event_repository.list_candidates_by_context_field(context_id=context.id, field_path=query_path)
        current_values = await self.current_repository.list_by_context(context.id)
        current = next((value for value in current_values if value.field_path == query_path), None)
        evidences = await self.evidence_repository.list_by_field(context_id=context.id, field_path=query_path)
        evidences_by_event_id: dict[str, list[FieldValueEvidence]] = {}
        for evidence in evidences:
            evidences_by_event_id.setdefault(evidence.value_event_id, []).append(evidence)

        candidates = []
        distinct_values: set[str] = set()
        for event in events:
            value = self._event_display_value(event)
            distinct_values.add(str(value))
            event_evidences = evidences_by_event_id.get(event.id, [])
            relevant_evidences = self._relevant_evidences_for_field(
                event_evidences,
                field_path=event.field_path,
                field_key=event.field_key,
                field_title=event.field_title,
                value=value,
            )
            evidence = relevant_evidences[0] if relevant_evidences else None
            candidates.append(
                {
                    "id": event.id,
                    "event_id": event.id,
                    "value": value,
                    "value_type": event.value_type,
                    "review_status": event.review_status,
                    "confidence": float(event.confidence) if event.confidence is not None else None,
                    "source_document_id": event.source_document_id,
                    "source_page": evidence.page_no if evidence is not None else None,
                    "source_text": evidence.quote_text if evidence is not None else None,
                    "source_location": self._source_location_from_evidence(evidence) if evidence is not None else None,
                    "created_at": event.created_at,
                }
            )

        selected_value = self._current_display_value(current) if current is not None else None
        return {
            "candidates": candidates,
            "selected_candidate_id": current.selected_event_id if current is not None else None,
            "selected_value": selected_value,
            "has_value_conflict": len(distinct_values) > 1,
            "distinct_value_count": len(distinct_values),
        }

    async def list_crf_field_evidence(
        self,
        *,
        project_id: str,
        project_patient_id: str,
        field_path: str,
    ) -> list[FieldValueEvidence]:
        context = await self._get_project_crf_context_or_404(project_id, project_patient_id)
        query_path = await self._resolve_existing_field_path(context_id=context.id, field_path=field_path)
        current_values = await self.current_repository.list_by_context(context.id)
        current = next((value for value in current_values if value.field_path == query_path), None)
        if current is not None and current.selected_event_id:
            evidences = await self.evidence_repository.list_by_event(current.selected_event_id)
            return self._relevant_evidences_for_field(
                evidences,
                field_path=current.field_path,
                field_key=current.field_key,
                field_title=None,
                value=self._current_display_value(current),
            )
        return await self.evidence_repository.list_by_field(context_id=context.id, field_path=query_path)

    def _canonical_field_path(self, field_path: str) -> str:
        parts = [part for part in str(field_path or "").split(".") if part and not part.isdigit()]
        return ".".join(parts)

    def _field_path_aliases(self, field_path: str) -> list[str]:
        raw_path = str(field_path or "").strip()
        canonical_path = self._canonical_field_path(raw_path)
        return list(dict.fromkeys(path for path in [raw_path, canonical_path] if path))

    async def _resolve_existing_field_path(self, *, context_id: str, field_path: str) -> str:
        current_values = await self.current_repository.list_by_context(context_id)
        existing_paths = {value.field_path for value in current_values}
        for query_path in self._field_path_aliases(field_path):
            if query_path in existing_paths:
                return query_path
        return self._canonical_field_path(field_path)

    def _source_location_from_evidence(self, evidence: FieldValueEvidence) -> dict[str, Any] | list[Any] | None:
        location = evidence.bbox_json
        if isinstance(location, dict):
            next_location = dict(location)
            next_location.setdefault("page", evidence.page_no or next_location.get("page_no") or 1)
            next_location.setdefault("page_no", evidence.page_no or next_location.get("page") or 1)
            if "position" not in next_location and isinstance(next_location.get("polygon"), list):
                next_location["position"] = next_location["polygon"]
            return next_location
        return location

    def _relevant_evidences_for_field(
        self,
        evidences: list[FieldValueEvidence],
        *,
        field_path: str,
        field_key: str | None,
        field_title: str | None,
        value: Any,
    ) -> list[FieldValueEvidence]:
        return [
            evidence
            for evidence in evidences
            if self._evidence_matches_field(
                evidence,
                field_path=field_path,
                field_key=field_key,
                field_title=field_title,
                value=value,
            )
        ]

    def _evidence_matches_field(
        self,
        evidence: FieldValueEvidence,
        *,
        field_path: str,
        field_key: str | None,
        field_title: str | None,
        value: Any,
    ) -> bool:
        quote = self._compact_text(evidence.quote_text)
        if not quote:
            return False
        value_text = self._compact_text(value)
        if value_text and value_text in quote:
            return True
        for candidate in (field_key, field_title, str(field_path or "").split(".")[-1]):
            text = self._compact_text(candidate)
            if text and text in quote:
                return True
        return False

    def _compact_text(self, value: Any) -> str:
        return "".join(str(value or "").split())

    def _current_values_by_display_path(
        self,
        current_values: list[FieldCurrentValue],
        schema_json: dict[str, Any] | None,
    ) -> dict[str, FieldCurrentValue]:
        output: dict[str, FieldCurrentValue] = {}
        original_paths: dict[str, str] = {}
        for value in current_values:
            display_path = self._schema_display_path(value.field_path, schema_json)
            existing_path = original_paths.get(display_path)
            if existing_path is not None and self._path_has_index(existing_path) and not self._path_has_index(value.field_path):
                continue
            output[display_path] = value
            original_paths[display_path] = value.field_path
        return output

    def _schema_display_path(self, field_path: str, schema_json: dict[str, Any] | None) -> str:
        if not isinstance(schema_json, dict):
            return field_path
        parts = [part for part in str(field_path or "").split(".") if part]
        if not parts:
            return field_path
        output: list[str] = []
        schema_node: Any = schema_json
        index = 0
        while index < len(parts):
            if self._is_schema_array_record(schema_node):
                part = parts[index]
                if part.isdigit():
                    output.append(part)
                    index += 1
                else:
                    output.append("0")
                schema_node = (schema_node.get("items") or {}) if isinstance(schema_node, dict) else {}
                continue

            part = parts[index]
            output.append(part)
            schema_node = (
                (schema_node.get("properties") or {}).get(part)
                if isinstance(schema_node, dict) and isinstance(schema_node.get("properties"), dict)
                else None
            )
            index += 1
        return ".".join(output)

    def _is_schema_array_record(self, schema_node: Any) -> bool:
        return (
            isinstance(schema_node, dict)
            and schema_node.get("type") == "array"
            and isinstance((schema_node.get("items") or {}).get("properties"), dict)
        )

    def _path_has_index(self, field_path: str) -> bool:
        return any(part.isdigit() for part in str(field_path or "").split("."))

    @Transactional()
    async def manual_update_crf_field(
        self,
        *,
        project_id: str,
        project_patient_id: str,
        field_path: str,
        value_type: str,
        record_instance_id: str | None = None,
        field_key: str | None = None,
        edited_by: str | None = None,
        note: str | None = None,
        values: dict[str, Any],
    ) -> FieldCurrentValue:
        context = await self._get_project_crf_context_or_404(project_id, project_patient_id)
        record = await self._resolve_record(context.id, record_instance_id)
        return await self.value_service.manual_edit(
            context_id=context.id,
            record_instance_id=record.id,
            field_key=field_key or field_path.split(".")[-1],
            field_path=field_path,
            value_type=value_type,
            edited_by=edited_by,
            note=note,
            **values,
        )

    @Transactional()
    async def select_crf_field_event(
        self,
        *,
        project_id: str,
        project_patient_id: str,
        field_path: str,
        event_id: str,
        selected_by: str | None = None,
    ) -> FieldCurrentValue:
        context = await self._get_project_crf_context_or_404(project_id, project_patient_id)
        event = await self.event_repository.get_by_id(event_id)
        allowed_paths = set(self._field_path_aliases(field_path))
        if event is None or event.context_id != context.id or event.field_path not in allowed_paths:
            raise ResearchProjectNotFoundError("CRF field event not found")
        return await self.value_service.select_current_value(event=event, selected_by=selected_by)

    @Transactional()
    async def delete_crf_field_value(self, *, project_id: str, project_patient_id: str, field_path: str) -> None:
        context = await self._get_project_crf_context_or_404(project_id, project_patient_id)
        query_path = await self._resolve_existing_field_path(context_id=context.id, field_path=field_path)
        await self.evidence_repository.delete_by_context_field(context_id=context.id, field_path=query_path)
        await self.current_repository.delete_by_context_field(context_id=context.id, field_path=query_path)
        await self.event_repository.delete_by_context_field(context_id=context.id, field_path=query_path)

    @Transactional()
    async def create_crf_record_instance(
        self,
        *,
        project_id: str,
        project_patient_id: str,
        form_key: str,
        form_title: str | None = None,
        group_key: str | None = None,
        group_title: str | None = None,
        instance_label: str | None = None,
    ) -> RecordInstance:
        context = await self._get_project_crf_context_or_404(project_id, project_patient_id)
        repeat_index = await self.record_repository.next_repeat_index(context_id=context.id, form_key=form_key)
        return await self.record_repository.create(
            {
                "context_id": context.id,
                "group_key": group_key,
                "group_title": group_title,
                "form_key": form_key,
                "form_title": form_title or form_key,
                "repeat_index": repeat_index,
                "instance_label": instance_label or f"{form_title or form_key} #{repeat_index + 1}",
                "review_status": "unreviewed",
            }
        )

    @Transactional()
    async def delete_crf_record_instance(self, *, project_id: str, project_patient_id: str, record_instance_id: str) -> None:
        context = await self._get_project_crf_context_or_404(project_id, project_patient_id)
        record = await self.record_repository.get_by_id(record_instance_id)
        if record is None or record.context_id != context.id:
            raise ResearchProjectNotFoundError("CRF record instance not found")

        events = await self.event_repository.list_by_record(record_instance_id)
        await self.evidence_repository.delete_by_event_ids([event.id for event in events])
        await self.current_repository.delete_by_record(record_instance_id)
        await self.event_repository.delete_by_record(record_instance_id)
        await self.record_repository.delete(record)

    def _event_display_value(self, event: FieldValueEvent) -> Any:
        if event.value_json is not None:
            return event.value_json
        if event.value_number is not None:
            return float(event.value_number)
        if event.value_date is not None:
            return event.value_date.isoformat()
        if event.value_datetime is not None:
            return event.value_datetime.isoformat()
        return event.value_text

    def _current_display_value(self, current: FieldCurrentValue) -> Any:
        if current.value_json is not None:
            return current.value_json
        if current.value_number is not None:
            return float(current.value_number)
        if current.value_date is not None:
            return current.value_date.isoformat()
        if current.value_datetime is not None:
            return current.value_datetime.isoformat()
        return current.value_text

    async def _get_project_patient_or_404(self, project_id: str, project_patient_id: str) -> ProjectPatient:
        project_patient = await self.project_patient_repository.get_by_id(project_patient_id)
        if project_patient is None or project_patient.project_id != project_id or project_patient.status == "withdrawn":
            raise ResearchProjectNotFoundError("Project patient not found")
        return project_patient

    async def _get_project_crf_context_or_404(self, project_id: str, project_patient_id: str) -> DataContext:
        crf = await self.get_project_crf(project_id=project_id, project_patient_id=project_patient_id)
        context = crf["context"]
        if context is None:
            raise ResearchProjectNotFoundError("Project CRF context not found")
        return context

    async def _resolve_record(self, context_id: str, record_instance_id: str | None) -> RecordInstance:
        if record_instance_id is not None:
            record = await self.record_repository.get_by_id(record_instance_id)
            if record is None or record.context_id != context_id:
                raise ResearchProjectNotFoundError("Record instance not found")
            return record

        records = await self.record_repository.list_by_context(context_id)
        if not records:
            raise ResearchProjectNotFoundError("Record instance not found")
        return records[0]

    async def initialize_default_record_instances(
        self,
        *,
        context_id: str,
        schema_json: dict[str, Any],
    ) -> list[RecordInstance]:
        created: list[RecordInstance] = []
        for form in schema_top_level_forms(schema_json):
            existing = await self.record_repository.get_by_form(
                context_id=context_id,
                form_key=form["form_key"],
                repeat_index=0,
            )
            if existing is not None:
                continue
            created.append(
                await self.record_repository.create(
                    {
                        "context_id": context_id,
                        "group_key": form.get("group_key"),
                        "group_title": form.get("group_title"),
                        "form_key": form["form_key"],
                        "form_title": form["form_title"] or form["form_key"],
                        "repeat_index": 0,
                        "instance_label": form["form_title"] or form["form_key"],
                        "review_status": "unreviewed",
                    }
                )
            )
        return created
