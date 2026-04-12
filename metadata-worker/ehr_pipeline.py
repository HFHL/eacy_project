from __future__ import annotations

"""
Document -> EHR staged extraction / materialization pipeline.

目标：
1. OCR 完成后，后台自动跑 EHR 抽取，但先只把结果"跟随文档"存到 documents.extract_result_json。
2. 文档归档到患者后，再把该文档的已抽取结果投影/物化到 schema_instances / section_instances /
   row_instances / field_value_candidates / field_value_selected。
3. 如果文档已经先归档，后续抽取完成时也会自动物化到病历夹实例里。

重要设计：
- 归档前：不写 field_value_* / section_instances / row_instances，因为当前表结构要求它们都依赖 instance_id。
- 归档后：再写实例层数据。
- 保持基础抽取流程不变：仍旧调用 EhrExtractorAgent.extract_single_document。

集成点：
- OCR 结束事件：调用 run_after_ocr(document_id, schema_code)
- 文档归档事件：调用 on_document_archived(document_id, patient_id, schema_code)

注意：
- 使用 SQLite，共享 backend/eacy.db。
- 数据库表结构基于项目真实 schema：
    - schemas (id, code, content_json)  —— 不是 ehr_schema
    - schema_instances.schema_id → schemas.id（UUID）
    - documents 表字段：ocr_payload / raw_text / status / doc_type / mime_type
    - extract_* 字段已通过 migration 添加
"""

import json
import logging
import math
import sqlite3
import uuid
from dataclasses import asdict, is_dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

ROOT_DIR = Path(__file__).resolve().parent.parent
DB_PATH = ROOT_DIR / "backend" / "eacy.db"

logger = logging.getLogger(__name__)


from ehr_extractor_agent import EhrExtractorAgent


# ═══════════════════════════════════════════════════════════════════════════════
# 基础工具
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


def _result_to_plain_dict(result: Any) -> Dict[str, Any]:
    if result is None:
        return {}
    if isinstance(result, dict):
        return result
    if hasattr(result, "model_dump"):
        return result.model_dump(mode="json")
    if is_dataclass(result):
        return asdict(result)
    if hasattr(result, "__dict__"):
        return dict(result.__dict__)
    raise TypeError(f"Unsupported result type: {type(result).__name__}")


def _normalize_field_path(full_pointer: str) -> str:
    """把 /A/0/B/1/C 归一化成 /A/B/C，索引信息交给 section_instance / row_instance 表达。"""
    if not full_pointer:
        return "/"
    parts = [p for p in full_pointer.split("/") if p != ""]
    norm = [p for p in parts if not p.isdigit()]
    return "/" + "/".join(norm)


def _is_scalar(value: Any) -> bool:
    return value is None or isinstance(value, (str, int, float, bool))


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


