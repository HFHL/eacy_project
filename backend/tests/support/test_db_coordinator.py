import asyncio

from alembic import command
from alembic.config import Config as AlembicConfig
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine

from core.config import config


class TestDbCoordinator:
    __test__ = True

    EXCLUDE_TABLES = {"alembic_version"}

    def apply_alembic(self) -> None:
        alembic_cfg = AlembicConfig("alembic.ini")
        command.upgrade(alembic_cfg, "head")

    def truncate_all(self) -> None:
        asyncio.run(self._truncate_all_async())

    async def _truncate_all_async(self) -> None:
        engine = create_async_engine(config.WRITER_DB_URL)
        try:
            async with engine.connect() as conn:
                tables = await conn.run_sync(self._get_all_tables)
            if not tables:
                return
            quoted = ", ".join(f'"{t}"' for t in tables)
            async with engine.begin() as conn:
                await conn.execute(
                    text(f"TRUNCATE TABLE {quoted} RESTART IDENTITY CASCADE")
                )
        finally:
            await engine.dispose()

    def _get_all_tables(self, sync_conn) -> list[str]:
        inspector = inspect(sync_conn)
        tables = []
        for table_name in inspector.get_table_names():
            if table_name in self.EXCLUDE_TABLES:
                continue
            tables.append(table_name)
        return tables
