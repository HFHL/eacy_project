"""Unit tests for DashboardService 关键聚合逻辑。

仅覆盖最近修复的两个 KPI 偏差：
  * `_list_projects` 必须过滤 status='deleted' 的软删项目（DSH-001）。
  * `_job_summary_from_db` 必须用 DB 端 GROUP BY 计算，避免 _list_jobs(limit=500)
    在抽取量大时把"任务"KPI 卡在 500。
"""
from datetime import datetime, timedelta
from types import SimpleNamespace
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.dialects import postgresql

from app.models import ExtractionJob, ResearchProject
from app.services.dashboard_service import DashboardService


class _CapturingResult:
    """A minimal SQLAlchemy Result stub that returns the rows we pre-load."""

    def __init__(self, rows: list[Any]):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return list(self._rows)

    def scalar_one(self):
        return self._rows[0] if self._rows else 0


class _CapturingSession:
    """Captures every query executed against it and returns canned rows.

    Tests inject the rows they want each `execute()` to return, in call order.
    """

    def __init__(self, queue: list[Any]):
        self._queue = queue
        self.captured_queries: list[Any] = []

    async def execute(self, query):
        self.captured_queries.append(query)
        if not self._queue:
            return _CapturingResult([])
        next_rows = self._queue.pop(0)
        return _CapturingResult(next_rows)


def _compile(query) -> str:
    return str(query.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))


@pytest.mark.asyncio
async def test_list_projects_excludes_soft_deleted_projects(monkeypatch):
    """research_project_service.archive_project 把 status 置为 'deleted'。
    仪表盘必须把这部分过滤掉，否则项目 KPI 与列表对不上账。"""
    captured = _CapturingSession(queue=[[]])
    monkeypatch.setattr("app.services.dashboard_service.session", captured)

    service = DashboardService()
    await service._list_projects(user_id=None)

    assert len(captured.captured_queries) == 1
    sql = _compile(captured.captured_queries[0])
    assert "research_projects.status != 'deleted'" in sql, (
        f"未在查询中看到 status != 'deleted' 过滤，实际 SQL: {sql}"
    )


@pytest.mark.asyncio
async def test_list_projects_still_applies_owner_filter(monkeypatch):
    captured = _CapturingSession(queue=[[]])
    monkeypatch.setattr("app.services.dashboard_service.session", captured)

    service = DashboardService()
    await service._list_projects(user_id="11111111-1111-1111-1111-111111111111")

    sql = _compile(captured.captured_queries[0])
    assert "research_projects.status != 'deleted'" in sql
    assert "research_projects.owner_id" in sql


@pytest.mark.asyncio
async def test_job_summary_from_db_aggregates_status_counts(monkeypatch):
    """模拟 DB 端 GROUP BY status 的结果，验证 summary 正确拼装。"""
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    rows = [
        SimpleNamespace(status="pending", total=12, today=3),
        SimpleNamespace(status="running", total=4, today=2),
        SimpleNamespace(status="completed", total=900, today=120),
        SimpleNamespace(status="failed", total=25, today=5),
        # 包含未在 summary 默认 keys 中的状态，应该被并入 total/today 但不写入分项。
        SimpleNamespace(status="cancelled", total=7, today=1),
    ]
    captured = _CapturingSession(queue=[rows])
    monkeypatch.setattr("app.services.dashboard_service.session", captured)

    service = DashboardService()
    summary = await service._job_summary_from_db(user_id=None, today=today)

    assert summary["total"] == 12 + 4 + 900 + 25 + 7  # 948 — 早已突破 limit=500
    assert summary["today"] == 3 + 2 + 120 + 5 + 1
    assert summary["pending"] == 12
    assert summary["running"] == 4
    assert summary["completed"] == 900
    assert summary["failed"] == 25
    # cancelled 不在默认 summary keys 中，不应污染细分指标
    assert "cancelled" not in summary


@pytest.mark.asyncio
async def test_job_summary_from_db_returns_zero_when_no_jobs(monkeypatch):
    captured = _CapturingSession(queue=[[]])
    monkeypatch.setattr("app.services.dashboard_service.session", captured)

    service = DashboardService()
    summary = await service._job_summary_from_db(user_id=None, today=datetime.utcnow())

    assert summary == {
        "total": 0,
        "today": 0,
        "pending": 0,
        "running": 0,
        "completed": 0,
        "failed": 0,
    }


@pytest.mark.asyncio
async def test_job_summary_from_db_applies_user_scope_filter(monkeypatch):
    """传入 user_id 时 SQL 中应有 requested_by 过滤。"""
    captured = _CapturingSession(queue=[[]])
    monkeypatch.setattr("app.services.dashboard_service.session", captured)

    service = DashboardService()
    await service._job_summary_from_db(
        user_id="22222222-2222-2222-2222-222222222222",
        today=datetime.utcnow() - timedelta(days=1),
    )

    sql = _compile(captured.captured_queries[0])
    assert "extraction_jobs.requested_by" in sql
    assert "group by" in sql.lower()
