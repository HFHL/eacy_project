#!/usr/bin/env python3
"""
Pipeline Daemon — 后台轮询守护进程

仅负责：
  1. OCR：status = ocr_pending 且有 object_key
  2. Metadata 抽取：OCR 完成（raw_text 非空）且 meta_status = pending

特性：
  - 通过 CAS 更新保证幂等性（UPDATE ... WHERE status = 'pending'）
  - 并发控制：每阶段限制最大并行数
  - OCR 可选 Prefect Deployment，否则直接 subprocess 执行 flow_ocr
"""

from __future__ import annotations

import json
import logging
import sqlite3
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Set

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
    PREFECT_API_URL,
    PREFECT_OCR_DEPLOYMENT_ID,
    USE_PREFECT_FOR_OCR,
    POLL_INTERVAL_SECONDS,
    MAX_CONCURRENT_OCR,
    MAX_CONCURRENT_META,
)

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("pipeline-daemon")

# Prefect 触发连续失败后，本会话内改走 subprocess，避免每个 TICK 都打无效 API
_prefect_ocr_disabled: bool = False


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

def _trigger_ocr_via_prefect(doc_id: str) -> bool:
    """通过 Prefect API 触发 OCR flow run。成功返回 True。"""
    import urllib.error
    import urllib.request

    url = f"{PREFECT_API_URL.rstrip('/')}/deployments/{PREFECT_OCR_DEPLOYMENT_ID}/create_flow_run"
    payload = json.dumps({"parameters": {"document_id": doc_id}}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            logger.info("[OCR] Prefect flow run 已创建: %s → %s", doc_id, data.get("id"))
        return True
    except urllib.error.HTTPError as e:
        hint = ""
        if e.code == 404:
            hint = "（404：Deployment 不存在或 ID 过期，请核对 Prefect UI 或注释掉 .env 中 PREFECT_OCR_DEPLOYMENT_ID）"
        logger.error("[OCR] Prefect 触发失败: %s → HTTP %s %s", doc_id, e.code, hint)
        return False
    except Exception as e:
        logger.error("[OCR] Prefect 触发失败: %s → %s", doc_id, e)
        return False


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
    """派发 OCR 任务：优先 Prefect；失败则 subprocess（与未配置 deployment 时行为一致）。"""
    global _prefect_ocr_disabled
    if USE_PREFECT_FOR_OCR and not _prefect_ocr_disabled:
        if _trigger_ocr_via_prefect(doc_id):
            return
        _prefect_ocr_disabled = True
        logger.warning(
            "[OCR] Prefect 不可用，本 daemon 进程内后续 OCR 将直接使用 subprocess；"
            "修复后请重启 daemon 以重新尝试 Prefect。"
        )
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


# ═══════════════════════════════════════════════════════════════════════════════
# 核心守护循环
# ═══════════════════════════════════════════════════════════════════════════════

class PipelineDaemon:
    """
    后台轮询守护进程：仅 OCR + Metadata 抽取。
    """

    def __init__(self):
        self._active_ocr: Set[str] = set()
        self._active_meta: Set[str] = set()
        self._lock = threading.Lock()

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

    def run_forever(self):
        """主循环"""
        logger.info("═════════════════════════════════════════════════")
        logger.info(" Pipeline Daemon 启动 (仅 OCR + Metadata)")
        logger.info("  DB:           %s", DB_PATH)
        logger.info("  轮询间隔:     %ss", POLL_INTERVAL_SECONDS)
        logger.info("  Prefect OCR:  %s", "启用" if USE_PREFECT_FOR_OCR else "禁用 (直接 subprocess)")
        logger.info("  并发限制:     OCR=%s META=%s", MAX_CONCURRENT_OCR, MAX_CONCURRENT_META)
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
