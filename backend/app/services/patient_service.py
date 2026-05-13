from datetime import datetime, time
from typing import Any

from fastapi import HTTPException, status

from app.models import FieldCurrentValue, Patient
from app.repositories import (
    DataContextRepository,
    DocumentRepository,
    FieldCurrentValueRepository,
    PatientRepository,
    ProjectPatientRepository,
)
from app.services.document_service import DocumentService
from app.services.ehr_service import EhrService
from app.services.schema_field_planner import schema_leaf_paths
from app.services.schema_service import SchemaService
from core.db import Transactional, session


class PatientService:
    def __init__(
        self,
        patient_repository: PatientRepository | None = None,
        schema_service: SchemaService | None = None,
        ehr_service: EhrService | None = None,
        document_repository: DocumentRepository | None = None,
        project_patient_repository: ProjectPatientRepository | None = None,
        context_repository: DataContextRepository | None = None,
        current_value_repository: FieldCurrentValueRepository | None = None,
    ):
        self.patient_repository = patient_repository or PatientRepository()
        self.schema_service = schema_service or SchemaService()
        self.ehr_service = ehr_service or EhrService()
        self.document_repository = document_repository or DocumentRepository()
        self.project_patient_repository = project_patient_repository or ProjectPatientRepository()
        self.context_repository = context_repository or DataContextRepository()
        self.current_value_repository = current_value_repository or FieldCurrentValueRepository()

    @Transactional()
    async def create_patient(
        self,
        *,
        name: str,
        created_by: str | None = None,
        initialize_ehr: bool = True,
        **params: Any,
    ) -> Patient:
        patient = await self.patient_repository.create({"name": name, "owner_id": created_by, **params})
        if initialize_ehr:
            schema_version = await self.schema_service.get_latest_published("ehr")
            if schema_version is not None:
                await self.ehr_service.get_or_create_patient_ehr_context(
                    patient_id=patient.id,
                    schema_version=schema_version,
                    created_by=created_by,
                )
        await DocumentService().invalidate_archive_tree_cache(created_by)
        return patient

    async def get_patient(self, patient_id: str, *, owner_id: str | None = None) -> Patient | None:
        return await self.patient_repository.get_active_by_id(patient_id, owner_id=owner_id)

    async def list_patient_projects(self, patient_id: str) -> list[dict[str, Any]]:
        """返回某个患者关联的研究项目（用于患者详情页"关联项目"展示）。"""
        rows = await self.project_patient_repository.list_projects_by_patient(patient_id)
        return [
            {
                "id": project.id,
                "project_code": project.project_code,
                "project_name": project.project_name,
                "status": enrollment.status,
                "enroll_no": enrollment.enroll_no,
                "enrolled_at": enrollment.enrolled_at,
            }
            for enrollment, project in rows
        ]

    async def list_patients(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        keyword: str | None = None,
        department: str | None = None,
        owner_id: str | None = None,
    ) -> tuple[list[Patient], int]:
        offset = (page - 1) * page_size
        patients = await self.patient_repository.list_active(
            offset=offset,
            limit=page_size,
            keyword=keyword,
            department=department,
            owner_id=owner_id,
        )
        total = await self.patient_repository.count_active(keyword=keyword, department=department, owner_id=owner_id)
        return patients, total

    async def list_patients_with_stats(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        keyword: str | None = None,
        department: str | None = None,
        owner_id: str | None = None,
    ) -> tuple[list[Patient], int, dict[str, dict[str, Any]], dict[str, Any]]:
        """同 list_patients，但额外返回每个患者的 document_count / data_completeness，
        以及整页/整池的统计（patient pool 顶部卡片需要）。

        返回:
            (patients, total, per_patient_stats, page_statistics)
            - per_patient_stats: {patient_id: {document_count, data_completeness}}
            - page_statistics: {total_documents, average_completeness, recently_added_today}
              针对当前页的累计；total 已经是整体总数。
        """
        patients, total = await self.list_patients(
            page=page,
            page_size=page_size,
            keyword=keyword,
            department=department,
            owner_id=owner_id,
        )
        stats = await self.compute_patient_stats(patients, uploaded_by=owner_id)

        today_start = datetime.combine(datetime.utcnow().date(), time.min)
        page_documents = sum(int(item.get("document_count", 0)) for item in stats.values())
        page_completeness = [float(item.get("data_completeness", 0.0)) for item in stats.values()]
        page_avg = round(sum(page_completeness) / len(page_completeness), 2) if page_completeness else 0.0
        recently_added = sum(
            1 for patient in patients if patient.created_at and patient.created_at >= today_start
        )
        page_statistics = {
            "total_documents": page_documents,
            "average_completeness": page_avg,
            "recently_added_today": recently_added,
        }
        return patients, total, stats, page_statistics

    async def get_patient_stats(self, patient: Patient, *, owner_id: str | None = None) -> dict[str, Any]:
        stats = await self.compute_patient_stats([patient], uploaded_by=owner_id)
        return stats.get(patient.id, {"document_count": 0, "data_completeness": 0.0})

    async def compute_patient_stats(
        self,
        patients: list[Patient],
        *,
        uploaded_by: str | None = None,
    ) -> dict[str, dict[str, Any]]:
        """批量计算 {patient_id: {document_count, data_completeness}}。

        document_count: 排除已删除的文档数。
        data_completeness: 当前生效（latest by created_at）的 patient_ehr 上下文里，
          schema 叶子字段中"已填字段去重数 / 叶子字段总数" × 100；无上下文返回 0。
        """
        if not patients:
            return {}

        patient_ids = [patient.id for patient in patients]
        doc_counts = await self.document_repository.count_by_patients(patient_ids, uploaded_by=uploaded_by)

        contexts = await self.context_repository.list_latest_patient_ehrs_by_patients(patient_ids)
        # list_latest_patient_ehrs_by_patients 已按 created_at desc 排序，按首次出现的 patient_id 取最新
        latest_context_by_patient: dict[str, Any] = {}
        for context in contexts:
            latest_context_by_patient.setdefault(context.patient_id, context)

        context_ids = [context.id for context in latest_context_by_patient.values()]
        version_ids = list({context.schema_version_id for context in latest_context_by_patient.values()})

        leaf_paths_by_version: dict[str, set[str]] = {}
        for version_id in version_ids:
            version = await self.schema_service.get_version(version_id)
            if version is None or not isinstance(version.schema_json, dict):
                leaf_paths_by_version[version_id] = set()
            else:
                leaf_paths_by_version[version_id] = schema_leaf_paths(version.schema_json)

        current_values = await self.current_value_repository.list_by_contexts(context_ids)
        filled_paths_by_context: dict[str, set[str]] = {}
        for value in current_values:
            if not self._is_value_filled(value):
                continue
            canonical = self._canonical_field_path(value.field_path)
            if not canonical:
                continue
            filled_paths_by_context.setdefault(value.context_id, set()).add(canonical)

        stats: dict[str, dict[str, Any]] = {}
        for patient in patients:
            context = latest_context_by_patient.get(patient.id)
            completeness = 0.0
            if context is not None:
                leaves = leaf_paths_by_version.get(context.schema_version_id) or set()
                if leaves:
                    filled = filled_paths_by_context.get(context.id) or set()
                    in_schema = filled & leaves
                    completeness = round(len(in_schema) / len(leaves) * 100.0, 2)
            stats[patient.id] = {
                "document_count": int(doc_counts.get(str(patient.id), 0)),
                "data_completeness": completeness,
            }
        return stats

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

    @staticmethod
    def _canonical_field_path(field_path: str) -> str:
        parts = [part for part in str(field_path or "").split(".") if part and not part.isdigit()]
        return ".".join(parts)

    @Transactional()
    async def update_patient(self, patient_id: str, *, owner_id: str | None = None, **params: Any) -> Patient:
        patient = await self.get_patient(patient_id, owner_id=owner_id)
        if patient is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

        # extra_json 走"合并"而不是"替换"：前端只提交了修改过的脱敏字段，未提交的键应保留
        if "extra_json" in params:
            incoming_extra = params.pop("extra_json") or {}
            current_extra = dict(patient.extra_json or {})
            current_merged = dict(current_extra.get("merged_data") or {})
            incoming_merged = dict(incoming_extra.get("merged_data") or {})
            current_extra.update(incoming_extra)
            if current_merged or incoming_merged:
                current_merged.update(incoming_merged)
                current_extra["merged_data"] = current_merged
            patient.extra_json = current_extra

        for key, value in params.items():
            setattr(patient, key, value)
        patient = await self.patient_repository.save(patient)
        # onupdate 触发的 updated_at 在 flush 后处于待刷新状态，主动 refresh 防止
        # 路由层 Pydantic 同步访问时触发 SQLAlchemy 异步懒加载 (MissingGreenlet)。
        await session.refresh(patient)
        await DocumentService().invalidate_archive_tree_cache(owner_id)
        return patient

    @Transactional()
    async def delete_patient(self, patient_id: str, *, owner_id: str | None = None) -> None:
        patient = await self.get_patient(patient_id, owner_id=owner_id)
        if patient is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

        await self.document_repository.soft_delete_by_patient(patient_id, uploaded_by=owner_id)
        await self.project_patient_repository.withdraw_by_patient(patient_id)
        await self.patient_repository.soft_delete(patient)
        await DocumentService().invalidate_archive_tree_cache(owner_id)

    async def search_patients(self, name: str, *, limit: int = 20, owner_id: str | None = None) -> list[Patient]:
        return await self.patient_repository.search_by_name(name, limit=limit, owner_id=owner_id)
