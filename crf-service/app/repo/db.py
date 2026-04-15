"""
CRF 抽取服务数据库访问层

封装对 SQLite (eacy.db) 的读写操作，统一管理连接和事务。
物化阶段相关的写入操作（field_value_candidates / field_value_selected 等）也在此处。
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from app.config import settings


# ═══════════════════════════════════════════════════════════════════════════════
# 工具函数
# ═══════════════════════════════════════════════════════════════════════════════

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def _json_dumps(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def _json_loads_maybe(value: Any, default: Any = None) -> Any:
    if value is None:
        return default
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, (bytes, bytearray)):
        value = value.decode("utf-8", errors="ignore")
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return default
        try:
            return json.loads(s)
        except Exception:
            return default
    return default


def _guess_value_type(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return type(value).__name__


def _best_normalized_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return str(value).strip()
    return None


def _normalize_field_path(full_pointer: str) -> str:
    """把 /A/0/B/1/C 归一化成 /A/B/C。"""
    if not full_pointer:
        return "/"
    parts = [p for p in full_pointer.split("/") if p]
    norm = [p for p in parts if not p.isdigit()]
    return "/" + "/".join(norm)


# ═══════════════════════════════════════════════════════════════════════════════
# CRFRepo — 数据库仓储
# ═══════════════════════════════════════════════════════════════════════════════

class CRFRepo:
    """封装 CRF 抽取服务所需的所有数据库操作。"""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or settings.DB_PATH

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    # ─── Schema 读取 ────────────────────────────────────────────────────────

    def get_schema_by_id(self, conn: sqlite3.Connection, schema_id: str) -> Optional[Dict[str, Any]]:
        row = conn.execute(
            "SELECT id, name, code, version, content_json FROM schemas WHERE id = ? LIMIT 1",
            (schema_id,),
        ).fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "name": row["name"],
            "code": row["code"],
            "version": row["version"],
            "content_json": _json_loads_maybe(row["content_json"], default={}),
        }

    def get_schema_by_code(self, conn: sqlite3.Connection, schema_code: str) -> Optional[Dict[str, Any]]:
        row = conn.execute(
            """
            SELECT id, name, code, version, content_json
            FROM schemas
            WHERE code = ? AND is_active = 1
            ORDER BY version DESC
            LIMIT 1
            """,
            (schema_code,),
        ).fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "name": row["name"],
            "code": row["code"],
            "version": row["version"],
            "content_json": _json_loads_maybe(row["content_json"], default={}),
        }

    def get_schema(self, conn: sqlite3.Connection, schema_id_or_code: str) -> Optional[Dict[str, Any]]:
        """先按 id 查，再按 code 查。"""
        rec = self.get_schema_by_id(conn, schema_id_or_code)
        if rec:
            return rec
        return self.get_schema_by_code(conn, schema_id_or_code)

    # ─── 文档读取 ──────────────────────────────────────────────────────────

    def get_document(self, conn: sqlite3.Connection, document_id: str) -> Optional[Dict[str, Any]]:
        row = conn.execute(
            """
            SELECT id, patient_id, file_name, mime_type, doc_type, doc_title,
                   document_type, document_sub_type,
                   status, raw_text, ocr_payload, metadata,
                   extract_status, extract_result_json,
                   extract_started_at, extract_completed_at, extract_error_message
            FROM documents
            WHERE id = ?
            """,
            (document_id,),
        ).fetchone()
        if not row:
            return None
        rec = dict(row)
        rec["ocr_payload"] = _json_loads_maybe(rec.get("ocr_payload"), default=None)
        rec["extract_result_json"] = _json_loads_maybe(rec.get("extract_result_json"), default=None)
        rec["metadata"] = _json_loads_maybe(rec.get("metadata"), default={})
        return rec

    def get_documents_by_patient(self, conn: sqlite3.Connection, patient_id: str) -> List[Dict[str, Any]]:
        rows = conn.execute(
            """
            SELECT id,
                   COALESCE(NULLIF(TRIM(doc_type), ''), NULLIF(TRIM(document_type), '')) AS doc_type,
                   document_sub_type AS doc_sub_type,
                   metadata
            FROM documents
            WHERE patient_id = ?
            ORDER BY datetime(COALESCE(updated_at, created_at, uploaded_at)) DESC
            """,
            (patient_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    # ─── 抽取状态管理 ──────────────────────────────────────────────────────

    def mark_extract_running(self, conn: sqlite3.Connection, document_id: str, task_id: str) -> None:
        conn.execute(
            """
            UPDATE documents
            SET extract_status = 'running',
                extract_task_id = ?,
                extract_started_at = ?,
                extract_completed_at = NULL,
                extract_error_message = NULL
            WHERE id = ?
            """,
            (task_id, _now_iso(), document_id),
        )

    def mark_extract_success(self, conn: sqlite3.Connection, document_id: str, task_id: str, payload: Dict[str, Any]) -> None:
        conn.execute(
            """
            UPDATE documents
            SET extract_status = 'completed',
                extract_task_id = ?,
                extract_result_json = ?,
                extract_completed_at = ?,
                extract_error_message = NULL
            WHERE id = ?
            """,
            (task_id, _json_dumps(payload), _now_iso(), document_id),
        )

    def mark_extract_failed(self, conn: sqlite3.Connection, document_id: str, task_id: str, error: str) -> None:
        conn.execute(
            """
            UPDATE documents
            SET extract_status = 'failed',
                extract_task_id = ?,
                extract_completed_at = ?,
                extract_error_message = ?
            WHERE id = ?
            """,
            (task_id, _now_iso(), error[:4000], document_id),
        )

    # ─── Job 管理 ─────────────────────────────────────────────────────────

    def create_job(
        self,
        conn: sqlite3.Connection,
        document_id: str,
        schema_id: str,
        job_type: str = "extract",
        patient_id: Optional[str] = None,
    ) -> Optional[str]:
        job_id = _new_id("job")
        try:
            conn.execute(
                """
                INSERT INTO ehr_extraction_jobs
                    (id, document_id, patient_id, schema_id, job_type, status,
                     attempt_count, max_attempts, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'pending', 0, 3, ?, ?)
                """,
                (job_id, document_id, patient_id, schema_id, job_type, _now_iso(), _now_iso()),
            )
            return job_id
        except sqlite3.IntegrityError:
            return None

    def get_job(self, conn: sqlite3.Connection, job_id: str) -> Optional[Dict[str, Any]]:
        row = conn.execute("SELECT * FROM ehr_extraction_jobs WHERE id = ?", (job_id,)).fetchone()
        return dict(row) if row else None

    def claim_job(self, conn: sqlite3.Connection, job_id: str) -> bool:
        cur = conn.execute(
            """
            UPDATE ehr_extraction_jobs
            SET status = 'running',
                attempt_count = attempt_count + 1,
                started_at = ?,
                updated_at = ?
            WHERE id = ? AND status = 'pending'
            """,
            (_now_iso(), _now_iso(), job_id),
        )
        return cur.rowcount > 0

    def complete_job(self, conn: sqlite3.Connection, job_id: str, extraction_run_id: Optional[str] = None) -> None:
        conn.execute(
            """
            UPDATE ehr_extraction_jobs
            SET status = 'completed',
                completed_at = ?,
                result_extraction_run_id = COALESCE(?, result_extraction_run_id),
                last_error = NULL,
                updated_at = ?
            WHERE id = ?
            """,
            (_now_iso(), extraction_run_id, _now_iso(), job_id),
        )

    def fail_job(self, conn: sqlite3.Connection, job_id: str, error: str) -> None:
        conn.execute(
            """
            UPDATE ehr_extraction_jobs
            SET status = 'failed',
                last_error = ?,
                completed_at = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (error[:4000], _now_iso(), _now_iso(), job_id),
        )

    # ─── 物化层写入 ────────────────────────────────────────────────────────

    def ensure_schema_instance(self, conn: sqlite3.Connection, patient_id: str, schema_id: str, instance_type: str = "patient_ehr") -> str:
        row = conn.execute(
            """
            SELECT id FROM schema_instances
            WHERE patient_id = ? AND schema_id = ? AND instance_type = ?
            LIMIT 1
            """,
            (patient_id, schema_id, instance_type),
        ).fetchone()
        if row:
            return row["id"]
        new_id = _new_id("si")
        conn.execute(
            """
            INSERT INTO schema_instances (id, patient_id, schema_id, instance_type, name, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, '电子病历夹', 'draft', ?, ?)
            """,
            (new_id, patient_id, schema_id, instance_type, _now_iso(), _now_iso()),
        )
        return new_id

    def ensure_instance_document(self, conn: sqlite3.Connection, instance_id: str, document_id: str, relation_type: str = "source") -> None:
        conn.execute(
            "INSERT OR IGNORE INTO instance_documents (id, instance_id, document_id, relation_type, created_at) VALUES (?, ?, ?, ?, ?)",
            (_new_id("idoc"), instance_id, document_id, relation_type, _now_iso()),
        )

    def create_extraction_run(
        self, conn: sqlite3.Connection, *,
        instance_id: str, document_id: str,
        target_mode: str, target_path: Optional[str],
        model_name: Optional[str], prompt_version: Optional[str],
    ) -> str:
        run_id = _new_id("er")
        conn.execute(
            """
            INSERT INTO extraction_runs (id, instance_id, document_id, target_mode, target_path, status, model_name, prompt_version, started_at, created_at)
            VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?, ?)
            """,
            (run_id, instance_id, document_id, target_mode, target_path, model_name, prompt_version, _now_iso(), _now_iso()),
        )
        return run_id

    def finalize_extraction_run(self, conn: sqlite3.Connection, run_id: str, status: str, error: Optional[str] = None) -> None:
        conn.execute(
            "UPDATE extraction_runs SET status = ?, finished_at = ?, error_message = ? WHERE id = ?",
            (status, _now_iso(), error[:4000] if error else None, run_id),
        )

    def ensure_section_instance(
        self, conn: sqlite3.Connection, *,
        instance_id: str, section_path: str, repeat_index: int, is_repeatable: bool,
        created_by: str = "ai", parent_section_id: Optional[str] = None,
    ) -> str:
        if parent_section_id is None:
            row = conn.execute(
                "SELECT id FROM section_instances WHERE instance_id = ? AND section_path = ? AND repeat_index = ? AND parent_section_id IS NULL LIMIT 1",
                (instance_id, section_path, repeat_index),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT id FROM section_instances WHERE instance_id = ? AND section_path = ? AND repeat_index = ? AND parent_section_id = ? LIMIT 1",
                (instance_id, section_path, repeat_index, parent_section_id),
            ).fetchone()
        if row:
            return row["id"]
        section_id = _new_id("sec")
        conn.execute(
            """
            INSERT INTO section_instances (id, instance_id, section_path, parent_section_id, repeat_index,
                anchor_key, anchor_display, is_repeatable, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)
            """,
            (section_id, instance_id, section_path, parent_section_id, repeat_index,
             1 if is_repeatable else 0, created_by, _now_iso(), _now_iso()),
        )
        return section_id

    def ensure_row_instance(
        self, conn: sqlite3.Connection, *,
        instance_id: str, section_instance_id: str, group_path: str, repeat_index: int,
        is_repeatable: bool = True, created_by: str = "ai", parent_row_id: Optional[str] = None,
    ) -> str:
        if parent_row_id is None:
            row = conn.execute(
                "SELECT id FROM row_instances WHERE section_instance_id = ? AND group_path = ? AND repeat_index = ? AND parent_row_id IS NULL LIMIT 1",
                (section_instance_id, group_path, repeat_index),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT id FROM row_instances WHERE section_instance_id = ? AND group_path = ? AND repeat_index = ? AND parent_row_id = ? LIMIT 1",
                (section_instance_id, group_path, repeat_index, parent_row_id),
            ).fetchone()
        if row:
            return row["id"]
        row_id = _new_id("row")
        conn.execute(
            """
            INSERT INTO row_instances (id, instance_id, section_instance_id, group_path, parent_row_id, repeat_index,
                anchor_key, anchor_display, is_repeatable, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)
            """,
            (row_id, instance_id, section_instance_id, group_path, parent_row_id, repeat_index,
             1 if is_repeatable else 0, created_by, _now_iso(), _now_iso()),
        )
        return row_id

    def insert_candidate(
        self, conn: sqlite3.Connection, *,
        instance_id: str, section_instance_id: Optional[str], row_instance_id: Optional[str],
        field_path: str, value: Any, source_document_id: Optional[str],
        source_page: Optional[int], source_block_id: Optional[str],
        source_bbox: Optional[Any], source_text: Optional[str],
        extraction_run_id: Optional[str], confidence: Optional[float],
        created_by: str = "ai",
    ) -> str:
        candidate_id = _new_id("fvc")
        conn.execute(
            """
            INSERT INTO field_value_candidates (
                id, instance_id, section_instance_id, row_instance_id, field_path,
                value_json, value_type, normalized_value_text,
                source_document_id, source_page, source_block_id, source_bbox_json, source_text,
                extraction_run_id, confidence, created_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                candidate_id, instance_id, section_instance_id, row_instance_id, field_path,
                _json_dumps(value), _guess_value_type(value), _best_normalized_text(value),
                source_document_id, source_page, source_block_id,
                _json_dumps(source_bbox) if source_bbox is not None else None,
                source_text, extraction_run_id, confidence, created_by, _now_iso(),
            ),
        )
        return candidate_id

    def upsert_selected_if_absent(
        self, conn: sqlite3.Connection, *,
        instance_id: str, section_instance_id: Optional[str], row_instance_id: Optional[str],
        field_path: str, candidate_id: Optional[str], value: Any,
        selected_by: str = "ai", overwrite_existing: bool = False,
    ) -> None:
        row = conn.execute(
            """
            SELECT id, selected_by FROM field_value_selected
            WHERE instance_id = ?
              AND COALESCE(section_instance_id, '__null__') = COALESCE(?, '__null__')
              AND COALESCE(row_instance_id, '__null__') = COALESCE(?, '__null__')
              AND field_path = ?
            LIMIT 1
            """,
            (instance_id, section_instance_id, row_instance_id, field_path),
        ).fetchone()
        if row and not overwrite_existing:
            return
        if row:
            conn.execute(
                """
                UPDATE field_value_selected
                SET selected_candidate_id = ?, selected_value_json = ?, selected_by = ?, selected_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (candidate_id, _json_dumps(value), selected_by, _now_iso(), _now_iso(), row["id"]),
            )
            return
        conn.execute(
            """
            INSERT INTO field_value_selected (
                id, instance_id, section_instance_id, row_instance_id, field_path,
                selected_candidate_id, selected_value_json, selected_by, selected_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                _new_id("fvs"), instance_id, section_instance_id, row_instance_id, field_path,
                candidate_id, _json_dumps(value), selected_by, _now_iso(), _now_iso(),
            ),
        )
