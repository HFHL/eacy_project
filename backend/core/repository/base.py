from typing import Any, Generic, Sequence, Type, TypeVar

from sqlalchemy import select, update, delete

from core.db.session import Base, session

ModelType = TypeVar("ModelType", bound=Base)


class BaseRepo(Generic[ModelType]):
    def __init__(self, model: Type[ModelType]):
        self.model = model

    async def get_by_id(self, id: Any) -> ModelType | None:
        query = select(self.model).where(self.model.id == id)
        result = await session.execute(query)
        return result.scalars().first()

    async def list(self, *, limit: int = 100, offset: int = 0) -> Sequence[ModelType]:
        query = select(self.model).limit(limit).offset(offset)
        result = await session.execute(query)
        return result.scalars().all()

    async def create(self, params: dict[str, Any]) -> ModelType:
        model = self.model(**params)
        session.add(model)
        await session.flush()
        return model

    async def update_by_id(
        self,
        id: Any,
        params: dict[str, Any],
        synchronize_session: Any = False,
    ) -> None:
        query = (
            update(self.model)
            .where(self.model.id == id)
            .values(**params)
            .execution_options(synchronize_session=synchronize_session)
        )
        await session.execute(query)

    async def delete(self, model: ModelType) -> None:
        await session.delete(model)

    async def delete_by_id(self, id: Any, synchronize_session: Any = False) -> None:
        query = (
            delete(self.model)
            .where(self.model.id == id)
            .execution_options(synchronize_session=synchronize_session)
        )
        await session.execute(query)

    async def save(self, model: ModelType) -> ModelType:
        session.add(model)
        await session.flush()
        return model
