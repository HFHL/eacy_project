"""
db.py — 最小 SQLite 数据库操作
与 Node 后端共享同一个 eacy.db 文件
"""

import sqlite3
import os
from datetime import datetime, timezone
from typing import Optional


def _db_path() -> str:
    return os.getenv("SQLITE_DB_PATH", "../backend/eacy.db")


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def get_document(document_id: str) -> Optional[dict]:
    """根据 id 查询文档记录"""
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            "SELECT * FROM documents WHERE id = ?", (document_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def update_status_running(document_id: str) -> None:
    """OCR 开始处理 → ocr_running"""
    conn = sqlite3.connect(_db_path())
    try:
        conn.execute(
            "UPDATE documents SET status = 'ocr_running', updated_at = ? WHERE id = ?",
            (_now(), document_id),
        )
        conn.commit()
    finally:
        conn.close()


def update_status_succeeded(document_id: str, raw_text: str, metadata: str = "{}") -> None:
    """OCR 成功 → ocr_succeeded，回填 raw_text"""
    conn = sqlite3.connect(_db_path())
    try:
        conn.execute(
            """UPDATE documents
               SET status = 'ocr_succeeded',
                   raw_text = ?,
                   metadata = ?,
                   error_message = NULL,
                   updated_at = ?
               WHERE id = ?""",
            (raw_text, metadata, _now(), document_id),
        )
        conn.commit()
    finally:
        conn.close()


def update_status_failed(document_id: str, error_message: str) -> None:
    """OCR 失败 → ocr_failed，记录错误"""
    conn = sqlite3.connect(_db_path())
    try:
        conn.execute(
            """UPDATE documents
               SET status = 'ocr_failed',
                   error_message = ?,
                   updated_at = ?
               WHERE id = ?""",
            (error_message, _now(), document_id),
        )
        conn.commit()
    finally:
        conn.close()
