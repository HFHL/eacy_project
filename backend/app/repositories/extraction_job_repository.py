from typing import Any

from sqlalchemy import desc, func, select

from app.models import ExtractionJob, ExtractionRun, FieldValueEvent
from core.db import session
from core.repository.base import BaseRepo


_EXTRACT_PRIORITY = ("running", "pending", "completed", "succeeded", "failed", "cancelled")
_EXTRACT_STATUS_RANK = {name: idx for idx, name in enumerate(_EXTRACT_PRIORITY)}


class ExtractionJobRepository(BaseRepo[ExtractionJob]):
    def __init__(self):
        super().__init__(ExtractionJob)

    async def list_by_status(self, status: str, *, limit: int = 100) -> list[ExtractionJob]:
        query = select(ExtractionJob).where(ExtractionJob.status == status).limit(limit)
        result = await session.execute(query)
        return list(result.scalars().all())

    async def list_by_patient_documents(self, *, patient_id: str, document_ids: list[str]) -> list[ExtractionJob]:
        if not document_ids:
            return []
        query = (
            select(ExtractionJob)
            .where(ExtractionJob.patient_id == patient_id)
            .where(ExtractionJob.document_id.in_(document_ids))
            .where(ExtractionJob.status != "cancelled")
        )
        result = await session.execute(query)
        return list(result.scalars().all())

    async def list_active_by_patient_ids(
        self,
        patient_ids: list[str],
        *,
        job_type: str | None = None,
        active_statuses: tuple[str, ...] = ("pending", "running"),
    ) -> list[ExtractionJob]:
        """批量查询若干患者下处于活跃状态的 extraction_jobs。

        用于"该患者电子病历夹是否正在更新"的批量探测。默认筛选 patient_ehr 类型可由调用方指定。
        """
        if not patient_ids:
            return []
        query = (
            select(ExtractionJob)
            .where(ExtractionJob.patient_id.in_(patient_ids))
            .where(ExtractionJob.status.in_(active_statuses))
        )
        if job_type is not None:
            query = query.where(ExtractionJob.job_type == job_type)
        result = await session.execute(query)
        return list(result.scalars().all())

    async def list_latest_extract_status_by_document_ids(
        self,
        document_ids: list[str],
        *,
        job_types: tuple[str, ...] = ("patient_ehr", "targeted_schema"),
    ) -> dict[str, str]:
        """批量返回若干 document_id 对应的 EHR 抽取最新状态。

        聚合规则：同一 document 可能有多个 extraction_jobs（重跑/不同 job_type），
        按优先级 running > pending > completed/succeeded > failed > cancelled 取一个代表性状态。
        没有 job 的文档不会出现在返回 map 中（前端按"未抽取"处理）。
        """
        if not document_ids:
            return {}
        query = (
            select(ExtractionJob.document_id, ExtractionJob.status)
            .where(ExtractionJob.document_id.in_(document_ids))
            .where(ExtractionJob.job_type.in_(job_types))
        )
        result = await session.execute(query)
        rows = result.all()
        best: dict[str, str] = {}
        for document_id, status_value in rows:
            if not document_id or not status_value:
                continue
            key = str(document_id)
            current = best.get(key)
            new_rank = _EXTRACT_STATUS_RANK.get(status_value, len(_EXTRACT_PRIORITY))
            current_rank = _EXTRACT_STATUS_RANK.get(current, len(_EXTRACT_PRIORITY)) if current else len(_EXTRACT_PRIORITY) + 1
            if new_rank < current_rank:
                best[key] = status_value
        return best

    async def list_by_document_id(self, document_id: str) -> list[ExtractionJob]:
        """按 document_id 列出该文档下所有 extraction_jobs，按创建时间倒序。

        走 `idx_jobs_document` 索引；用于"文档详情页 → 抽取记录"区域展示。
        """
        query = (
            select(ExtractionJob)
            .where(ExtractionJob.document_id == document_id)
            .order_by(desc(ExtractionJob.created_at))
        )
        result = await session.execute(query)
        return list(result.scalars().all())

    async def list_pending_waiting_for_document(self, document_id: str) -> list[ExtractionJob]:
        query = (
            select(ExtractionJob)
            .where(ExtractionJob.document_id == document_id)
            .where(ExtractionJob.status == "pending")
        )
        result = await session.execute(query)
        return [
            job
            for job in result.scalars().all()
            if isinstance(job.input_json, dict) and job.input_json.get("wait_for_document_ready") is True
        ]


class ExtractionRunRepository(BaseRepo[ExtractionRun]):
    def __init__(self):
        super().__init__(ExtractionRun)

    async def list_by_job(self, job_id: str) -> list[ExtractionRun]:
        query = select(ExtractionRun).where(ExtractionRun.job_id == job_id).order_by(ExtractionRun.run_no)
        result = await session.execute(query)
        return list(result.scalars().all())

    async def get_latest_run_by_job_ids(self, job_ids: list[str]) -> dict[str, ExtractionRun]:
        """批量返回每个 job 的最新 ExtractionRun（按 run_no 取最大那一条）。

        N+1 友好：一次性把所有 run 拉回来，在 Python 里按 job_id 分组挑最大 run_no。
        """
        if not job_ids:
            return {}
        query = select(ExtractionRun).where(ExtractionRun.job_id.in_(job_ids))
        result = await session.execute(query)
        runs = list(result.scalars().all())
        latest: dict[str, ExtractionRun] = {}
        for run in runs:
            key = str(run.job_id)
            existing = latest.get(key)
            if existing is None or (run.run_no or 0) > (existing.run_no or 0):
                latest[key] = run
        return latest

    async def aggregate_merge_status_by_job_ids(
        self, job_ids: list[str]
    ) -> dict[str, dict[str, Any]]:
        """聚合每个 job 的合并状态。

        `is_merged=True` 当且仅当该 job 的任一 ExtractionRun 下存在
        `review_status='accepted'` 的 FieldValueEvent；`merged_at` 取这些
        accepted events 的最新 created_at。

        返回 {job_id: {"is_merged": bool, "merged_at": datetime|None}}。
        没出现的 job 默认未合并。
        """
        if not job_ids:
            return {}
        query = (
            select(
                ExtractionRun.job_id,
                func.max(FieldValueEvent.created_at).label("merged_at"),
            )
            .join(FieldValueEvent, FieldValueEvent.extraction_run_id == ExtractionRun.id)
            .where(ExtractionRun.job_id.in_(job_ids))
            .where(FieldValueEvent.review_status == "accepted")
            .group_by(ExtractionRun.job_id)
        )
        result = await session.execute(query)
        merged: dict[str, dict[str, Any]] = {}
        for job_id, merged_at in result.all():
            merged[str(job_id)] = {"is_merged": True, "merged_at": merged_at}
        return merged

    async def has_field_events(self, job_id: str) -> bool:
        query = (
            select(FieldValueEvent.id)
            .join(ExtractionRun, ExtractionRun.id == FieldValueEvent.extraction_run_id)
            .where(ExtractionRun.job_id == job_id)
            .limit(1)
        )
        result = await session.execute(query)
        return result.scalar_one_or_none() is not None
