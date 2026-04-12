#!/usr/bin/env python3
"""
一次性 migration：新增 ehr_extraction_jobs 表。

功能：
- 创建 ehr_extraction_jobs 表 + 索引
- 从 documents 表的 extract_*/materialize_* 字段回填历史 job 记录

用法：
    python migrate_add_job_table.py [--db-path backend/eacy.db]
"""

import argparse
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
DEFAULT_DB = ROOT_DIR / "backend" / "eacy.db"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


DDL = """
CREATE TABLE IF NOT EXISTS ehr_extraction_jobs (
  id                       TEXT PRIMARY KEY,
  document_id              TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  patient_id               TEXT REFERENCES patients(id) ON DELETE SET NULL,
  schema_id                TEXT NOT NULL,
  job_type                 TEXT NOT NULL DEFAULT 'extract',   -- 'extract' | 'materialize'
  status                   TEXT NOT NULL DEFAULT 'pending',   -- pending | running | completed | failed
  attempt_count            INTEGER NOT NULL DEFAULT 0,
  max_attempts             INTEGER NOT NULL DEFAULT 3,
  next_retry_at            TEXT,
  started_at               TEXT,
  completed_at             TEXT,
  last_error               TEXT,
  result_extraction_run_id TEXT,
  created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
"""

INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_ehr_jobs_status   ON ehr_extraction_jobs(status, job_type);",
    "CREATE INDEX IF NOT EXISTS idx_ehr_jobs_document ON ehr_extraction_jobs(document_id);",
    "CREATE INDEX IF NOT EXISTS idx_ehr_jobs_patient  ON ehr_extraction_jobs(patient_id);",
    "CREATE INDEX IF NOT EXISTS idx_ehr_jobs_retry    ON ehr_extraction_jobs(status, next_retry_at);",
]

# 部分唯一索引：防止同一文档+schema+类型的重复活跃任务
PARTIAL_UNIQUE_INDEX = """
CREATE UNIQUE INDEX IF NOT EXISTS uq_ehr_jobs_active
  ON ehr_extraction_jobs(document_id, schema_id, job_type)
  WHERE status IN ('pending', 'running');
"""


def migrate(db_path: Path) -> None:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")

    print(f"[MIGRATE] 数据库: {db_path}")

    # ── 1. 建表 ──
    conn.executescript(DDL)
    for idx_sql in INDEXES:
        conn.execute(idx_sql)
    conn.execute(PARTIAL_UNIQUE_INDEX)
    conn.commit()
    print("[MIGRATE] ehr_extraction_jobs 表 + 索引创建完成")

    # ── 2. 检查是否已有数据（幂等） ──
    existing = conn.execute("SELECT COUNT(*) AS cnt FROM ehr_extraction_jobs").fetchone()["cnt"]
    if existing > 0:
        print(f"[MIGRATE] 已有 {existing} 条 job 记录，跳过回填")
        conn.close()
        return

    # ── 3. 回填历史 extract jobs ──
    # 查找 schemas 表中 patient_ehr_v2 的 id
    schema_row = conn.execute(
        "SELECT id FROM schemas WHERE code = 'patient_ehr_v2' AND is_active = 1 ORDER BY version DESC LIMIT 1"
    ).fetchone()
    if not schema_row:
        print("[MIGRATE] 未找到 patient_ehr_v2 schema，跳过回填")
        conn.close()
        return

    schema_id = schema_row["id"]
    now = _now_iso()

    # 回填 extract jobs
    rows = conn.execute("""
        SELECT id, patient_id, extract_status, extract_started_at,
               extract_completed_at, extract_error_message
        FROM documents
        WHERE extract_status IS NOT NULL AND extract_status != 'pending'
    """).fetchall()

    extract_count = 0
    for row in rows:
        status_map = {"running": "running", "completed": "completed", "failed": "failed"}
        status = status_map.get(row["extract_status"], "pending")
        conn.execute("""
            INSERT INTO ehr_extraction_jobs
                (id, document_id, patient_id, schema_id, job_type, status,
                 attempt_count, max_attempts, started_at, completed_at,
                 last_error, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'extract', ?, ?, 3, ?, ?, ?, ?, ?)
        """, (
            _new_id("job"),
            row["id"],
            row["patient_id"],
            schema_id,
            status,
            1 if status in ("completed", "failed") else 0,
            row["extract_started_at"],
            row["extract_completed_at"],
            row["extract_error_message"],
            now,
            now,
        ))
        extract_count += 1

    # 回填 materialize jobs
    mat_rows = conn.execute("""
        SELECT id, patient_id
        FROM documents
        WHERE materialize_status = 'completed'
          AND patient_id IS NOT NULL
    """).fetchall()

    mat_count = 0
    for row in mat_rows:
        conn.execute("""
            INSERT INTO ehr_extraction_jobs
                (id, document_id, patient_id, schema_id, job_type, status,
                 attempt_count, max_attempts, completed_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'materialize', 'completed', 1, 3, ?, ?, ?)
        """, (
            _new_id("job"),
            row["id"],
            row["patient_id"],
            schema_id,
            now,
            now,
            now,
        ))
        mat_count += 1

    conn.commit()
    print(f"[MIGRATE] 回填完成: {extract_count} extract jobs, {mat_count} materialize jobs")
    conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Add ehr_extraction_jobs table")
    parser.add_argument("--db-path", type=Path, default=DEFAULT_DB)
    args = parser.parse_args()
    migrate(args.db_path)
