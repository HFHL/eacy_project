from __future__ import annotations

"""
Simple EHR Pipeline

一个尽量简单、但可直接落地的版本：
1. 扫描 documents 表，找出已有 OCR 内容、且尚未做 EHR 抽取的文档
2. 读取 schemas.content_json
3. 调用 EhrExtractorAgent 做结构化抽取
4. 将结果写回 documents.extract_result_json
5. 若文档已归档到 patient_id，则立即物化到实例层表

设计目标：
- 保留你现有 agent 的输入输出契约
- 不引入 job 表 / daemon / subprocess
- 单文件即可跑通“扫库 -> 抽取 -> 回写 -> 物化”的最小闭环

放置建议：
- 将此文件放到与你现有 `ehr_extractor_agent.py` 同一个 Python package 下
- 或者确保运行时 PYTHONPATH 能 import 到 `ehr_extractor_agent.EhrExtractorAgent`

示例：
  python simple_ehr_pipeline.py --once
  python simple_ehr_pipeline.py --document-id <doc_id>
  python simple_ehr_pipeline.py --loop --interval 10
"""

import argparse
import asyncio
import json
import logging
import os
import sqlite3
import time
import uuid
from dataclasses import asdict, is_dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


logger = logging.getLogger("simple-ehr-pipeline")


# -----------------------------------------------------------------------------
# 路径 / 依赖
# -----------------------------------------------------------------------------

ROOT_DIR = Path(os.getenv("PROJECT_ROOT", Path.cwd()))
DB_PATH = Path(os.getenv("EACY_DB_PATH", ROOT_DIR / "backend" / "eacy.db"))
DEFAULT_SCHEMA_CODE = os.getenv("DEFAULT_EHR_SCHEMA_CODE", "patient_ehr_v2")
BATCH_LIMIT = int(os.getenv("EHR_PIPELINE_BATCH_LIMIT", "20"))

try:
    from ehr_extractor_agent import EhrExtractorAgent
except Exception as exc:  # pragma: no cover
    raise RuntimeError(
        "无法导入 ehr_extractor_agent.EhrExtractorAgent。"
        "请将本文件放到正确位置，或配置 PYTHONPATH。"
    ) from exc


# -----------------------------------------------------------------------------
# 通用工具
# -----------------------------------------------------------------------------


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



