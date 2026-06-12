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


class ResearchProjectPatientMixin:
    async def list_project_patients(
        self,
        project_id: str,
        *,
        owner_id: str | None = None,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[ProjectPatient]:
        project = await self.get_project(project_id, owner_id=owner_id)
        if project is None:
            raise ResearchProjectNotFoundError("Research project not found")
        return await self.project_patient_repository.list_by_project(project_id, limit=limit, offset=offset)

    async def count_project_patients(self, project_id: str, *, owner_id: str | None = None) -> int:
        project = await self.get_project(project_id, owner_id=owner_id)
        if project is None:
            raise ResearchProjectNotFoundError("Research project not found")
        return await self.project_patient_repository.count_by_project(project_id)

    async def list_project_patients_with_summary(
        self,
        project_id: str,
        *,
        owner_id: str | None = None,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """入组患者列表 + 患者摘要 + CRF 完成度（单次批量查询，供数据集列表页使用）。"""
        project_patients = await self.list_project_patients(
            project_id,
            owner_id=owner_id,
            limit=limit,
            offset=offset,
        )
        if not project_patients:
            return []

        patient_ids = [pp.patient_id for pp in project_patients]
        patients = await self.patient_repository.list_by_ids(patient_ids, owner_id=owner_id)
        patient_by_id = {patient.id: patient for patient in patients}
        doc_counts = await self.document_repository.count_by_patients(patient_ids, uploaded_by=owner_id)

        binding = await self.binding_repository.get_active_primary_crf(project_id)
        group_paths_by_id: dict[str, set[str]] = {}
        all_leaf_paths: set[str] = set()
        group_titles: dict[str, str] = {}
        if binding is not None:
            version = await self.schema_service.get_version(binding.schema_version_id)
            schema_json = version.schema_json if version is not None else None
            if isinstance(schema_json, dict):
                group_paths_by_id = schema_dataset_group_paths(schema_json)
                all_leaf_paths = schema_leaf_paths(schema_json)
                for group_id, paths in group_paths_by_id.items():
                    group_titles[group_id] = group_id.replace("/", " / ")

        pp_ids = [pp.id for pp in project_patients]
        contexts = await self.context_repository.list_project_crfs_by_project_patients(pp_ids)
        context_by_pp: dict[str, DataContext] = {}
        if binding is not None:
            version_id = binding.schema_version_id
            for context in contexts:
                if context.schema_version_id != version_id:
                    continue
                key = context.project_patient_id
                existing = context_by_pp.get(key)
                if existing is None or (context.created_at or datetime.min) > (existing.created_at or datetime.min):
                    context_by_pp[key] = context

        context_ids = [context.id for context in context_by_pp.values()]
        current_values = await self.current_repository.list_by_contexts(context_ids)
        filled_paths_by_context: dict[str, set[str]] = {}
        for value in current_values:
            if not self._is_value_filled(value):
                continue
            canonical = self._canonical_field_path(value.field_path)
            if not canonical:
                continue
            filled_paths_by_context.setdefault(value.context_id, set()).add(canonical)

        summaries: list[dict[str, Any]] = []
        for pp in project_patients:
            patient = patient_by_id.get(pp.patient_id)
            context = context_by_pp.get(pp.id)
            filled_paths = filled_paths_by_context.get(context.id, set()) if context is not None else set()

            crf_group_stats: dict[str, dict[str, Any]] = {}
            for group_id, leaf_paths in group_paths_by_id.items():
                total = len(leaf_paths)
                filled = len(filled_paths & leaf_paths) if total else 0
                percent = round(filled / total * 100) if total else 0
                crf_group_stats[group_id] = {
                    "group_name": group_titles.get(group_id, group_id),
                    "filled": filled,
                    "total": total,
                    "percent": percent,
                }

            total_required = len(all_leaf_paths)
            if total_required > 0:
                crf_completeness = round(len(filled_paths & all_leaf_paths) / total_required * 100)
            else:
                crf_completeness = 0

            summaries.append(
                {
                    "id": pp.id,
                    "project_id": pp.project_id,
                    "patient_id": pp.patient_id,
                    "enroll_no": pp.enroll_no,
                    "status": pp.status,
                    "enrolled_at": pp.enrolled_at,
                    "withdrawn_at": pp.withdrawn_at,
                    "extra_json": pp.extra_json,
                    "created_at": pp.created_at,
                    "updated_at": pp.updated_at,
                    "patient_name": patient.name if patient is not None else "",
                    "patient_gender": patient.gender if patient is not None else None,
                    "patient_age": patient.age if patient is not None else None,
                    "patient_birth_date": (
                        patient.birth_date.isoformat() if patient is not None and patient.birth_date else None
                    ),
                    "document_count": int(doc_counts.get(pp.patient_id, 0)),
                    "crf_completeness": crf_completeness,
                    "crf_group_stats": crf_group_stats,
                }
            )
        return summaries

    async def batch_crf_group_fields(
        self,
        *,
        project_id: str,
        group_id: str,
        project_patient_ids: list[str],
        owner_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """批量返回多个入组患者在指定字段组下的当前字段值（供数据集表格懒加载）。"""
        project = await self.get_project(project_id, owner_id=owner_id)
        if project is None:
            raise ResearchProjectNotFoundError("Research project not found")

        unique_pp_ids = list(dict.fromkeys(str(item) for item in project_patient_ids if item))
        if not unique_pp_ids:
            return []

        binding = await self.binding_repository.get_active_primary_crf(project_id)
        if binding is None:
            return [{"project_patient_id": pp_id, "fields": {}} for pp_id in unique_pp_ids]

        version = await self.schema_service.get_version(binding.schema_version_id)
        schema_json = version.schema_json if version is not None else None
        group_paths_map = schema_dataset_group_paths(schema_json or {})
        leaf_paths = group_paths_map.get(group_id, set())

        project_patients = await self.project_patient_repository.list_by_ids(unique_pp_ids)
        valid_pp_by_id = {
            pp.id: pp for pp in project_patients if pp.project_id == project_id
        }

        contexts = await self.context_repository.list_project_crfs_by_project_patients(list(valid_pp_by_id.keys()))
        context_by_pp: dict[str, DataContext] = {}
        for context in contexts:
            if context.schema_version_id != binding.schema_version_id:
                continue
            key = context.project_patient_id
            existing = context_by_pp.get(key)
            if existing is None or (context.created_at or datetime.min) > (existing.created_at or datetime.min):
                context_by_pp[key] = context

        context_ids = [context.id for context in context_by_pp.values()]
        current_values = await self.current_repository.list_by_contexts(context_ids)
        values_by_context: dict[str, list[FieldCurrentValue]] = {}
        for value in current_values:
            values_by_context.setdefault(value.context_id, []).append(value)
        records_by_context: dict[str, list[RecordInstance]] = {}
        if context_ids:
            record_result = await session.execute(
                select(RecordInstance).where(RecordInstance.context_id.in_(context_ids))
            )
            for record in record_result.scalars().all():
                records_by_context.setdefault(record.context_id, []).append(record)

        canonical_to_display: dict[str, str] = {}
        if isinstance(schema_json, dict):
            for dot_path in leaf_paths:
                canonical_to_display[self._canonical_field_path(dot_path)] = dot_path

        results: list[dict[str, Any]] = []
        for pp_id in unique_pp_ids:
            fields: dict[str, dict[str, Any]] = {}
            if pp_id in valid_pp_by_id and leaf_paths:
                context = context_by_pp.get(pp_id)
                if context is not None and isinstance(schema_json, dict):
                    display_values = self._current_values_by_display_path(
                        values_by_context.get(context.id, []),
                        schema_json,
                        records_by_context.get(context.id, []),
                    )
                    canonical_filled: dict[str, Any] = {}
                    for display_path, current in display_values.items():
                        canonical = self._canonical_field_path(display_path)
                        if canonical:
                            canonical_filled[canonical] = self._current_display_value(current)

                    for canonical, dot_path in canonical_to_display.items():
                        slash_key = dot_path.replace(".", "/")
                        fields[slash_key] = {"value": canonical_filled.get(canonical)}

            results.append({"project_patient_id": pp_id, "fields": fields})
        return results

    async def _get_project_patient_or_404(
        self,
        project_id: str,
        project_patient_id: str,
        *,
        owner_id: str | None = None,
        include_withdrawn: bool = False,
    ) -> ProjectPatient:
        project = await self.get_project(project_id, owner_id=owner_id)
        if project is None:
            raise ResearchProjectNotFoundError("Research project not found")
        project_patient = await self.project_patient_repository.get_by_id(project_patient_id)
        if (
            project_patient is None
            or project_patient.project_id != project_id
            or (project_patient.status == "withdrawn" and not include_withdrawn)
        ):
            raise ResearchProjectNotFoundError("Project patient not found")
        return project_patient
