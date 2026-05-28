"""Stale queued/running task items should not block batch aggregation forever."""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.task_progress_service import ITEM_STALE_MESSAGE, TaskProgressService


@pytest.mark.asyncio
async def test_reconcile_stale_running_items_marks_failed():
    stale_time = datetime.utcnow() - timedelta(minutes=20)
    stale_item = MagicMock()
    stale_item.status = "running"
    stale_item.progress = 45
    stale_item.heartbeat_at = stale_time
    stale_item.updated_at = stale_time
    stale_item.started_at = stale_time
    stale_item.finished_at = None
    stale_item.error_message = None
    stale_item.message = "running"

    item_repo = AsyncMock()
    item_repo.save = AsyncMock()
    service = TaskProgressService(item_repository=item_repo, batch_repository=AsyncMock(), event_repository=AsyncMock())

    with patch("app.services.task_progress_service.session.flush", new_callable=AsyncMock):
        await service._reconcile_stale_items([stale_item])

    assert stale_item.status == "failed"
    assert stale_item.error_message == ITEM_STALE_MESSAGE
    item_repo.save.assert_awaited()
