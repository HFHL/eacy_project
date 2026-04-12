"""
test_e2e.py — 端到端测试：上传文件到 OSS → 创建文档记录 → 跑 OCR flow
"""

import os
import sys
import sqlite3
from dotenv import load_dotenv

load_dotenv()

import oss2
from flow_ocr import ocr_process

DB_PATH = os.getenv("SQLITE_DB_PATH", "../backend/eacy.db")

# ─── 上传本地文件到 OSS ──────────────────────────────────────────────────────

def upload_to_oss(local_path: str, object_key: str):
    auth = oss2.Auth(
        os.environ["OSS_ACCESS_KEY_ID"],
        os.environ["OSS_ACCESS_KEY_SECRET"],
    )
    bucket = oss2.Bucket(auth, os.environ["OSS_ENDPOINT"], os.environ["OSS_BUCKET_NAME"])
    print(f"[oss] 上传 {local_path} → {object_key}")
    bucket.put_object_from_file(object_key, local_path)
    print("[oss] 上传完成 ✅")


# ─── Main ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import random
    test_dir = os.path.join(os.path.dirname(__file__), "..", "test_files", "病历三")
    pdf_files = [f for f in os.listdir(test_dir) if f.endswith(".pdf")]
    test_file = random.choice(pdf_files)
    local_path = os.path.join(test_dir, test_file)

    if not os.path.exists(local_path):
        print(f"❌ 测试文件不存在: {local_path}")
        sys.exit(1)

    # 随机 document_id
    import uuid
    doc_id = str(uuid.uuid4())
    object_key = f"uploads/{doc_id}/{test_file}"
    file_size = os.path.getsize(local_path)

    print(f"\n📄 测试文件: {test_file} ({file_size / 1024:.1f} KB)")
    print(f"📝 文档 ID: {doc_id}")
    print()

    # Step 1: 上传到 OSS
    upload_to_oss(local_path, object_key)

    # Step 2: 在数据库创建记录
    conn = sqlite3.connect(DB_PATH)
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    conn.execute(
        """INSERT INTO documents (id, file_name, file_size, mime_type, object_key, status, metadata, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'ocr_pending', '{}', ?, ?)""",
        (doc_id, test_file, file_size, "application/pdf", object_key, now, now),
    )
    conn.commit()
    conn.close()
    print(f"[db] 文档记录已创建, status=ocr_pending ✅\n")

    # Step 3: 运行 OCR flow
    print("=" * 60)
    print("🚀 开始运行 OCR Flow ...")
    print("=" * 60)
    ocr_process(doc_id)

    # Step 4: 检查结果
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    row = dict(conn.execute("SELECT id, file_name, status, raw_text, error_message FROM documents WHERE id = ?", (doc_id,)).fetchone())
    conn.close()

    print()
    print("=" * 60)
    print("📊 最终结果")
    print("=" * 60)
    print(f"  状态: {row['status']}")
    if row['status'] == 'ocr_succeeded':
        text = row['raw_text'] or ''
        print(f"  文本长度: {len(text)} 字符")
        print(f"  前 200 字符:")
        print(f"  {text[:200]}...")
    elif row['error_message']:
        print(f"  错误: {row['error_message']}")