def _ocr_payload_to_content_list(ocr_payload: Any, raw_text: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    从 documents.ocr_payload（Textin JSON）或 documents.raw_text 构建 content_list。
    与你现有 agent 所需的输入保持兼容。
    """
    payload = _json_loads_maybe(ocr_payload, default=None)
    if not payload and raw_text and raw_text.strip().startswith("{"):
        payload = _json_loads_maybe(raw_text, default=None)

    if isinstance(payload, dict):
        segments = payload.get("segments")
        if isinstance(segments, list):
            from collections import defaultdict

            page_seq: Dict[int, int] = defaultdict(int)
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
                block_id = f"p{page_id}.{idx_in_page}"

                pos = seg.get("position")
                bbox = None
                if isinstance(pos, list) and len(pos) >= 8:
                    bbox = [pos[0], pos[1], pos[4], pos[5]]
                elif isinstance(pos, list) and len(pos) == 4:
                    bbox = pos

                content_list.append(
                    {
                        "id": block_id,
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

    if raw_text and isinstance(raw_text, str) and raw_text.strip():
        return [
            {
                "id": "p0.0",
                "bbox": None,
                "text": raw_text.strip(),
                "page_id": 0,
                "page_idx": 0,
                "type": "paragraph",
            }
        ]

    return []


# -----------------------------------------------------------------------------
# Repo
# -----------------------------------------------------------------------------


class Repo:
    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def get_schema_by_code(self, conn: sqlite3.Connection, schema_code: str) -> Dict[str, Any]:
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
            raise ValueError(f"schemas 中不存在可用 code={schema_code}")
        return {
            "id": row["id"],
            "name": row["name"],
            "code": row["code"],
            "version": row["version"],
            "content_json": _json_loads_maybe(row["content_json"], default={}),
        }

    def get_document(self, conn: sqlite3.Connection, document_id: str) -> Optional[Dict[str, Any]]:
        row = conn.execute(
            """
            SELECT id, patient_id, file_name, mime_type, doc_type, doc_title,
                   status, raw_text, ocr_payload, metadata,
                   extract_status, extract_task_id, extract_result_json,
                   extract_started_at, extract_completed_at, extract_error_message,
                   materialize_status, materialize_at, updated_at, created_at
            FROM documents
            WHERE id = ?
            LIMIT 1
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

    def list_pending_documents(
        self,
        conn: sqlite3.Connection,
        *,
        limit: int,
        document_ids: Optional[Sequence[str]] = None,
        include_failed: bool = False,
    ) -> List[Dict[str, Any]]:
        where = [
            "status NOT IN ('pending_upload', 'deleted')",
            "(COALESCE(raw_text, '') != '' OR COALESCE(ocr_payload, '') != '')",
        ]
        params: List[Any] = []

        if document_ids:
            placeholders = ",".join("?" for _ in document_ids)
            where.append(f"id IN ({placeholders})")
            params.extend(document_ids)
        else:
            if include_failed:
                where.append("COALESCE(extract_status, 'pending') IN ('pending', 'failed')")
            else:
                where.append("COALESCE(extract_status, 'pending') = 'pending'")

        sql = f"""
            SELECT id
            FROM documents
            WHERE {' AND '.join(where)}
            ORDER BY created_at ASC
            LIMIT ?
        """
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
        return [self.get_document(conn, row["id"]) for row in rows if row and row["id"]]

    def claim_document_for_extract(self, conn: sqlite3.Connection, document_id: str, task_id: str) -> bool:
        cur = conn.execute(
            """
            UPDATE documents
            SET extract_status = 'running',
                extract_task_id = ?,
                extract_started_at = ?,
                extract_completed_at = NULL,
                extract_error_message = NULL,
                updated_at = ?
            WHERE id = ?
              AND COALESCE(extract_status, 'pending') IN ('pending', 'failed')
            """,
            (task_id, _now_iso(), _now_iso(), document_id),
        )
        return cur.rowcount > 0

    def mark_extract_success(
        self,
        conn: sqlite3.Connection,
        document_id: str,
        task_id: str,
        payload: Dict[str, Any],
    ) -> None:
        conn.execute(
            """
            UPDATE documents
            SET extract_status = 'completed',
                extract_task_id = ?,
                extract_result_json = ?,
                extract_completed_at = ?,
                extract_error_message = NULL,
                updated_at = ?
            WHERE id = ?
            """,
            (task_id, _json_dumps(payload), _now_iso(), _now_iso(), document_id),
        )

    def mark_extract_failed(
        self,
        conn: sqlite3.Connection,
        document_id: str,
        task_id: str,
        error_message: str,
    ) -> None:
        conn.execute(
            """
            UPDATE documents
            SET extract_status = 'failed',
                extract_task_id = ?,
                extract_completed_at = ?,
                extract_error_message = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (task_id, _now_iso(), error_message[:4000], _now_iso(), document_id),
        )

    def mark_materialize_success(self, conn: sqlite3.Connection, document_id: str) -> None:
        conn.execute(
            """
            UPDATE documents
            SET materialize_status = 'completed',
                materialize_at = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (_now_iso(), _now_iso(), document_id),
        )

    def mark_materialize_failed(self, conn: sqlite3.Connection, document_id: str, error_message: str) -> None:
        conn.execute(
            """
            UPDATE documents
            SET materialize_status = 'failed',
                updated_at = ?
            WHERE id = ?
            """,
            (_now_iso(), document_id),
        )
        logger.error("物化失败: doc=%s err=%s", document_id, error_message)

    def ensure_schema_instance(self, conn: sqlite3.Connection, patient_id: str, schema_id: str) -> str:
        row = conn.execute(
            """
            SELECT id
            FROM schema_instances
            WHERE patient_id = ? AND schema_id = ? AND instance_type = 'patient_ehr'
            LIMIT 1
            """,
            (patient_id, schema_id),
        ).fetchone()
        if row:
            return row["id"]

        instance_id = _new_id("si")
        conn.execute(
            """
            INSERT INTO schema_instances (
                id, patient_id, schema_id, instance_type, name, status, created_at, updated_at
            ) VALUES (?, ?, ?, 'patient_ehr', '电子病历夹', 'draft', ?, ?)
            """,
            (instance_id, patient_id, schema_id, _now_iso(), _now_iso()),
        )
        return instance_id

    def ensure_instance_document(
        self,
        conn: sqlite3.Connection,
        instance_id: str,
        document_id: str,
        relation_type: str = "source",
    ) -> None:
        row = conn.execute(
            """
            SELECT id
            FROM instance_documents
            WHERE instance_id = ? AND document_id = ? AND relation_type = ?
            LIMIT 1
            """,
            (instance_id, document_id, relation_type),
        ).fetchone()
        if row:
            return

        conn.execute(
            """
            INSERT INTO instance_documents (id, instance_id, document_id, relation_type, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (_new_id("idoc"), instance_id, document_id, relation_type, _now_iso()),
        )

    def create_extraction_run(
        self,
        conn: sqlite3.Connection,
        *,
        instance_id: str,
        document_id: str,
        target_mode: str,
        target_path: Optional[str],
        model_name: Optional[str],
        prompt_version: Optional[str],
    ) -> str:
        run_id = _new_id("er")
        conn.execute(
            """
            INSERT INTO extraction_runs (
                id, instance_id, document_id, target_mode, target_path,
                status, model_name, prompt_version, started_at, created_at
            ) VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?, ?)
            """,
            (
                run_id,
                instance_id,
                document_id,
                target_mode,
                target_path,
                model_name,
                prompt_version,
                _now_iso(),
                _now_iso(),
            ),
        )
        return run_id

    def finalize_extraction_run(
        self,
        conn: sqlite3.Connection,
        run_id: str,
        *,
        status: str,
        error_message: Optional[str] = None,
    ) -> None:
        conn.execute(
            """
            UPDATE extraction_runs
            SET status = ?,
                finished_at = ?,
                error_message = ?
            WHERE id = ?
            """,
            (status, _now_iso(), error_message[:4000] if error_message else None, run_id),
        )

    def ensure_section_instance(
        self,
        conn: sqlite3.Connection,
        *,
        instance_id: str,
        section_path: str,
        repeat_index: int,
        is_repeatable: bool,
        created_by: str = "ai",
        parent_section_id: Optional[str] = None,
    ) -> str:
        if parent_section_id is None:
            row = conn.execute(
                """
                SELECT id
                FROM section_instances
                WHERE instance_id = ?
                  AND section_path = ?
                  AND repeat_index = ?
                  AND parent_section_id IS NULL
                LIMIT 1
                """,
                (instance_id, section_path, repeat_index),
            ).fetchone()
        else:
            row = conn.execute(
                """
                SELECT id
                FROM section_instances
                WHERE instance_id = ?
                  AND section_path = ?
                  AND repeat_index = ?
                  AND parent_section_id = ?
                LIMIT 1
                """,
                (instance_id, section_path, repeat_index, parent_section_id),
            ).fetchone()
        if row:
            return row["id"]

        section_id = _new_id("sec")
        conn.execute(
            """
            INSERT INTO section_instances (
                id, instance_id, section_path, parent_section_id, repeat_index,
                anchor_key, anchor_display, is_repeatable, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)
            """,
            (
                section_id,
                instance_id,
                section_path,
                parent_section_id,
                repeat_index,
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
        *,
        instance_id: str,
        section_instance_id: str,
        group_path: str,
        repeat_index: int,
        is_repeatable: bool = True,
        created_by: str = "ai",
        parent_row_id: Optional[str] = None,
    ) -> str:
        if parent_row_id is None:
            row = conn.execute(
                """
                SELECT id
                FROM row_instances
                WHERE section_instance_id = ?
                  AND group_path = ?
                  AND repeat_index = ?
                  AND parent_row_id IS NULL
                LIMIT 1
                """,
                (section_instance_id, group_path, repeat_index),
            ).fetchone()
        else:
            row = conn.execute(
                """
                SELECT id
                FROM row_instances
                WHERE section_instance_id = ?
                  AND group_path = ?
                  AND repeat_index = ?
                  AND parent_row_id = ?
                LIMIT 1
                """,
                (section_instance_id, group_path, repeat_index, parent_row_id),
            ).fetchone()
        if row:
            return row["id"]

        row_id = _new_id("row")
        conn.execute(
            """
            INSERT INTO row_instances (
                id, instance_id, section_instance_id, group_path, parent_row_id, repeat_index,
                anchor_key, anchor_display, is_repeatable, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)
            """,
            (
                row_id,
                instance_id,
                section_instance_id,
                group_path,
                parent_row_id,
                repeat_index,
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
        row = conn.execute(
            """
            SELECT id
            FROM field_value_selected
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

        conn.execute(
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


# -----------------------------------------------------------------------------
# Pipeline
# -----------------------------------------------------------------------------


class SimpleEhrPipeline:
    def __init__(self, repo: Optional[Repo] = None):
        self.repo = repo or Repo()

    def _run_agent(self, agent: Any, doc_payload: Dict[str, Any]) -> Any:
        return asyncio.run(agent.extract_single_document(doc_payload))

    def process_document(self, document_id: str, schema_code: str = DEFAULT_SCHEMA_CODE) -> Dict[str, Any]:
        with self.repo.connect() as conn:
            schema_rec = self.repo.get_schema_by_code(conn, schema_code)
            doc = self.repo.get_document(conn, document_id)
            if not doc:
                raise ValueError(f"documents 中不存在 document_id={document_id}")

            task_id = _new_id("doc_extract")
            claimed = self.repo.claim_document_for_extract(conn, document_id, task_id)
            conn.commit()

        if not claimed:
            logger.info("跳过文档（非 pending/failed 或已被占用）: %s", document_id)
            return {"document_id": document_id, "status": "skipped"}

        try:
            result_payload = self._extract_document(doc, schema_rec)
            materialize_info: Optional[Dict[str, Any]] = None

            with self.repo.connect() as conn:
                self.repo.mark_extract_success(conn, document_id, task_id, result_payload)
                fresh_doc = self.repo.get_document(conn, document_id)

                patient_id = fresh_doc.get("patient_id") if fresh_doc else None
                if patient_id:
                    materialize_info = self._materialize_from_staged_extraction(
                        conn=conn,
                        patient_id=patient_id,
                        document_id=document_id,
                        schema_id=schema_rec["id"],
                        extract_payload=result_payload,
                        content_list=_ocr_payload_to_content_list(
                            fresh_doc.get("ocr_payload"), fresh_doc.get("raw_text")
                        ),
                    )
                    self.repo.mark_materialize_success(conn, document_id)

                conn.commit()

            return {
                "document_id": document_id,
                "task_id": task_id,
                "extract_status": "completed",
                "materialized": bool(materialize_info),
                "materialize": materialize_info,
                "result": result_payload,
            }
        except Exception as exc:
            with self.repo.connect() as conn:
                self.repo.mark_extract_failed(conn, document_id, task_id, str(exc))
                conn.commit()
            raise

    def process_pending_documents(
        self,
        *,
        schema_code: str = DEFAULT_SCHEMA_CODE,
        limit: int = BATCH_LIMIT,
        document_ids: Optional[Sequence[str]] = None,
        include_failed: bool = False,
    ) -> List[Dict[str, Any]]:
        with self.repo.connect() as conn:
            docs = self.repo.list_pending_documents(
                conn,
                limit=limit,
                document_ids=document_ids,
                include_failed=include_failed,
            )

        outputs: List[Dict[str, Any]] = []
        for doc in docs:
            if not doc:
                continue
            doc_id = doc["id"]
            try:
                logger.info("开始处理文档: %s | file=%s", doc_id, doc.get("file_name") or "")
                payload = self.process_document(doc_id, schema_code=schema_code)
                outputs.append(payload)
                logger.info("处理完成: %s", doc_id)
            except Exception as exc:
                logger.exception("处理失败: %s | %s", doc_id, exc)
                outputs.append(
                    {
                        "document_id": doc_id,
                        "extract_status": "failed",
                        "error": str(exc),
                    }
                )
        return outputs

    def _extract_document(self, document: Dict[str, Any], schema_rec: Dict[str, Any]) -> Dict[str, Any]:
        content_list = _ocr_payload_to_content_list(document.get("ocr_payload"), document.get("raw_text"))
        if not content_list:
            raise ValueError(f"document_id={document['id']} 没有可用 OCR 内容")

        doc_payload = {
            "id": document["id"],
            "document_type": document.get("doc_type") or "",
            "document_sub_type": "",
            "file_name": document.get("file_name") or "",
            "content_list": content_list,
            "metadata": document.get("metadata") or {},
        }

        agent = EhrExtractorAgent(schema=schema_rec["content_json"])
        result_obj = self._run_agent(agent, doc_payload)
        return _result_to_plain_dict(result_obj)

    def _materialize_from_staged_extraction(
        self,
        *,
        conn: sqlite3.Connection,
        patient_id: str,
        document_id: str,
        schema_id: str,
        extract_payload: Dict[str, Any],
        content_list: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, str]:
        instance_id = self.repo.ensure_schema_instance(conn, patient_id, schema_id)
        self.repo.ensure_instance_document(conn, instance_id, document_id, relation_type="source")

        run_id = self.repo.create_extraction_run(
            conn,
            instance_id=instance_id,
            document_id=document_id,
            target_mode="full_instance",
            target_path=None,
            model_name="ehr_extractor_agent",
            prompt_version="simple_pipeline_v1",
        )

        try:
            task_results = extract_payload.get("task_results") or []
            if not isinstance(task_results, list):
                task_results = []

            source_id_to_bbox: Dict[str, Any] = {}
            if content_list:
                for chunk in content_list:
                    block_id = chunk.get("id")
                    if block_id:
                        source_id_to_bbox[block_id] = chunk.get("bbox")

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

            self.repo.finalize_extraction_run(conn, run_id, status="succeeded")
            return {"instance_id": instance_id, "extraction_run_id": run_id}
        except Exception as exc:
            self.repo.finalize_extraction_run(conn, run_id, status="failed", error_message=str(exc))
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

        full_pointer = "/" + "/".join(current_path)
        field_path = _normalize_field_path(full_pointer)
        audit_entry = audit_fields.get(full_pointer) or audit_fields.get(field_path) or {}

        source_page, source_block_id = self._parse_source_id(
            audit_entry.get("source_id") if isinstance(audit_entry, dict) else None
        )
        source_text = audit_entry.get("raw") if isinstance(audit_entry, dict) else None
        source_bbox = source_id_to_bbox.get(source_block_id) if source_block_id else None

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

    @staticmethod
    def _parse_source_id(source_id: Optional[str]) -> Tuple[Optional[int], Optional[str]]:
        if not source_id:
            return None, None
        try:
            if source_id.startswith("p") and "." in source_id:
                page_part, _ = source_id.split(".", 1)
                page_no = int(page_part[1:])
                return page_no, source_id
        except Exception:
            pass
        return None, source_id


# -----------------------------------------------------------------------------
# CLI
# -----------------------------------------------------------------------------


def _setup_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )



def main() -> None:
    parser = argparse.ArgumentParser(description="Simple EHR extraction/materialization pipeline")
    parser.add_argument("--schema-code", default=DEFAULT_SCHEMA_CODE)
    parser.add_argument("--document-id", action="append", help="只处理指定 document_id，可重复传")
    parser.add_argument("--limit", type=int, default=BATCH_LIMIT)
    parser.add_argument("--include-failed", action="store_true", help="重试 failed 文档")
    parser.add_argument("--once", action="store_true", help="执行一轮后退出")
    parser.add_argument("--loop", action="store_true", help="持续轮询")
    parser.add_argument("--interval", type=int, default=10, help="轮询间隔秒数")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    _setup_logging(args.verbose)
    pipeline = SimpleEhrPipeline()

    if args.document_id:
        outputs = pipeline.process_pending_documents(
            schema_code=args.schema_code,
            limit=max(len(args.document_id), 1),
            document_ids=args.document_id,
            include_failed=True,
        )
        print(json.dumps(outputs, ensure_ascii=False, indent=2))
        return

    if args.once or not args.loop:
        outputs = pipeline.process_pending_documents(
            schema_code=args.schema_code,
            limit=args.limit,
            include_failed=args.include_failed,
        )
        print(json.dumps(outputs, ensure_ascii=False, indent=2))
        return

    logger.info(
        "Simple EHR Pipeline 启动 | db=%s schema=%s interval=%ss",
        DB_PATH,
        args.schema_code,
        args.interval,
    )
    while True:
        try:
            pipeline.process_pending_documents(
                schema_code=args.schema_code,
                limit=args.limit,
                include_failed=args.include_failed,
            )
        except Exception:
            logger.exception("轮询执行异常")
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
