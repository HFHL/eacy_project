import asyncio
from contextlib import suppress
from uuid import uuid4

from starlette.types import ASGIApp, Receive, Scope, Send

from core.db.session import set_session_context, reset_session_context, session


class SQLAlchemyMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        session_id = str(uuid4())
        context = set_session_context(session_id=session_id)

        try:
            await self.app(scope, receive, send)
        except BaseException:
            with suppress(Exception):
                await asyncio.shield(session.rollback())
            raise
        else:
            await asyncio.shield(session.commit())
        finally:
            try:
                await asyncio.shield(session.remove())
            finally:
                reset_session_context(context=context)
