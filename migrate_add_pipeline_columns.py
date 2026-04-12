"""
一次性 migration：给 documents 表增加 meta_status / materialize_status 列。
运行方式: python migrate_add_pipeline_columns.py

背景：
- meta_status 独立追踪元数据抽取状态，不再复用 status 字段
- materialize_status 追踪 EHR 物化到病历夹实例的状态
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "backend" / "eacy.db"

COLUMNS = [
    ("meta_status",        "TEXT DEFAULT 'pending'"),
    ("meta_task_id",       "TEXT"),
    ("meta_started_at",    "TEXT"),
    ("meta_completed_at",  "TEXT"),
    ("meta_error_message", "TEXT"),
    ("materialize_status", "TEXT DEFAULT 'pending'"),
    ("materialize_error",  "TEXT"),
    ("materialize_at",     "TEXT"),
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

    # 回填现有数据：
    # 已经有 metadata 且非空的文档 → meta_status = 'completed'
    cur.execute("""
        UPDATE documents
        SET meta_status = 'completed'
        WHERE metadata IS NOT NULL
          AND metadata != '{}'
          AND metadata != ''
          AND meta_status = 'pending'
    """)

    # status = 'METADATA_RUNNING' → meta_status = 'running'
    cur.execute("""
        UPDATE documents SET meta_status = 'running'
        WHERE status = 'METADATA_RUNNING' AND meta_status = 'pending'
    """)

    # status = 'METADATA_FAILED' → meta_status = 'failed'
    cur.execute("""
        UPDATE documents SET meta_status = 'failed'
        WHERE status = 'METADATA_FAILED' AND meta_status = 'pending'
    """)

    # status = 'METADATA_SUCCEEDED' → meta_status = 'completed'
    cur.execute("""
        UPDATE documents SET meta_status = 'completed'
        WHERE status = 'METADATA_SUCCEEDED' AND meta_status = 'pending'
    """)

    # 已归档且 extract_status='completed' 的文档，检查是否已有 schema_instances
    # 暂时简单处理：如果 patient_id 非空且 extract_status = 'completed'
    #   → 检查 instance_documents 表
    try:
        cur.execute("""
            UPDATE documents
            SET materialize_status = 'completed'
            WHERE patient_id IS NOT NULL
              AND extract_status = 'completed'
              AND id IN (
                  SELECT d.id FROM documents d
                  JOIN instance_documents idoc ON idoc.document_id = d.id
              )
        """)
    except Exception:
        pass  # instance_documents 可能还不存在

    conn.commit()
    print("✅ 数据回填完成")
    conn.close()


if __name__ == "__main__":
    main()
