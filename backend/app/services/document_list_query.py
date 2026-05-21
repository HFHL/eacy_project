from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import and_, cast, or_, String
from sqlalchemy.sql.elements import ColumnElement

from app.models import Document
from app.services.archive_grouping_service import get_metadata_result, is_pending_process_document


METADATA_RESULT_TEXT_KEYS = (
    "患者姓名",
    "患者性别",
    "患者年龄",
    "出生日期",
    "联系电话",
    "诊断",
    "机构名称",
    "科室信息",
    "文档类型",
    "文档子类型",
    "文档标题",
    "文档生效日期",
)


def build_keyword_filter(keyword: str) -> ColumnElement[bool]:
    pattern = f"%{keyword.strip()}%"
    clauses: list[ColumnElement[bool]] = [
        Document.original_filename.ilike(pattern),
        Document.doc_type.ilike(pattern),
        Document.doc_subtype.ilike(pattern),
        Document.doc_title.ilike(pattern),
        cast(Document.effective_at, String).ilike(pattern),
    ]
    for key in METADATA_RESULT_TEXT_KEYS:
        clauses.append(cast(Document.metadata_json["result"][key], String).ilike(pattern))
    return or_(*clauses)


@dataclass(frozen=True)
class DocumentListQuery:
    patient_id: str | None = None
    status: str | None = None
    tab: str | None = None
    task_stage: str | None = None
    keyword: str | None = None
    document_types: str | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    order_by: str = "created_at"
    order_direction: str = "desc"
    uploaded_by: str | None = None


def _split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in str(value).split(",") if item.strip()]


def pending_process_sql() -> ColumnElement[bool]:
    """与 archive tree 的 is_pending_process_document 语义对齐（SQL 近似）。"""
    return and_(
        Document.status.notin_(["archived", "deleted"]),
        or_(
            Document.meta_status.is_(None),
            Document.meta_status != "completed",
            Document.ocr_status.is_(None),
            Document.ocr_status != "completed",
            Document.metadata_json.is_(None),
            cast(Document.metadata_json["result"], String) == "null",
            cast(Document.metadata_json["result"], String) == "{}",
        ),
    )


def todo_sql() -> ColumnElement[bool]:
    """已完成 OCR + 元数据、尚未归档。"""
    return and_(
        Document.status.notin_(["archived", "deleted"]),
        Document.meta_status == "completed",
        Document.ocr_status == "completed",
        Document.metadata_json.isnot(None),
        cast(Document.metadata_json["result"], String) != "null",
        cast(Document.metadata_json["result"], String) != "{}",
    )


def archived_sql() -> ColumnElement[bool]:
    return Document.status == "archived"


def task_stage_sql(stage: str) -> ColumnElement[bool] | None:
    if stage == "processing":
        return pending_process_sql()
    if stage == "error":
        return Document.status == "failed"
    if stage == "pending_archive":
        return todo_sql()
    if stage == "archived":
        return archived_sql()
    return None


def tab_sql(tab: str) -> ColumnElement[bool] | None:
    if tab == "parse":
        return pending_process_sql()
    if tab == "todo":
        return todo_sql()
    if tab == "archived":
        return archived_sql()
    if tab in {"all", ""}:
        return Document.status != "deleted"
    return None


def resolve_task_status(document: Document) -> str:
    """与前端 normalizeTaskStatus 对齐，供测试与后续扩展使用。"""
    status = document.status or "uploaded"
    if status == "archived" or document.archived_at:
        return "archived"
    if status == "failed":
        return "parse_failed"
    if status == "ocr_pending":
        return "parsing"

    ocr_status = document.ocr_status
    meta_status = document.meta_status
    if (status == "ocr_completed" or ocr_status == "completed") and meta_status == "completed":
        return "pending_confirm_uncertain"
    if status == "ocr_completed":
        return "parsed"
    if ocr_status in {"queued", "running"}:
        return "parsing"
    if ocr_status == "completed":
        return "parsed"
    if ocr_status == "failed":
        return "parse_failed"
    return status


def document_matches_tab(document: Document, tab: str) -> bool:
    if tab in {"all", ""}:
        return document.status != "deleted"
    if tab == "archived":
        return document.status == "archived"
    if tab == "parse":
        return is_pending_process_document(document)
    if tab == "todo":
        return document.status != "archived" and not is_pending_process_document(document)
    return True


def build_document_list_filters(query: DocumentListQuery) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = []

    if query.uploaded_by is not None:
        conditions.append(Document.uploaded_by == query.uploaded_by)
    if query.patient_id is not None:
        conditions.append(Document.patient_id == query.patient_id)

    if query.status is not None:
        statuses = _split_csv(query.status)
        if len(statuses) > 1:
            conditions.append(Document.status.in_(statuses))
        elif statuses:
            conditions.append(Document.status == statuses[0])
    elif query.tab is None:
        conditions.append(Document.status != "deleted")

    if query.tab:
        tab_condition = tab_sql(query.tab)
        if tab_condition is not None:
            conditions.append(tab_condition)

    task_stages = _split_csv(query.task_stage)
    if task_stages:
        stage_conditions = [cond for stage in task_stages if (cond := task_stage_sql(stage)) is not None]
        if stage_conditions:
            conditions.append(or_(*stage_conditions))

    keyword = (query.keyword or "").strip()
    if keyword:
        conditions.append(build_keyword_filter(keyword))

    document_types = _split_csv(query.document_types)
    if document_types:
        conditions.append(
            or_(
                Document.doc_subtype.in_(document_types),
                Document.doc_type.in_(document_types),
            )
        )

    if query.date_from is not None:
        conditions.append(Document.created_at >= query.date_from)
    if query.date_to is not None:
        conditions.append(Document.created_at <= query.date_to)

    return conditions


def resolve_order_column(order_by: str):
    mapping = {
        "created_at": Document.created_at,
        "file_name": Document.original_filename,
        "original_filename": Document.original_filename,
        "document_type": Document.doc_subtype,
        "doc_type": Document.doc_type,
    }
    return mapping.get(order_by, Document.created_at)


def parse_date_boundary(value: str | None, *, end_of_day: bool = False) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        if len(text) == 10:
            day = datetime.fromisoformat(text)
            if end_of_day:
                return day.replace(hour=23, minute=59, second=59, microsecond=999999)
            return day.replace(hour=0, minute=0, second=0, microsecond=0)
        normalized = text.replace("Z", "+00:00")
        if " " in normalized and "T" not in normalized:
            normalized = normalized.replace(" ", "T", 1)
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def build_document_list_query(**kwargs: Any) -> DocumentListQuery:
    return DocumentListQuery(
        patient_id=kwargs.get("patient_id"),
        status=kwargs.get("status"),
        tab=kwargs.get("tab"),
        task_stage=kwargs.get("task_stage"),
        keyword=kwargs.get("keyword"),
        document_types=kwargs.get("document_types"),
        date_from=kwargs.get("date_from"),
        date_to=kwargs.get("date_to"),
        order_by=kwargs.get("order_by") or "created_at",
        order_direction=(kwargs.get("order_direction") or "desc").lower(),
        uploaded_by=kwargs.get("uploaded_by"),
    )
