"""
一次性 migration：给 documents 表增加 extract_* 列。
运行方式: python migrate_add_extract_columns.py
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "backend" / "eacy.db"

COLUMNS = [
    ("extract_status",        "TEXT DEFAULT 'pending'"),
    ("extract_task_id",       "TEXT"),
    ("extract_result_json",   "TEXT"),
    ("extract_started_at",    "TEXT"),
    ("extract_completed_at",  "TEXT"),
    ("extract_error_message", "TEXT"),
]


def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # 获取现有列名
    cur.execute("PRAGMA table_info(documents)")
    existing = {row[1] for row in cur.fetchall()}

    added = []
    for col_name, col_def in COLUMNS:
        if col_name in existing:
            print(f"  ✓ 列 {col_name} 已存在，跳过")
            continue
        sql = f"ALTER TABLE documents ADD COLUMN {col_name} {col_def}"
        cur.execute(sql)
        added.append(col_name)
        print(f"  + 新增列 {col_name}")

    if added:
        conn.commit()
        print(f"\n✅ 成功新增 {len(added)} 列: {', '.join(added)}")
    else:
        print("\n✅ 所有列均已存在，无需变更")

    conn.close()


if __name__ == "__main__":
    main()
