import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import { readFileSync, existsSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// DB 文件放在 backend/eacy.db（与 src/ 同级）
const DB_PATH = path.join(__dirname, '..', 'eacy.db')
const SCHEMA_PATH = path.join(__dirname, '..', '..', 'database_schema.sql')

const db = new Database(DB_PATH)

// WAL 模式提升并发读性能
db.pragma('journal_mode = WAL')

/** 空库时一次性执行根目录 database_schema.sql（与 npm run db:init 同源） */
function applyMainSchemaIfEmpty() {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
    )
    .get() as { n: number }
  if (row.n > 0) return
  if (!existsSync(SCHEMA_PATH)) {
    console.error('[db] 缺少 database_schema.sql:', SCHEMA_PATH)
    return
  }
  db.pragma('foreign_keys = ON')
  const sql = readFileSync(SCHEMA_PATH, 'utf8')
  db.exec(sql)
}

applyMainSchemaIfEmpty()

// 安全迁移：旧库增量补列（忽略已存在）
const legacyAlters = [
  `ALTER TABLE documents ADD COLUMN error_message TEXT NULL`,
  `ALTER TABLE documents ADD COLUMN batch_id TEXT NULL`,
  `ALTER TABLE documents ADD COLUMN mime_type TEXT`,
  `ALTER TABLE documents ADD COLUMN object_key TEXT`,
  `ALTER TABLE documents ADD COLUMN meta_status TEXT DEFAULT 'pending'`,
  `ALTER TABLE documents ADD COLUMN meta_error_message TEXT`,
  `ALTER TABLE documents ADD COLUMN meta_started_at TEXT`,
  `ALTER TABLE documents ADD COLUMN meta_completed_at TEXT`,
  `ALTER TABLE documents ADD COLUMN materialize_status TEXT DEFAULT 'pending'`,
  `ALTER TABLE documents ADD COLUMN materialize_at TEXT`,
  `ALTER TABLE documents ADD COLUMN materialize_error TEXT`,
  `ALTER TABLE documents ADD COLUMN meta_task_id TEXT`,
  `ALTER TABLE documents ADD COLUMN ocr_payload TEXT`,
  `ALTER TABLE documents ADD COLUMN created_at TEXT`,
  `ALTER TABLE documents ADD COLUMN updated_at TEXT`,
  `ALTER TABLE patients ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'`,
]
for (const stmt of legacyAlters) {
  try {
    db.exec(stmt)
  } catch {
    /* 列已存在或非旧版库 */
  }
}

// 旧库补列后，用 uploaded_at 回填缺失的 created_at / updated_at
try {
  db.exec(`
    UPDATE documents
    SET created_at = COALESCE(NULLIF(created_at, ''), uploaded_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at = COALESCE(NULLIF(updated_at, ''), uploaded_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    WHERE created_at IS NULL OR updated_at IS NULL OR created_at = '' OR updated_at = ''
  `)
} catch {
  /* 无表或无 uploaded_at */
}

db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_batch_id ON documents(batch_id);`)

// 科研项目：旧库若早于 projects 设计，增量建表（与 database_schema.sql 一致；不含外键重建）
const projectBootstrap = [
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    project_name TEXT NOT NULL,
    description TEXT,
    principal_investigator_name TEXT,
    schema_id TEXT NOT NULL REFERENCES schemas(id),
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_projects_schema_id ON projects(schema_id)`,
  `CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status)`,
  `CREATE TABLE IF NOT EXISTS project_patients (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    enrolled_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    subject_label TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    UNIQUE (project_id, patient_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_project_patients_project ON project_patients(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_project_patients_patient ON project_patients(patient_id)`,
]
for (const stmt of projectBootstrap) {
  try {
    db.exec(stmt)
  } catch {
    /* 无 schemas/patients 等依赖表时跳过 */
  }
}

export default db
