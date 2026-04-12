#!/usr/bin/env python3
"""
Pipeline Daemon — 后台轮询守护进程

每 N 秒扫描 documents 表，自动派发处理任务：
  1. OCR：status = ocr_pending 且有 object_key
  2. Metadata 抽取：OCR 完成（raw_text 非空）且 meta_status = pending
  3. EHR 结构化抽取：OCR 完成且 extract_status = pending
  4. EHR 物化：已归档(patient_id 非空)且 extract_status = completed 且 materialize_status = pending

特性：
  - 通过 CAS 更新保证幂等性（UPDATE ... WHERE status = 'pending'）
  - 并发控制：每阶段限制最大并行数
  - 保留 Prefect：OCR 仍通过 Prefect Deployment 触发
  - 其余阶段通过 subprocess 独立进程运行
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import subprocess
import sys
import time
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from dotenv import load_dotenv

# 加载项目根 .env
ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

from config import (
    DB_PATH,
    OCR_PYTHON,
    OCR_SCRIPT,
    WORKER_PYTHON,
    META_SCRIPT,
    EHR_SCRIPT,
    PREFECT_API_URL,
    PREFECT_OCR_DEPLOYMENT_ID,
    USE_PREFECT_FOR_OCR,
    POLL_INTERVAL_SECONDS,
    MAX_CONCURRENT_OCR,
    MAX_CONCURRENT_META,
    MAX_CONCURRENT_EHR,
    MAX_CONCURRENT_MATERIALIZE,
    DEFAULT_SCHEMA_CODE,
    MAX_RETRIES,
)

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("pipeline-daemon")


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


# ─── CAS (Compare-And-Swap) 状态更新 ─────────────────────────────────────────

def _cas_update(conn: sqlite3.Connection, doc_id: str,
                field: str, expected: str, new_value: str,
                extra_sets: Optional[Dict[str, Any]] = None) -> bool:
    """
    原子性地将 documents.{field} 从 expected 更新为 new_value。
    返回是否成功（行匹配数 > 0）。
    """
    set_parts = [f"{field} = ?", "updated_at = ?"]
    params: list = [new_value, _now_iso()]

    if extra_sets:
        for k, v in extra_sets.items():
            set_parts.append(f"{k} = ?")
            params.append(v)

    params.extend([doc_id, expected])
    sql = f"UPDATE documents SET {', '.join(set_parts)} WHERE id = ? AND {field} = ?"
    cur = conn.execute(sql, params)
    conn.commit()
    return cur.rowcount > 0


# ═══════════════════════════════════════════════════════════════════════════════
# 阶段 1：OCR
# ═══════════════════════════════════════════════════════════════════════════════

def _trigger_ocr_via_prefect(doc_id: str) -> None:
    """通过 Prefect API 触发 OCR flow run"""
    import urllib.request

    url = f"{PREFECT_API_URL}/deployments/{PREFECT_OCR_DEPLOYMENT_ID}/create_flow_run"
    payload = json.dumps({"parameters": {"document_id": doc_id}}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            logger.info("[OCR] Prefect flow run 已创建: %s → %s", doc_id, data.get("id"))
    except Exception as e:
        logger.error("[OCR] Prefect 触发失败: %s → %s", doc_id, e)
        # 回退状态
        with _connect() as conn:
            _cas_update(conn, doc_id, "status", "ocr_pending", "ocr_pending")


def _trigger_ocr_subprocess(doc_id: str) -> None:
    """直接 subprocess 运行 OCR flow"""
    try:
        result = subprocess.run(
            [OCR_PYTHON, OCR_SCRIPT, doc_id],
            capture_output=True, text=True, timeout=600,
            cwd=str(Path(OCR_SCRIPT).parent),
        )
        if result.returncode != 0:
            logger.error("[OCR] 子进程失败: %s → %s", doc_id, result.stderr[:500])
    except subprocess.TimeoutExpired:
        logger.error("[OCR] 子进程超时: %s", doc_id)
    except Exception as e:
        logger.error("[OCR] 子进程异常: %s → %s", doc_id, e)


def dispatch_ocr(doc_id: str) -> None:
    """派发 OCR 任务"""
    if USE_PREFECT_FOR_OCR:
        _trigger_ocr_via_prefect(doc_id)
    else:
        _trigger_ocr_subprocess(doc_id)


# ═══════════════════════════════════════════════════════════════════════════════
# 阶段 2：Metadata 抽取
# ═══════════════════════════════════════════════════════════════════════════════

def dispatch_metadata(doc_id: str) -> None:
    """派发元数据抽取任务"""
    try:
        result = subprocess.run(
            [WORKER_PYTHON, META_SCRIPT, "--document-id", doc_id],
            capture_output=True, text=True, timeout=300,
            cwd=str(Path(META_SCRIPT).parent),
        )
        if result.returncode == 0:
            logger.info("[META] 完成: %s", doc_id)
            with _connect() as conn:
                conn.execute(
                    "UPDATE documents SET meta_status = 'completed', meta_completed_at = ?, meta_error_message = NULL, updated_at = ? WHERE id = ?",
                    (_now_iso(), _now_iso(), doc_id),
                )
                conn.commit()
        else:
            error_msg = (result.stderr or result.stdout or "unknown error")[:2000]
            logger.error("[META] 失败: %s → %s", doc_id, error_msg[:200])
            with _connect() as conn:
                conn.execute(
                    "UPDATE documents SET meta_status = 'failed', meta_completed_at = ?, meta_error_message = ?, updated_at = ? WHERE id = ?",
                    (_now_iso(), error_msg, _now_iso(), doc_id),
                )
                conn.commit()
    except subprocess.TimeoutExpired:
        logger.error("[META] 子进程超时: %s", doc_id)
        with _connect() as conn:
            conn.execute(
                "UPDATE documents SET meta_status = 'failed', meta_error_message = 'timeout', updated_at = ? WHERE id = ?",
                (_now_iso(), doc_id),
            )
            conn.commit()
    except Exception as e:
        logger.error("[META] 异常: %s → %s", doc_id, e)
        with _connect() as conn:
            conn.execute(
                "UPDATE documents SET meta_status = 'failed', meta_error_message = ?, updated_at = ? WHERE id = ?",
                (str(e)[:2000], _now_iso(), doc_id),
            )
            conn.commit()


# ═════════════════════════════════════════════════════════════════════════════
# 阶段 3：EHR 结构化抽取（Job-based）
# ═════════════════════════════════════════════════════════════════════════════

def dispatch_ehr_extract_job(job_id: str) -> None:
    """派发 EHR 结构化抽取任务（基于 job_id）"""
    try:
        logger.info("[EHR] 开始执行 extract: job=%s", job_id)
        proc = subprocess.Popen(
            [WORKER_PYTHON, EHR_SCRIPT, "--job-id", job_id, "--job-type", "extract"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            cwd=str(Path(EHR_SCRIPT).parent),
        )
        # 实时流式输出 stderr（worker 的日志都写到 stderr）
        for line in proc.stderr:
            line = line.rstrip()
            if line:
                logger.info("[EHR|%s] %s", job_id[:12], line)
        proc.wait(timeout=3600)

        if proc.returncode == 0:
            # stdout 里是 JSON 结果
            stdout_text = proc.stdout.read()
            logger.info("[EHR] 抽取完成: job=%s (output %d bytes)", job_id, len(stdout_text))
        else:
            stdout_text = proc.stdout.read()
            logger.error("[EHR] 抽取失败 (rc=%d): job=%s → %s", proc.returncode, job_id, stdout_text[:500])
    except subprocess.TimeoutExpired:
        logger.error("[EHR] 子进程超时: job=%s", job_id)
        proc.kill()
        with _connect() as conn:
            conn.execute(
                "UPDATE ehr_extraction_jobs SET status = 'failed', last_error = 'subprocess timeout', completed_at = ?, updated_at = ? WHERE id = ?",
                (_now_iso(), _now_iso(), job_id),
            )
            conn.commit()
    except Exception as e:
        logger.error("[EHR] 异常: job=%s → %s", job_id, e, exc_info=True)


# ═════════════════════════════════════════════════════════════════════════════
# 阶段 4：EHR 物化（Job-based）
# ═════════════════════════════════════════════════════════════════════════════

def dispatch_materialize_job(job_id: str) -> None:
    """派发 EHR 物化任务（基于 job_id）"""
    try:
        logger.info("[MATERIALIZE] 开始执行: job=%s", job_id)
        proc = subprocess.Popen(
            [WORKER_PYTHON, EHR_SCRIPT, "--job-id", job_id, "--job-type", "materialize"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            cwd=str(Path(EHR_SCRIPT).parent),
        )
        for line in proc.stderr:
            line = line.rstrip()
            if line:
                logger.info("[MAT|%s] %s", job_id[:12], line)
        proc.wait(timeout=120)

        if proc.returncode == 0:
            logger.info("[MATERIALIZE] 完成: job=%s", job_id)
        else:
            stdout_text = proc.stdout.read()
            logger.error("[MATERIALIZE] 失败 (rc=%d): job=%s → %s", proc.returncode, job_id, stdout_text[:500])
    except subprocess.TimeoutExpired:
        logger.error("[MATERIALIZE] 子进程超时: job=%s", job_id)
        proc.kill()
        with _connect() as conn:
            conn.execute(
                "UPDATE ehr_extraction_jobs SET status = 'failed', last_error = 'subprocess timeout', completed_at = ?, updated_at = ? WHERE id = ?",
                (_now_iso(), _now_iso(), job_id),
            )
            conn.commit()
    except Exception as e:
        logger.error("[MATERIALIZE] 异常: job=%s → %s", job_id, e, exc_info=True)


# ═════════════════════════════════════════════════════════════════════════════
# 辅助：自动创建 extract job（为无 job 的文档补建）
# ═════════════════════════════════════════════════════════════════════════════

def _get_default_schema_id(conn: sqlite3.Connection) -> Optional[str]:
    """获取默认 schema 的 UUID id。"""
    row = conn.execute(
        "SELECT id FROM schemas WHERE code = ? AND is_active = 1 ORDER BY version DESC LIMIT 1",
        (DEFAULT_SCHEMA_CODE,),
    ).fetchone()
    return row["id"] if row else None


def _ensure_extract_jobs_for_pending_docs(conn: sqlite3.Connection, schema_id: str, limit: int = 10) -> int:
    """
    为有 OCR 数据但且没有活跃 extract job 的文档自动创建 pending job。
    这是从“轮询 documents 表”向“轮询 job 表”过渡的桥接逻辑。
    """
    rows = conn.execute("""
        SELECT d.id
        FROM documents d
        WHERE d.raw_text IS NOT NULL
          AND d.raw_text != ''
          AND d.status NOT IN ('pending_upload', 'deleted')
          AND NOT EXISTS (
              SELECT 1 FROM ehr_extraction_jobs j
              WHERE j.document_id = d.id AND j.schema_id = ? AND j.job_type = 'extract'
          )
        ORDER BY d.created_at ASC
        LIMIT ?
    """, (schema_id, limit)).fetchall()

    created = 0
    now = _now_iso()
    for row in rows:
        try:
            conn.execute(
                """
                INSERT INTO ehr_extraction_jobs
                    (id, document_id, patient_id, schema_id, job_type, status,
                     attempt_count, max_attempts, created_at, updated_at)
                VALUES (?, ?, NULL, ?, 'extract', 'pending', 0, ?, ?, ?)
                """,
                (f"job_{__import__('uuid').uuid4().hex}", row["id"], schema_id, MAX_RETRIES, now, now),
            )
            created += 1
        except sqlite3.IntegrityError:
            pass
    if created:
        conn.commit()
        logger.info("[TICK] 自动创建 %d 条 extract job", created)
    return created


def _ensure_materialize_jobs_for_archived_docs(conn: sqlite3.Connection, schema_id: str, limit: int = 10) -> int:
    """
    为已归档且 extract 完成但无 materialize job 的文档自动创建 pending job。
    """
    rows = conn.execute("""
        SELECT d.id, d.patient_id
        FROM documents d
        WHERE d.patient_id IS NOT NULL
          AND d.patient_id != ''
          AND d.status NOT IN ('deleted')
          AND EXISTS (
              SELECT 1 FROM ehr_extraction_jobs j
              WHERE j.document_id = d.id AND j.schema_id = ? AND j.job_type = 'extract' AND j.status = 'completed'
          )
          AND NOT EXISTS (
              SELECT 1 FROM ehr_extraction_jobs j2
              WHERE j2.document_id = d.id AND j2.schema_id = ? AND j2.job_type = 'materialize'
          )
        ORDER BY d.created_at ASC
        LIMIT ?
    """, (schema_id, schema_id, limit)).fetchall()

    created = 0
    now = _now_iso()
    for row in rows:
        try:
            conn.execute(
                """
                INSERT INTO ehr_extraction_jobs
                    (id, document_id, patient_id, schema_id, job_type, status,
                     attempt_count, max_attempts, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'materialize', 'pending', 0, ?, ?, ?)
                """,
                (f"job_{__import__('uuid').uuid4().hex}", row["id"], row["patient_id"], schema_id, MAX_RETRIES, now, now),
            )
            created += 1
        except sqlite3.IntegrityError:
            pass
    if created:
        conn.commit()
        logger.info("[TICK] 自动创建 %d 条 materialize job", created)
    return created


# ═══════════════════════════════════════════════════════════════════════════════
# 核心守护循环
# ═══════════════════════════════════════════════════════════════════════════════

class PipelineDaemon:
    """
    后台轮询守护进程。
    每 tick() 扫描一次数据库，找出满足条件的文档和 job，派发处理任务。
    阶段 1/2 仍查 documents 表，阶段 3/4 改查 ehr_extraction_jobs 表。
    """

    def __init__(self):
        self._active_ocr: Set[str] = set()
        self._active_meta: Set[str] = set()
        self._active_ehr: Set[str] = set()       # 用 job_id 而非 doc_id
        self._active_mat: Set[str] = set()       # 用 job_id 而非 doc_id
        self._lock = threading.Lock()
        self._default_schema_id: Optional[str] = None

    def _count_active(self, pool: Set[str]) -> int:
        with self._lock:
            return len(pool)

    def _add_active(self, pool: Set[str], key: str) -> bool:
        with self._lock:
            if key in pool:
                return False
            pool.add(key)
            return True

    def _remove_active(self, pool: Set[str], key: str):
        with self._lock:
            pool.discard(key)

    def _run_in_thread(self, pool: Set[str], key: str, fn, *args):
        """在线程中执行任务，完成后移出活跃池"""
        def wrapper():
            try:
                fn(*args)
            finally:
                self._remove_active(pool, key)
        t = threading.Thread(target=wrapper, daemon=True)
        t.start()

    def _get_schema_id(self, conn: sqlite3.Connection) -> Optional[str]:
        """缓存默认 schema id"""
        if self._default_schema_id is None:
            self._default_schema_id = _get_default_schema_id(conn)
        return self._default_schema_id

    def tick(self):
        """单次轮询"""
        with _connect() as conn:
            # ── 阶段 1: OCR ──
            if self._count_active(self._active_ocr) < MAX_CONCURRENT_OCR:
                rows = conn.execute("""
                    SELECT id FROM documents
                    WHERE status = 'ocr_pending'
                      AND object_key IS NOT NULL
                      AND object_key != ''
                    ORDER BY created_at ASC
                    LIMIT ?
                """, (MAX_CONCURRENT_OCR - self._count_active(self._active_ocr),)).fetchall()

                for row in rows:
                    doc_id = row["id"]
                    if not self._add_active(self._active_ocr, doc_id):
                        continue
                    logger.info("[TICK] 派发 OCR: %s", doc_id)
                    self._run_in_thread(self._active_ocr, doc_id, dispatch_ocr, doc_id)

            # ── 阶段 2: Metadata 抽取 ──
            if self._count_active(self._active_meta) < MAX_CONCURRENT_META:
                rows = conn.execute("""
                    SELECT id FROM documents
                    WHERE raw_text IS NOT NULL
                      AND raw_text != ''
                      AND meta_status = 'pending'
                      AND status NOT IN ('pending_upload', 'deleted')
                    ORDER BY created_at ASC
                    LIMIT ?
                """, (MAX_CONCURRENT_META - self._count_active(self._active_meta),)).fetchall()

                for row in rows:
                    doc_id = row["id"]
                    if not self._add_active(self._active_meta, doc_id):
                        continue
                    # CAS: pending → running
                    if _cas_update(conn, doc_id, "meta_status", "pending", "running",
                                   {"meta_started_at": _now_iso()}):
                        logger.info("[TICK] 派发 Metadata 抽取: %s", doc_id)
                        self._run_in_thread(self._active_meta, doc_id, dispatch_metadata, doc_id)
                    else:
                        self._remove_active(self._active_meta, doc_id)

            # ── 阶段 3: 自动创建 extract jobs + 派发 ──
            schema_id = self._get_schema_id(conn)
            if schema_id:
                # 3a: 为无 job 的文档补建 extract job
                _ensure_extract_jobs_for_pending_docs(conn, schema_id)

                # 3b: 派发 pending extract jobs
                if self._count_active(self._active_ehr) < MAX_CONCURRENT_EHR:
                    now = _now_iso()
                    rows = conn.execute("""
                        SELECT id, document_id
                        FROM ehr_extraction_jobs
                        WHERE status = 'pending'
                          AND job_type = 'extract'
                          AND (next_retry_at IS NULL OR next_retry_at <= ?)
                        ORDER BY created_at ASC
                        LIMIT ?
                    """, (now, MAX_CONCURRENT_EHR - self._count_active(self._active_ehr))).fetchall()

                    for row in rows:
                        job_id = row["id"]
                        if not self._add_active(self._active_ehr, job_id):
                            continue
                        logger.info("[TICK] 派发 EHR 抽取: job=%s (doc=%s)", job_id, row["document_id"])
                        self._run_in_thread(self._active_ehr, job_id, dispatch_ehr_extract_job, job_id)

                # ── 阶段 4: 自动创建 materialize jobs + 派发 ──
                # 4a: 为已归档文档补建 materialize job
                _ensure_materialize_jobs_for_archived_docs(conn, schema_id)

                # 4b: 派发 pending materialize jobs
                if self._count_active(self._active_mat) < MAX_CONCURRENT_MATERIALIZE:
                    now = _now_iso()
                    rows = conn.execute("""
                        SELECT id, document_id
                        FROM ehr_extraction_jobs
                        WHERE status = 'pending'
                          AND job_type = 'materialize'
                          AND (next_retry_at IS NULL OR next_retry_at <= ?)
                        ORDER BY created_at ASC
                        LIMIT ?
                    """, (now, MAX_CONCURRENT_MATERIALIZE - self._count_active(self._active_mat))).fetchall()

                    for row in rows:
                        job_id = row["id"]
                        if not self._add_active(self._active_mat, job_id):
                            continue
                        logger.info("[TICK] 派发 EHR 物化: job=%s (doc=%s)", job_id, row["document_id"])
                        self._run_in_thread(self._active_mat, job_id, dispatch_materialize_job, job_id)

    def run_forever(self):
        """主循环"""
        logger.info("═════════════════════════════════════════════════")
        logger.info(" Pipeline Daemon 启动 (Job-based)")
        logger.info("  DB:           %s", DB_PATH)
        logger.info("  轮询间隔:     %ss", POLL_INTERVAL_SECONDS)
        logger.info("  Prefect OCR:  %s", "启用" if USE_PREFECT_FOR_OCR else "禁用 (直接 subprocess)")
        logger.info("  并发限制:     OCR=%s META=%s EHR=%s MAT=%s",
                     MAX_CONCURRENT_OCR, MAX_CONCURRENT_META, MAX_CONCURRENT_EHR, MAX_CONCURRENT_MATERIALIZE)
        logger.info("  最大重试:     %s", MAX_RETRIES)
        logger.info("═════════════════════════════════════════════════")

        while True:
            try:
                self.tick()
            except Exception as e:
                logger.error("[TICK] 轮询异常: %s", e, exc_info=True)
            time.sleep(POLL_INTERVAL_SECONDS)


# ═════════════════════════════════════════════════════════════════════════════
# 入口
# ═════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    daemon = PipelineDaemon()
    try:
        daemon.run_forever()
    except KeyboardInterrupt:
        logger.info("Pipeline Daemon 收到中断信号，退出")

