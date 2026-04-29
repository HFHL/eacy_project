from core.db.session import engines


async def reset_worker_db_connections() -> None:
    for engine in engines.values():
        await engine.dispose()
