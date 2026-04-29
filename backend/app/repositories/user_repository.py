from sqlalchemy import select

from app.models import User
from core.db import session
from core.repository.base import BaseRepo


class UserRepository(BaseRepo[User]):
    def __init__(self):
        super().__init__(User)

    async def get_by_email(self, email: str) -> User | None:
        query = select(User).where(User.email == email.lower())
        result = await session.execute(query)
        return result.scalars().first()

    async def get_by_username(self, username: str) -> User | None:
        query = select(User).where(User.username == username)
        result = await session.execute(query)
        return result.scalars().first()
