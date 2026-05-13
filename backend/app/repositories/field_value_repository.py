from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert

from app.models import FieldCurrentValue, FieldValueEvent, FieldValueEvidence
from core.db import session
from core.repository.base import BaseRepo


class FieldValueEventRepository(BaseRepo[FieldValueEvent]):
    def __init__(self):
        super().__init__(FieldValueEvent)

    async def list_candidates(
        self,
        *,
        record_instance_id: str,
        field_path: str,
    ) -> list[FieldValueEvent]:
        query = (
            select(FieldValueEvent)
            .where(FieldValueEvent.record_instance_id == record_instance_id)
            .where(FieldValueEvent.field_path == field_path)
            .where(FieldValueEvent.review_status == "candidate")
        )
        result = await session.execute(query)
        return list(result.scalars().all())

    async def list_by_field(
        self,
        *,
        context_id: str,
        field_path: str,
    ) -> list[FieldValueEvent]:
        query = (
            select(FieldValueEvent)
            .where(FieldValueEvent.context_id == context_id)
            .where(FieldValueEvent.field_path == field_path)
            .order_by(FieldValueEvent.created_at.desc())
        )
        result = await session.execute(query)
        return list(result.scalars().all())

    async def list_by_record(self, record_instance_id: str) -> list[FieldValueEvent]:
        query = select(FieldValueEvent).where(FieldValueEvent.record_instance_id == record_instance_id)
        result = await session.execute(query)
        return list(result.scalars().all())

    async def delete_by_context_field(self, *, context_id: str, field_path: str) -> None:
        query = delete(FieldValueEvent).where(FieldValueEvent.context_id == context_id).where(FieldValueEvent.field_path == field_path)
        await session.execute(query)

    async def delete_by_record(self, record_instance_id: str) -> None:
        query = delete(FieldValueEvent).where(FieldValueEvent.record_instance_id == record_instance_id)
        await session.execute(query)

    async def list_candidates_by_context_field(
        self,
        *,
        context_id: str,
        field_path: str,
    ) -> list[FieldValueEvent]:
        query = (
            select(FieldValueEvent)
            .where(FieldValueEvent.context_id == context_id)
            .where(FieldValueEvent.field_path == field_path)
            .where(FieldValueEvent.review_status.in_(["candidate", "accepted"]))
            .order_by(FieldValueEvent.created_at.desc())
        )
        result = await session.execute(query)
        return list(result.scalars().all())


class FieldCurrentValueRepository(BaseRepo[FieldCurrentValue]):
    def __init__(self):
        super().__init__(FieldCurrentValue)

    async def get_by_field(
        self,
        *,
        context_id: str,
        record_instance_id: str,
        field_path: str,
    ) -> FieldCurrentValue | None:
        query = (
            select(FieldCurrentValue)
            .where(FieldCurrentValue.context_id == context_id)
            .where(FieldCurrentValue.record_instance_id == record_instance_id)
            .where(FieldCurrentValue.field_path == field_path)
        )
        result = await session.execute(query)
        return result.scalars().first()

    async def upsert_selected_value(self, values: dict) -> FieldCurrentValue:
        insert_stmt = insert(FieldCurrentValue).values(**values)
        update_values = {
            key: insert_stmt.excluded[key]
            for key in (
                "field_key",
                "selected_event_id",
                "value_type",
                "value_text",
                "value_number",
                "value_date",
                "value_datetime",
                "value_json",
                "unit",
                "selected_by",
                "selected_at",
                "review_status",
                "updated_at",
            )
        }
        query = (
            insert_stmt.on_conflict_do_update(
                constraint="uk_current_field",
                set_=update_values,
            )
            .returning(FieldCurrentValue)
        )
        result = await session.execute(query)
        return result.scalars().one()

    async def list_by_context(self, context_id: str) -> list[FieldCurrentValue]:
        query = select(FieldCurrentValue).where(FieldCurrentValue.context_id == context_id)
        result = await session.execute(query)
        return list(result.scalars().all())

    async def list_by_contexts(self, context_ids: list[str]) -> list[FieldCurrentValue]:
        """批量按 context_id 列出所有当前值（用于多上下文聚合，例如项目完整度统计）。"""
        if not context_ids:
            return []
        query = select(FieldCurrentValue).where(FieldCurrentValue.context_id.in_(context_ids))
        result = await session.execute(query)
        return list(result.scalars().all())

    async def delete_by_context_field(self, *, context_id: str, field_path: str) -> None:
        query = delete(FieldCurrentValue).where(FieldCurrentValue.context_id == context_id).where(FieldCurrentValue.field_path == field_path)
        await session.execute(query)

    async def delete_by_record(self, record_instance_id: str) -> None:
        query = delete(FieldCurrentValue).where(FieldCurrentValue.record_instance_id == record_instance_id)
        await session.execute(query)


class FieldValueEvidenceRepository(BaseRepo[FieldValueEvidence]):
    def __init__(self):
        super().__init__(FieldValueEvidence)

    async def list_by_event(self, value_event_id: str) -> list[FieldValueEvidence]:
        query = select(FieldValueEvidence).where(FieldValueEvidence.value_event_id == value_event_id)
        result = await session.execute(query)
        return list(result.scalars().all())

    async def list_by_field(
        self,
        *,
        context_id: str,
        field_path: str,
    ) -> list[FieldValueEvidence]:
        query = (
            select(FieldValueEvidence)
            .join(FieldValueEvent, FieldValueEvent.id == FieldValueEvidence.value_event_id)
            .where(FieldValueEvent.context_id == context_id)
            .where(FieldValueEvent.field_path == field_path)
            .order_by(FieldValueEvidence.created_at.desc())
        )
        result = await session.execute(query)
        return list(result.scalars().all())

    async def delete_by_event_ids(self, event_ids: list[str]) -> None:
        if not event_ids:
            return
        query = delete(FieldValueEvidence).where(FieldValueEvidence.value_event_id.in_(event_ids))
        await session.execute(query)

    async def delete_by_context_field(self, *, context_id: str, field_path: str) -> None:
        event_ids_query = select(FieldValueEvent.id).where(FieldValueEvent.context_id == context_id).where(FieldValueEvent.field_path == field_path)
        query = delete(FieldValueEvidence).where(FieldValueEvidence.value_event_id.in_(event_ids_query))
        await session.execute(query)

    async def summarize_by_document_id(self, document_id: str) -> dict:
        """聚合该文档作为字段证据时影响到的字段清单（用于"删除影响范围"提示）。

        返回:
            {
              "evidence_count": int,           # 该文档对应的 evidence 行数
              "fields": [                       # 去重后的字段列表
                {"code": <field_key>, "title": <field_title or field_key>}
              ]
            }
        若 evidence_count == 0 表示该文档未被任何字段证据引用。
        """
        # 字段列表：按 field_key/field_title 去重
        field_query = (
            select(FieldValueEvent.field_key, FieldValueEvent.field_title)
            .select_from(FieldValueEvidence)
            .join(FieldValueEvent, FieldValueEvent.id == FieldValueEvidence.value_event_id)
            .where(FieldValueEvidence.document_id == document_id)
            .distinct()
        )
        field_result = await session.execute(field_query)
        fields = [
            {"code": row.field_key, "title": row.field_title or row.field_key}
            for row in field_result.all()
        ]

        # evidence 总行数
        count_query = (
            select(func.count(FieldValueEvidence.id))
            .where(FieldValueEvidence.document_id == document_id)
        )
        count_result = await session.execute(count_query)
        evidence_count = count_result.scalar() or 0

        return {"evidence_count": evidence_count, "fields": fields}