def _ocr_payload_to_content_list(ocr_payload: Any, raw_text: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    从 documents.ocr_payload（Textin JSON）或 documents.raw_text 构建 content_list。
    适配项目真实的 OCR 数据格式。
    """
    payload = _json_loads_maybe(ocr_payload, default=None)
    if not payload and raw_text and raw_text.strip().startswith("{"):
        payload = _json_loads_maybe(raw_text, default=None)

    if isinstance(payload, dict):
        segments = payload.get("segments")
        if isinstance(segments, list):
            import collections
            page_seq = collections.defaultdict(int)
            content_list: List[Dict[str, Any]] = []
            for seg in segments:
                if not isinstance(seg, dict):
                    continue
                text = (seg.get("text") or seg.get("content") or "").strip()
                if not text:
                    continue
                    
                raw_page = seg.get("page_id", 0)
                try:
                    page_id = int(raw_page) if raw_page is not None else 0
                except (TypeError, ValueError):
                    page_id = 0
                    
                idx_in_page = page_seq[page_id]
                page_seq[page_id] = idx_in_page + 1
                bid = f"p{page_id}.{idx_in_page}"
                
                pos = seg.get("position")
                bbox = None
                if isinstance(pos, list) and len(pos) >= 8:
                    bbox = [pos[0], pos[1], pos[4], pos[5]]
                elif isinstance(pos, list) and len(pos) == 4:
                    bbox = pos
                
                content_list.append(
                    {
                        "id": bid,
                        "bbox": bbox,
                        "text": text,
                        "page_id": page_id,
                        "page_idx": page_id,
                        "position": pos,
                        "type": seg.get("type"),
                        "sub_type": seg.get("sub_type"),
                    }
                )
            return content_list

    # fallback: 使用 raw_text（纯文本）
    if raw_text and isinstance(raw_text, str) and raw_text.strip():
        return [{"id": "p0.0", "bbox": None, "text": raw_text.strip(), "page_id": 0, "page_idx": 0, "type": "paragraph"}]

    return []


# ═══════════════════════════════════════════════════════════════════════════════
# SQLite 仓储 — 适配真实 DB Schema
# ═══════════════════════════════════════════════════════════════════════════════

class Repo:
    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def get_document(self, conn: sqlite3.Connection, document_id: str) -> Optional[Dict[str, Any]]:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, patient_id, file_name, mime_type, doc_type, doc_title,
                   status, raw_text, ocr_payload, metadata,
                   extract_status, extract_task_id, extract_result_json,
                   extract_started_at, extract_completed_at, extract_error_message
            FROM documents
            WHERE id = ?
            """,
            (document_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        rec = dict(row)
        rec["ocr_payload"] = _json_loads_maybe(rec.get("ocr_payload"), default={})
        rec["extract_result_json"] = _json_loads_maybe(rec.get("extract_result_json"), default=None)
        rec["metadata"] = _json_loads_maybe(rec.get("metadata"), default={})
        return rec

    def get_schema_by_code(self, conn: sqlite3.Connection, schema_code: str) -> Dict[str, Any]:
        """从 schemas 表按 code 查找（真实表是 schemas，不是 ehr_schema）。"""
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, name, code, version, content_json
            FROM schemas
            WHERE code = ? AND is_active = 1
            ORDER BY version DESC
            LIMIT 1
            """,
            (schema_code,),
        )
        row = cur.fetchone()
        if not row:
            raise ValueError(f"schemas 中不存在 code={schema_code}（或 is_active=0）")
        content_json = _json_loads_maybe(row["content_json"], default={})
        return {
            "id": row["id"],
            "code": row["code"],
            "name": row["name"],
            "version": row["version"],
            "content_json": content_json,
        }

    def mark_extract_running(self, conn: sqlite3.Connection, document_id: str, task_id: str) -> None:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE documents
            SET extract_status = ?,
                extract_task_id = ?,
                extract_started_at = ?,
                extract_completed_at = NULL,
                extract_error_message = NULL
            WHERE id = ?
            """,
            ("running", task_id, _now_iso(), document_id),
        )

    def mark_extract_success(self, conn: sqlite3.Connection, document_id: str, task_id: str, payload: Dict[str, Any]) -> None:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE documents
            SET extract_status = ?,
                extract_task_id = ?,
                extract_result_json = ?,
                extract_completed_at = ?,
                extract_error_message = NULL
            WHERE id = ?
            """,
            ("completed", task_id, _json_dumps(payload), _now_iso(), document_id),
        )

    def mark_extract_failed(self, conn: sqlite3.Connection, document_id: str, task_id: str, error_message: str) -> None:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE documents
            SET extract_status = ?,
                extract_task_id = ?,
                extract_completed_at = ?,
                extract_error_message = ?
            WHERE id = ?
            """,
            ("failed", task_id, _now_iso(), error_message[:4000], document_id),
        )

    def ensure_schema_instance(self, conn: sqlite3.Connection, patient_id: str, schema_id: str) -> str:
        """
        确保 schema_instances 中存在该患者的病历夹实例。
        注意：schema_id 此处是 schemas.id（UUID），不是 code。
        """
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id
            FROM schema_instances
            WHERE patient_id = ? AND schema_id = ? AND instance_type = 'patient_ehr'
            LIMIT 1
            """,
            (patient_id, schema_id),
        )
        row = cur.fetchone()
        if row:
            return row["id"]

        new_id = _new_id("si")
        cur.execute(
            """
            INSERT INTO schema_instances (id, patient_id, schema_id, instance_type, name, status, created_at, updated_at)
            VALUES (?, ?, ?, 'patient_ehr', '电子病历夹', 'draft', ?, ?)
            """,
            (new_id, patient_id, schema_id, _now_iso(), _now_iso()),
        )
        return new_id

    def ensure_instance_document(self, conn: sqlite3.Connection, instance_id: str, document_id: str, relation_type: str = "source") -> None:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT OR IGNORE INTO instance_documents (id, instance_id, document_id, relation_type, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (_new_id("idoc"), instance_id, document_id, relation_type, _now_iso()),
        )

    def create_extraction_run(self, conn: sqlite3.Connection, instance_id: str, document_id: str, target_mode: str, target_path: Optional[str], model_name: Optional[str], prompt_version: Optional[str]) -> str:
        run_id = _new_id("er")
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO extraction_runs (id, instance_id, document_id, target_mode, target_path, status, model_name, prompt_version, started_at, created_at)
            VALUES (?, ?, ?, ?, ?, 'succeeded', ?, ?, ?, ?)
            """,
            (run_id, instance_id, document_id, target_mode, target_path, model_name, prompt_version, _now_iso(), _now_iso()),
        )
        return run_id

    def finalize_extraction_run(self, conn: sqlite3.Connection, run_id: str, status: str, error_message: Optional[str] = None) -> None:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE extraction_runs
            SET status = ?, finished_at = ?, error_message = ?
            WHERE id = ?
            """,
            (status, _now_iso(), error_message, run_id),
        )

    # ─── Job 表 CRUD ──────────────────────────────────────────────────────────

    def create_job(
        self,
        conn: sqlite3.Connection,
        document_id: str,
        schema_id: str,
        job_type: str = "extract",
        patient_id: Optional[str] = None,
        max_attempts: int = 3,
    ) -> Optional[str]:
        """插入一条 pending job。若已有活跃 job（pending/running）则返回 None（幂等）。"""
        job_id = _new_id("job")
        try:
            conn.execute(
                """
                INSERT INTO ehr_extraction_jobs
                    (id, document_id, patient_id, schema_id, job_type, status,
                     attempt_count, max_attempts, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)
                """,
                (job_id, document_id, patient_id, schema_id, job_type, max_attempts, _now_iso(), _now_iso()),
            )
            return job_id
        except sqlite3.IntegrityError:
            # uq_ehr_jobs_active 冲突 → 已有活跃任务
            return None

    def get_job(self, conn: sqlite3.Connection, job_id: str) -> Optional[Dict[str, Any]]:
        cur = conn.cursor()
        cur.execute("SELECT * FROM ehr_extraction_jobs WHERE id = ?", (job_id,))
        row = cur.fetchone()
        return dict(row) if row else None

    def claim_job(self, conn: sqlite3.Connection, job_id: str) -> bool:
        """CAS: pending → running, attempt_count += 1。返回是否成功。"""
        now = _now_iso()
        cur = conn.execute(
            """
            UPDATE ehr_extraction_jobs
            SET status = 'running',
                attempt_count = attempt_count + 1,
                started_at = ?,
                updated_at = ?
            WHERE id = ? AND status = 'pending'
            """,
            (now, now, job_id),
        )
        return cur.rowcount > 0

    def complete_job(
        self,
        conn: sqlite3.Connection,
        job_id: str,
        extraction_run_id: Optional[str] = None,
    ) -> None:
        now = _now_iso()
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
            (now, extraction_run_id, now, job_id),
        )

    def fail_job(
        self,
        conn: sqlite3.Connection,
        job_id: str,
        error_message: str,
    ) -> None:
        """标记 job 失败。若 attempt_count < max_attempts 则回到 pending + 指数退避。"""
        job = self.get_job(conn, job_id)
        if not job:
            return
        now = _now_iso()
        attempt = job["attempt_count"]
        max_att = job["max_attempts"]

        if attempt < max_att:
            # 指数退避: 2^attempt * 30s, 上限 600s
            delay_seconds = min(int(math.pow(2, attempt)) * 30, 600)
            retry_dt = datetime.now(timezone.utc).timestamp() + delay_seconds
            next_retry = datetime.fromtimestamp(retry_dt, tz=timezone.utc).isoformat(
                timespec="milliseconds"
            ).replace("+00:00", "Z")
            conn.execute(
                """
                UPDATE ehr_extraction_jobs
                SET status = 'pending',
                    last_error = ?,
                    next_retry_at = ?,
                    completed_at = NULL,
                    updated_at = ?
                WHERE id = ?
                """,
                (error_message[:4000], next_retry, now, job_id),
            )
        else:
            conn.execute(
                """
                UPDATE ehr_extraction_jobs
                SET status = 'failed',
                    last_error = ?,
                    completed_at = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (error_message[:4000], now, now, job_id),
            )

    def find_active_job(
        self,
        conn: sqlite3.Connection,
        document_id: str,
        schema_id: str,
        job_type: str,
    ) -> Optional[Dict[str, Any]]:
        """查找某文档的活跃 job（pending/running）。"""
        cur = conn.cursor()
        cur.execute(
            """
            SELECT * FROM ehr_extraction_jobs
            WHERE document_id = ? AND schema_id = ? AND job_type = ?
              AND status IN ('pending', 'running')
            LIMIT 1
            """,
            (document_id, schema_id, job_type),
        )
        row = cur.fetchone()
        return dict(row) if row else None

    def create_materialize_job_if_needed(
        self,
        conn: sqlite3.Connection,
        document_id: str,
        patient_id: str,
        schema_id: str,
    ) -> Optional[str]:
        """
        如果文档已有 completed 的 extract job 且无活跃 materialize job，
        则自动创建一条 materialize job。
        """
        # 检查是否有已完成的 extract job
        completed = conn.execute(
            """
            SELECT id FROM ehr_extraction_jobs
            WHERE document_id = ? AND schema_id = ? AND job_type = 'extract' AND status = 'completed'
            LIMIT 1
            """,
            (document_id, schema_id),
        ).fetchone()
        if not completed:
            return None

        return self.create_job(
            conn,
            document_id=document_id,
            schema_id=schema_id,
            job_type="materialize",
            patient_id=patient_id,
        )

    def ensure_section_instance(
        self,
        conn: sqlite3.Connection,
        instance_id: str,
        section_path: str,
        repeat_index: int,
        is_repeatable: bool,
        created_by: str = "ai",
        parent_section_id: Optional[str] = None,
        anchor_key: Optional[str] = None,
        anchor_display: Optional[str] = None,
    ) -> str:
        cur = conn.cursor()
        if parent_section_id is None:
            cur.execute(
                """
                SELECT id FROM section_instances
                WHERE instance_id = ? AND section_path = ? AND repeat_index = ? AND parent_section_id IS NULL
                LIMIT 1
                """,
                (instance_id, section_path, repeat_index),
            )
        else:
            cur.execute(
                """
                SELECT id FROM section_instances
                WHERE instance_id = ? AND section_path = ? AND repeat_index = ? AND parent_section_id = ?
                LIMIT 1
                """,
                (instance_id, section_path, repeat_index, parent_section_id),
            )
        row = cur.fetchone()
        if row:
            return row["id"]

        section_id = _new_id("sec")
        cur.execute(
            """
            INSERT INTO section_instances (
                id, instance_id, section_path, parent_section_id, repeat_index,
                anchor_key, anchor_display, is_repeatable, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                section_id,
                instance_id,
                section_path,
                parent_section_id,
                repeat_index,
                anchor_key,
                anchor_display,
                1 if is_repeatable else 0,
                created_by,
                _now_iso(),
                _now_iso(),
            ),
        )
        return section_id

    def ensure_row_instance(
        self,
        conn: sqlite3.Connection,
        instance_id: str,
        section_instance_id: str,
        group_path: str,
        repeat_index: int,
        is_repeatable: bool = True,
        created_by: str = "ai",
        parent_row_id: Optional[str] = None,
        anchor_key: Optional[str] = None,
        anchor_display: Optional[str] = None,
    ) -> str:
        cur = conn.cursor()
        if parent_row_id is None:
            cur.execute(
                """
                SELECT id FROM row_instances
                WHERE section_instance_id = ? AND group_path = ? AND repeat_index = ? AND parent_row_id IS NULL
                LIMIT 1
                """,
                (section_instance_id, group_path, repeat_index),
            )
        else:
            cur.execute(
                """
                SELECT id FROM row_instances
                WHERE section_instance_id = ? AND group_path = ? AND repeat_index = ? AND parent_row_id = ?
                LIMIT 1
                """,
                (section_instance_id, group_path, repeat_index, parent_row_id),
            )
        row = cur.fetchone()
        if row:
            return row["id"]

        row_id = _new_id("row")
        cur.execute(
            """
            INSERT INTO row_instances (
                id, instance_id, section_instance_id, group_path, parent_row_id, repeat_index,
                anchor_key, anchor_display, is_repeatable, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row_id,
                instance_id,
                section_instance_id,
                group_path,
                parent_row_id,
                repeat_index,
                anchor_key,
                anchor_display,
                1 if is_repeatable else 0,
                created_by,
                _now_iso(),
                _now_iso(),
            ),
        )
        return row_id

    def insert_candidate(
        self,
        conn: sqlite3.Connection,
        *,
        instance_id: str,
        section_instance_id: Optional[str],
        row_instance_id: Optional[str],
        field_path: str,
        value: Any,
        source_document_id: Optional[str],
        source_page: Optional[int],
        source_block_id: Optional[str],
        source_bbox: Optional[Any],
        source_text: Optional[str],
        extraction_run_id: Optional[str],
        confidence: Optional[float],
        created_by: str = "ai",
    ) -> str:
        candidate_id = _new_id("fvc")
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO field_value_candidates (
                id, instance_id, section_instance_id, row_instance_id, field_path,
                value_json, value_type, normalized_value_text,
                source_document_id, source_page, source_block_id, source_bbox_json, source_text,
                extraction_run_id, confidence, created_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                candidate_id,
                instance_id,
                section_instance_id,
                row_instance_id,
                field_path,
                _json_dumps(value),
                _guess_value_type(value),
                _best_normalized_text(value),
                source_document_id,
                source_page,
                source_block_id,
                _json_dumps(source_bbox) if source_bbox is not None else None,
                source_text,
                extraction_run_id,
                confidence,
                created_by,
                _now_iso(),
            ),
        )
        return candidate_id

    def upsert_selected_if_absent(
        self,
        conn: sqlite3.Connection,
        *,
        instance_id: str,
        section_instance_id: Optional[str],
        row_instance_id: Optional[str],
        field_path: str,
        candidate_id: Optional[str],
        value: Any,
        selected_by: str = "ai",
        overwrite_existing: bool = False,
    ) -> None:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, selected_by
            FROM field_value_selected
            WHERE instance_id = ?
              AND COALESCE(section_instance_id, '__null__') = COALESCE(?, '__null__')
              AND COALESCE(row_instance_id, '__null__') = COALESCE(?, '__null__')
              AND field_path = ?
            LIMIT 1
            """,
            (instance_id, section_instance_id, row_instance_id, field_path),
        )
        row = cur.fetchone()
        if row and not overwrite_existing:
            return

        if row:
            cur.execute(
                """
                UPDATE field_value_selected
                SET selected_candidate_id = ?,
                    selected_value_json = ?,
                    selected_by = ?,
                    selected_at = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (candidate_id, _json_dumps(value), selected_by, _now_iso(), _now_iso(), row["id"]),
            )
            return

        cur.execute(
            """
            INSERT INTO field_value_selected (
                id, instance_id, section_instance_id, row_instance_id, field_path,
                selected_candidate_id, selected_value_json, selected_by, selected_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                _new_id("fvs"),
                instance_id,
                section_instance_id,
                row_instance_id,
                field_path,
                candidate_id,
                _json_dumps(value),
                selected_by,
                _now_iso(),
                _now_iso(),
            ),
        )


# ═══════════════════════════════════════════════════════════════════════════════
# 物化逻辑
# ═══════════════════════════════════════════════════════════════════════════════

class DocumentEhrPipeline:
    def __init__(self, repo: Optional[Repo] = None):
        self.repo = repo or Repo()

    def run_after_ocr(self, document_id: str, schema_code: str = "patient_ehr_v2") -> Dict[str, Any]:
        """
        OCR 完成后调用：
        1) 读取 documents.ocr_payload / raw_text
        2) 调 EhrExtractorAgent 做结构化抽取
        3) 抽取结果先写回 documents.extract_result_json（跟随文档）
        4) 若该文档此时已归档到患者，则顺手物化到病历夹实例
        """
        task_id = _new_id("doc_extract")
        with self.repo.connect() as conn:
            document = self.repo.get_document(conn, document_id)
            if not document:
                raise ValueError(f"documents 中不存在 document_id={document_id}")

            # 检查是否有 OCR 数据
            has_ocr = bool(document.get("ocr_payload")) or bool(document.get("raw_text"))
            if not has_ocr:
                raise ValueError(f"document_id={document_id} 没有可用的 OCR 数据（ocr_payload / raw_text 都为空）")

            schema_rec = self.repo.get_schema_by_code(conn, schema_code)
            self.repo.mark_extract_running(conn, document_id, task_id)
            conn.commit()

        try:
            content_list = _ocr_payload_to_content_list(
                document.get("ocr_payload"),
                document.get("raw_text"),
            )
            doc_payload = {
                "id": document_id,
                "document_type": document.get("doc_type") or "",
                "document_sub_type": "",
                "file_name": document.get("file_name") or "",
                "content_list": content_list,
            }

            agent = EhrExtractorAgent(schema=schema_rec["content_json"])
            result_obj = self._run_agent(agent, doc_payload)
            result_payload = _result_to_plain_dict(result_obj)

            with self.repo.connect() as conn:
                self.repo.mark_extract_success(conn, document_id, task_id, result_payload)
                conn.commit()

                # 如果文档已经归档到了患者，则自动物化到病历夹
                refreshed = self.repo.get_document(conn, document_id)
                patient_id = refreshed.get("patient_id") if refreshed else None
                if patient_id:
                    self._materialize_from_staged_extraction(
                        conn=conn,
                        patient_id=patient_id,
                        document_id=document_id,
                        schema_id=schema_rec["id"],  # schemas.id（UUID）
                        extract_payload=result_payload,
                        content_list=content_list,
                    )
                    # 标记物化完成
                    conn.execute(
                        "UPDATE documents SET materialize_status = 'completed', materialize_at = ?, updated_at = ? WHERE id = ?",
                        (_now_iso(), _now_iso(), document_id),
                    )
                    conn.commit()

            return result_payload

        except Exception as exc:
            with self.repo.connect() as conn:
                self.repo.mark_extract_failed(conn, document_id, task_id, str(exc))
                conn.commit()
            raise

    def on_document_archived(self, document_id: str, patient_id: str, schema_code: str = "patient_ehr_v2") -> Dict[str, Any]:
        """
        文档归档后调用：
        - 若该文档已经抽取完成，则立即物化到患者病历夹实例
        - 若尚未抽取完成，则只标记 patient_id；后续 run_after_ocr 完成时会自动补物化
        """
        with self.repo.connect() as conn:
            document = self.repo.get_document(conn, document_id)
            if not document:
                raise ValueError(f"documents 中不存在 document_id={document_id}")

            schema_rec = self.repo.get_schema_by_code(conn, schema_code)

            extract_status = document.get("extract_status")
            extract_payload = document.get("extract_result_json")
            materialized = False
            if extract_status == "completed" and isinstance(extract_payload, dict):
                content_list = _ocr_payload_to_content_list(document.get("ocr_payload"), document.get("raw_text"))
                self._materialize_from_staged_extraction(
                    conn=conn,
                    patient_id=patient_id,
                    document_id=document_id,
                    schema_id=schema_rec["id"],  # schemas.id（UUID）
                    extract_payload=extract_payload,
                    content_list=content_list,
                )
                # 标记物化完成
                conn.execute(
                    "UPDATE documents SET materialize_status = 'completed', materialize_at = ?, updated_at = ? WHERE id = ?",
                    (_now_iso(), _now_iso(), document_id),
                )
                materialized = True

            conn.commit()
            return {
                "document_id": document_id,
                "patient_id": patient_id,
                "extract_status": extract_status,
                "materialized": materialized,
            }

    def _run_agent(self, agent: Any, doc_payload: Dict[str, Any]) -> Any:
        import asyncio
        return asyncio.run(agent.extract_single_document(doc_payload))

    # ═══════════════════════════════════════════════════════════════════════════
    # Job-based 入口（新）
    # ═══════════════════════════════════════════════════════════════════════════

    def run_extract_job(self, job_id: str) -> Dict[str, Any]:
        """
        基于 job_id 执行 EHR 抽取。daemon 通过此入口调度。
        流程：claim job → 抽取 → 写 documents.extract_result_json → complete/fail job
        """
        import time as _time
        t0 = _time.time()

        logger.info("[EHR] ──── 开始 extract job: %s ────", job_id)

        with self.repo.connect() as conn:
            job = self.repo.get_job(conn, job_id)
            if not job:
                raise ValueError(f"job 不存在: {job_id}")

            if not self.repo.claim_job(conn, job_id):
                logger.warning("[EHR] job 已被抢占或非 pending: %s", job_id)
                return {"job_id": job_id, "status": "skipped"}
            conn.commit()

            document_id = job["document_id"]
            schema_id = job["schema_id"]
            document = self.repo.get_document(conn, document_id)
            if not document:
                self.repo.fail_job(conn, job_id, f"documents 中不存在 document_id={document_id}")
                conn.commit()
                raise ValueError(f"documents 中不存在 document_id={document_id}")

            file_name = document.get("file_name", "unknown")
            logger.info("[EHR] job=%s claimed | doc=%s | file=%s", job_id[:20], document_id[:12], file_name)

            has_ocr = bool(document.get("ocr_payload")) or bool(document.get("raw_text"))
            if not has_ocr:
                self.repo.fail_job(conn, job_id, "没有可用的 OCR 数据")
                conn.commit()
                raise ValueError(f"document_id={document_id} 没有可用的 OCR 数据")

            # 根据 schema_id (UUID) 查 schema —— 先查 id 再查 code
            schema_rec = self._get_schema_by_id_or_code(conn, schema_id)
            logger.info("[EHR] schema loaded: code=%s", schema_rec.get("code", "?"))

        # ── 执行抽取（不持有 DB 连接）──
        try:
            content_list = _ocr_payload_to_content_list(
                document.get("ocr_payload"),
                document.get("raw_text"),
            )
            logger.info("[EHR] OCR 内容解析完成: %d 个段落 | file=%s", len(content_list), file_name)

            doc_payload = {
                "id": document_id,
                "document_type": document.get("doc_type") or "",
                "document_sub_type": "",
                "file_name": file_name,
                "content_list": content_list,
                # 供 filter_documents_by_sources 从 metadata 中读取文档子类型
                "metadata": document.get("metadata"),
            }

            logger.info("[EHR] 初始化 EhrExtractorAgent...")
            agent = EhrExtractorAgent(schema=schema_rec["content_json"])
            logger.info("[EHR] 开始 LLM 抽取 (%d task roots)...", len(agent.task_roots))

            t1 = _time.time()
            result_obj = self._run_agent(agent, doc_payload)
            t2 = _time.time()
            result_payload = _result_to_plain_dict(result_obj)

            # 输出关键指标
            total_f = result_payload.get("total_fields", 0)
            filled_f = result_payload.get("filled_fields", 0)
            coverage = result_payload.get("coverage", 0)
            errs = result_payload.get("errors", [])
            logger.info(
                "[EHR] LLM 抽取完成: %.1fs | 字段 %d/%d (覆盖率 %.1f%%) | 错误 %d 条 | file=%s",
                t2 - t1, filled_f, total_f, coverage * 100, len(errs), file_name,
            )
            if errs:
                for e in errs[:5]:
                    logger.warning("[EHR]   ⚠ %s", str(e)[:200])

            # ── 写回 documents.extract_result_json + 标记 job 完成 ──
            with self.repo.connect() as conn:
                task_id = _new_id("doc_extract")
                self.repo.mark_extract_success(conn, document_id, task_id, result_payload)
                self.repo.complete_job(conn, job_id)
                conn.commit()
                logger.info("[EHR] 结果已写入 DB (task_id=%s)", task_id)

                # 如果有 patient_id，检查是否需要自动创建 materialize job
                refreshed = self.repo.get_document(conn, document_id)
                patient_id = refreshed.get("patient_id") if refreshed else None
                if patient_id:
                    mat_job_id = self.repo.create_materialize_job_if_needed(
                        conn, document_id, patient_id, schema_id
                    )
                    if mat_job_id:
                        logger.info("[EHR] 自动创建 materialize job: %s (doc=%s)", mat_job_id, document_id)
                    conn.commit()

            logger.info("[EHR] ──── extract job 完成: %s | 总耗时 %.1fs ────", job_id[:20], _time.time() - t0)
            return result_payload

        except Exception as exc:
            logger.error("[EHR] extract job 失败: %s | file=%s | err=%s", job_id[:20], file_name, str(exc)[:300])
            with self.repo.connect() as conn:
                self.repo.fail_job(conn, job_id, str(exc))
                # 同时更新 documents 表的 extract 状态（兼容旧逻辑）
                self.repo.mark_extract_failed(conn, document_id, job_id, str(exc))
                conn.commit()
            raise

    def run_materialize_job(self, job_id: str) -> Dict[str, Any]:
        """
        基于 job_id 执行 EHR 物化。daemon 通过此入口调度。
        """
        logger.info("[MATERIALIZE] ──── 开始 materialize job: %s ────", job_id)

        with self.repo.connect() as conn:
            job = self.repo.get_job(conn, job_id)
            if not job:
                raise ValueError(f"job 不存在: {job_id}")

            if not self.repo.claim_job(conn, job_id):
                logger.warning("[MATERIALIZE] job 已被抢占或非 pending: %s", job_id)
                return {"job_id": job_id, "status": "skipped"}
            conn.commit()

            document_id = job["document_id"]
            patient_id = job["patient_id"]
            schema_id = job["schema_id"]

            if not patient_id:
                self.repo.fail_job(conn, job_id, "缺少 patient_id")
                conn.commit()
                raise ValueError(f"materialize job {job_id} 缺少 patient_id")

            document = self.repo.get_document(conn, document_id)
            if not document:
                self.repo.fail_job(conn, job_id, f"documents 中不存在 document_id={document_id}")
                conn.commit()
                raise ValueError(f"documents 中不存在 document_id={document_id}")

            file_name = document.get("file_name", "unknown")
            logger.info("[MATERIALIZE] job=%s claimed | doc=%s | patient=%s | file=%s",
                        job_id[:20], document_id[:12], patient_id[:12], file_name)

            extract_payload = document.get("extract_result_json")
            if not isinstance(extract_payload, dict):
                self.repo.fail_job(conn, job_id, "无可用的 extract_result_json")
                conn.commit()
                raise ValueError(f"document_id={document_id} 无可用的 extract_result_json")

            try:
                content_list = _ocr_payload_to_content_list(document.get("ocr_payload"), document.get("raw_text"))
                run_id = self._materialize_from_staged_extraction(
                    conn=conn,
                    patient_id=patient_id,
                    document_id=document_id,
                    schema_id=schema_id,
                    extract_payload=extract_payload,
                    content_list=content_list,
                )
                self.repo.complete_job(conn, job_id, extraction_run_id=run_id)
                conn.commit()

                logger.info("[MATERIALIZE] ──── job 完成: %s | doc=%s | patient=%s ────", job_id[:20], document_id[:12], patient_id[:12])
                return {
                    "job_id": job_id,
                    "document_id": document_id,
                    "patient_id": patient_id,
                    "instance_id": run_id,
                    "materialized": True,
                }
            except Exception as exc:
                self.repo.fail_job(conn, job_id, str(exc))
                conn.commit()
                raise

    def _get_schema_by_id_or_code(
        self, conn: sqlite3.Connection, schema_id_or_code: str
    ) -> Dict[str, Any]:
        """先按 schemas.id (UUID) 查，查不到再按 code 查。"""
        cur = conn.cursor()
        cur.execute(
            "SELECT id, name, code, version, content_json FROM schemas WHERE id = ? LIMIT 1",
            (schema_id_or_code,),
        )
        row = cur.fetchone()
        if row:
            return {
                "id": row["id"],
                "code": row["code"],
                "name": row["name"],
                "version": row["version"],
                "content_json": _json_loads_maybe(row["content_json"], default={}),
            }
        # fallback: 按 code 查
        return self.repo.get_schema_by_code(conn, schema_id_or_code)

    def _materialize_from_staged_extraction(
        self,
        *,
        conn: sqlite3.Connection,
        document_id: str,
        schema_id: str,
        extract_payload: Dict[str, Any],
        content_list: Optional[List[Dict[str, Any]]] = None,
    ) -> str:
        """
        将 documents.extract_result_json 里的 staged 抽取结果写入实例层表。
        逻辑：
        1. 确保 schema_instance 存在
        2. 绑定 instance_documents
        3. 为这次物化创建 extraction_runs（实例层）
        4. 遍历 task_results / audit.fields，把候选值写入 field_value_candidates
        5. 若某字段当前尚无 selected，则自动选中最新候选值
        """
        instance_id = self.repo.ensure_schema_instance(conn, patient_id, schema_id)
        self.repo.ensure_instance_document(conn, instance_id, document_id, relation_type="source")

        run_id = self.repo.create_extraction_run(
            conn,
            instance_id=instance_id,
            document_id=document_id,
            target_mode="full_instance",
            target_path=None,
            model_name="ehr_extractor_agent",
            prompt_version="staged_materialize_v1",
        )

        try:
            task_results = extract_payload.get("task_results") or []
            if not isinstance(task_results, list):
                task_results = []
                
            source_id_to_bbox = {}
            if content_list:
                for chunk in content_list:
                    if chunk.get("id") and chunk.get("bbox"):
                        source_id_to_bbox[chunk["id"]] = chunk["bbox"]

            for task in task_results:
                if not isinstance(task, dict):
                    continue
                task_path = task.get("path") or []
                extracted = task.get("extracted")
                audit = task.get("audit") or {}
                audit_fields = audit.get("fields") if isinstance(audit, dict) else {}
                if not isinstance(task_path, list):
                    continue
                if extracted in (None, {}, []):
                    continue

                section_path = "/" + "/".join(task_path)
                root_is_repeatable = isinstance(extracted, list)

                if isinstance(extracted, list):
                    for idx, item in enumerate(extracted):
                        section_instance_id = self.repo.ensure_section_instance(
                            conn,
                            instance_id=instance_id,
                            section_path=section_path,
                            repeat_index=idx,
                            is_repeatable=True,
                            created_by="ai",
                        )
                        self._persist_node(
                            conn=conn,
                            instance_id=instance_id,
                            section_instance_id=section_instance_id,
                            row_instance_id=None,
                            current_path=task_path,
                            node=item,
                            audit_fields=audit_fields,
                            document_id=document_id,
                            extraction_run_id=run_id,
                            source_id_to_bbox=source_id_to_bbox,
                        )
                else:
                    section_instance_id = self.repo.ensure_section_instance(
                        conn,
                        instance_id=instance_id,
                        section_path=section_path,
                        repeat_index=0,
                        is_repeatable=root_is_repeatable,
                        created_by="ai",
                    )
                    self._persist_node(
                        conn=conn,
                        instance_id=instance_id,
                        section_instance_id=section_instance_id,
                        row_instance_id=None,
                        current_path=task_path,
                        node=extracted,
                        audit_fields=audit_fields,
                        document_id=document_id,
                        extraction_run_id=run_id,
                        source_id_to_bbox=source_id_to_bbox,
                    )

            self.repo.finalize_extraction_run(conn, run_id, "succeeded", None)
            return instance_id
        except Exception as exc:
            self.repo.finalize_extraction_run(conn, run_id, "failed", str(exc))
            raise

    def _persist_node(
        self,
        *,
        conn: sqlite3.Connection,
        instance_id: str,
        section_instance_id: str,
        row_instance_id: Optional[str],
        current_path: List[str],
        node: Any,
        audit_fields: Dict[str, Any],
        document_id: str,
        extraction_run_id: str,
        source_id_to_bbox: Dict[str, Any],
        parent_row_id: Optional[str] = None,
    ) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                self._persist_node(
                    conn=conn,
                    instance_id=instance_id,
                    section_instance_id=section_instance_id,
                    row_instance_id=row_instance_id,
                    current_path=current_path + [key],
                    node=value,
                    audit_fields=audit_fields,
                    document_id=document_id,
                    extraction_run_id=extraction_run_id,
                    source_id_to_bbox=source_id_to_bbox,
                    parent_row_id=parent_row_id,
                )
            return

        if isinstance(node, list):
            group_path = "/" + "/".join(current_path)
            for idx, item in enumerate(node):
                child_row_id = self.repo.ensure_row_instance(
                    conn,
                    instance_id=instance_id,
                    section_instance_id=section_instance_id,
                    group_path=group_path,
                    repeat_index=idx,
                    parent_row_id=parent_row_id,
                    is_repeatable=True,
                    created_by="ai",
                )
                self._persist_node(
                    conn=conn,
                    instance_id=instance_id,
                    section_instance_id=section_instance_id,
                    row_instance_id=child_row_id,
                    current_path=current_path,
                    node=item,
                    audit_fields=audit_fields,
                    document_id=document_id,
                    extraction_run_id=extraction_run_id,
                    source_id_to_bbox=source_id_to_bbox,
                    parent_row_id=child_row_id,
                )
            return

        # 叶子节点（标量值）
        full_pointer = "/" + "/".join(current_path)
        field_path = _normalize_field_path(full_pointer)
        audit_entry = audit_fields.get(full_pointer) or audit_fields.get(field_path) or {}
        source_page, source_block_id = self._parse_source_id(audit_entry.get("source_id")) if isinstance(audit_entry, dict) else (None, None)
        source_text = audit_entry.get("raw") if isinstance(audit_entry, dict) else None
        
        source_bbox = None
        if source_block_id and source_id_to_bbox:
            # 块 ID 是 p0.1, 但 source_id_to_bbox 里的 id 如果匹配可直接获取
            # 但注意 source_id 可能本身就是 block_id ('p0.1')。 _parse_source_id 返回了 page=0, block_id='p0.1'。 
            # 所以需要直接用 block_id 去拉取 bbox。
            source_bbox = source_id_to_bbox.get(source_block_id)
            if source_bbox is not None:
                source_bbox = json.dumps(source_bbox, ensure_ascii=False)

        candidate_id = self.repo.insert_candidate(
            conn,
            instance_id=instance_id,
            section_instance_id=section_instance_id,
            row_instance_id=row_instance_id,
            field_path=field_path,
            value=node,
            source_document_id=document_id,
            source_page=source_page,
            source_block_id=source_block_id,
            source_bbox=source_bbox,
            source_text=source_text,
            extraction_run_id=extraction_run_id,
            confidence=None,
            created_by="ai",
        )
        self.repo.upsert_selected_if_absent(
            conn,
            instance_id=instance_id,
            section_instance_id=section_instance_id,
            row_instance_id=row_instance_id,
            field_path=field_path,
            candidate_id=candidate_id,
            value=node,
            selected_by="ai",
            overwrite_existing=False,
        )

    def _parse_source_id(self, source_id: Optional[str]) -> Tuple[Optional[int], Optional[str]]:
        if not source_id:
            return None, None
        # 支持 p0.3 这种格式
        try:
            if source_id.startswith("p") and "." in source_id:
                page_part, _ = source_id.split(".", 1)
                page_no = int(page_part[1:])
                return page_no, source_id
        except Exception:
            pass
        return None, source_id


# ═══════════════════════════════════════════════════════════════════════════════
# CLI（方便本地手动测试 + 被 subprocess 调用）
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import argparse
    import sys

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stderr,
    )

    parser = argparse.ArgumentParser(description="Document -> EHR staged extraction/materialization pipeline")
    parser.add_argument("--mode", choices=["after_ocr", "on_archive"])
    parser.add_argument("--document-id")
    parser.add_argument("--patient-id")
    parser.add_argument("--schema-code", default="patient_ehr_v2")
    parser.add_argument("--job-id", help="Job-based execution: pass job ID from ehr_extraction_jobs table")
    parser.add_argument("--job-type", choices=["extract", "materialize"], help="Required if --job-id is used")
    args = parser.parse_args()

    svc = DocumentEhrPipeline()

    # ── 新模式：基于 job-id ──
    if args.job_id:
        jt = args.job_type
        if not jt:
            # 自动从 DB 查 job_type
            with svc.repo.connect() as conn:
                job = svc.repo.get_job(conn, args.job_id)
                if not job:
                    raise SystemExit(f"job 不存在: {args.job_id}")
                jt = job["job_type"]

        if jt == "extract":
            payload = svc.run_extract_job(job_id=args.job_id)
        elif jt == "materialize":
            payload = svc.run_materialize_job(job_id=args.job_id)
        else:
            raise SystemExit(f"不支持的 job_type: {jt}")
        print(json.dumps(payload, ensure_ascii=False, indent=2))

    # ── 兼容旧模式 ──
    elif args.mode:
        if not args.document_id:
            raise SystemExit("--mode 模式需要 --document-id")
        if args.mode == "after_ocr":
            payload = svc.run_after_ocr(document_id=args.document_id, schema_code=args.schema_code)
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        else:
            if not args.patient_id:
                raise SystemExit("--mode on_archive 时必须传 --patient-id")
            payload = svc.on_document_archived(document_id=args.document_id, patient_id=args.patient_id, schema_code=args.schema_code)
            print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        raise SystemExit("必须指定 --job-id 或 --mode")

