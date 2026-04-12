import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// DB 文件放在 backend/eacy.db（与 src/ 同级）
const DB_PATH = path.join(__dirname, '..', 'eacy.db')

const db = new Database(DB_PATH)

// WAL 模式提升并发读性能
db.pragma('journal_mode = WAL')

// 确保表存在（幂等）
db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id           TEXT PRIMARY KEY,
    patient_id   TEXT NULL,
    file_name    TEXT NOT NULL,
    file_size    INTEGER NOT NULL,
    mime_type    TEXT NOT NULL,
    object_key   TEXT NOT NULL,
    status       TEXT NOT NULL,
    batch_id     TEXT NULL,
    doc_type     TEXT NULL,
    doc_title    TEXT NULL,
    effective_at TEXT NULL,
    metadata     TEXT NOT NULL DEFAULT '{}',
    raw_text       TEXT NULL,
    error_message  TEXT NULL,
    created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_documents_patient_id ON documents(patient_id);
  CREATE INDEX IF NOT EXISTS idx_documents_status     ON documents(status);
  CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);

  CREATE TABLE IF NOT EXISTS patients (
    id         TEXT PRIMARY KEY,
    name       TEXT NULL,
    metadata   TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`)

// 安全迁移：为已有 documents 表添加 error_message 字段
try {
  db.exec(`ALTER TABLE documents ADD COLUMN error_message TEXT NULL`)
} catch {}

try {
  db.exec(`ALTER TABLE documents ADD COLUMN batch_id TEXT NULL`)
} catch {}

db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_batch_id ON documents(batch_id);`)

export default db
