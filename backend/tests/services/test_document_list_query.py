from datetime import datetime
from types import SimpleNamespace

from app.services.archive_grouping_service import is_pending_process_document
from app.services.document_list_query import (
    METADATA_RESULT_TEXT_KEYS,
    build_keyword_filter,
    document_matches_tab,
    parse_date_boundary,
    resolve_task_status,
)


def _doc(**kwargs):
    defaults = {
        "status": "uploaded",
        "ocr_status": None,
        "meta_status": None,
        "metadata_json": None,
        "archived_at": None,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def test_resolve_task_status_archived():
    document = _doc(status="archived", archived_at=datetime(2026, 1, 1))
    assert resolve_task_status(document) == "archived"


def test_resolve_task_status_parsing():
    document = _doc(status="ocr_pending")
    assert resolve_task_status(document) == "parsing"


def test_resolve_task_status_pending_confirm():
    document = _doc(
        status="ocr_completed",
        ocr_status="completed",
        meta_status="completed",
        metadata_json={"result": {"患者姓名": "张三"}},
    )
    assert resolve_task_status(document) == "pending_confirm_uncertain"


def test_document_matches_tab_parse_and_todo():
    pending = _doc(status="uploaded", ocr_status="queued")
    ready = _doc(
        status="ocr_completed",
        ocr_status="completed",
        meta_status="completed",
        metadata_json={"result": {"患者姓名": "张三"}},
    )
    archived = _doc(status="archived")

    assert is_pending_process_document(pending)
    assert document_matches_tab(pending, "parse")
    assert not document_matches_tab(pending, "todo")

    assert not is_pending_process_document(ready)
    assert document_matches_tab(ready, "todo")
    assert not document_matches_tab(ready, "parse")

    assert document_matches_tab(archived, "archived")
    assert not document_matches_tab(archived, "todo")


def test_parse_date_boundary():
    start = parse_date_boundary("2026-05-20")
    end = parse_date_boundary("2026-05-20", end_of_day=True)
    assert start.hour == 0
    assert end.hour == 23


def test_build_keyword_filter_covers_metadata_fields():
    clause = build_keyword_filter("张三")
    compiled = str(clause.compile(dialect=__import__("sqlalchemy.dialects.postgresql", fromlist=["dialect"]).dialect()))
    for key in ("original_filename", "doc_title", "effective_at", "metadata_json"):
        assert key in compiled
    assert len(METADATA_RESULT_TEXT_KEYS) >= 10
