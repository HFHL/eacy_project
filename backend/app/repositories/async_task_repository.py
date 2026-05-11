from sqlalchemy import select

from app.models import AsyncTaskBatch, AsyncTaskEvent, AsyncTaskItem
from core.db import session
from core.repository.base import BaseRepo


class AsyncTaskBatchRepository(BaseRepo[AsyncTaskBatch]):
    def __init__(self):
        super().__init__(AsyncTaskBatch)


class AsyncTaskItemRepository(BaseRepo[AsyncTaskItem]):
    def __init__(self):
        super().__init__(AsyncTaskItem)

    async def get_by_extraction_job(self, extraction_job_id: str) -> AsyncTaskItem | None:
        query = select(AsyncTaskItem).where(AsyncTaskItem.extraction_job_id == extraction_job_id).order_by(AsyncTaskItem.created_at.desc())
        result = await session.execute(query)
        return result.scalars().first()

    async def list_by_batch(self, batch_id: str) -> list[AsyncTaskItem]:
        query = select(AsyncTaskItem).where(AsyncTaskItem.batch_id == batch_id).order_by(AsyncTaskItem.created_at)
        result = await session.execute(query)
        return list(result.scalars().all())


class AsyncTaskEventRepository(BaseRepo[AsyncTaskEvent]):
    def __init__(self):
        super().__init__(AsyncTaskEvent)

    async def list_by_batch(self, batch_id: str, *, after_id: str | None = None, limit: int = 200) -> list[AsyncTaskEvent]:
        query = select(AsyncTaskEvent).where(AsyncTaskEvent.batch_id == batch_id).order_by(AsyncTaskEvent.created_at, AsyncTaskEvent.id).limit(limit)
        if after_id:
            marker = await self.get_by_id(after_id)
            if marker is not None:
                query = (
                    select(AsyncTaskEvent)
                    .where(AsyncTaskEvent.batch_id == batch_id)
                    .where(AsyncTaskEvent.created_at >= marker.created_at)
                    .where(AsyncTaskEvent.id != after_id)
                    .order_by(AsyncTaskEvent.created_at, AsyncTaskEvent.id)
                    .limit(limit)
                )
        result = await session.execute(query)
        return list(result.scalars().all())
