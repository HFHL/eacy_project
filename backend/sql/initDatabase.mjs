/**
 * 从仓库根目录 database_schema.sql 重建 backend/eacy.db（会删除已有库文件）。
 * 使用 Node 内置 node:sqlite，不依赖 better-sqlite3（避免 workspace 下 ERR_MODULE_NOT_FOUND）。
 * 用法：npm run db:init -w backend
 * 要求：Node.js >= 22.5（需支持 node:sqlite）
 */
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, unlinkSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, '..', 'eacy.db')
const SCHEMA_PATH = join(__dirname, '..', '..', 'database_schema.sql')

for (const p of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
  if (existsSync(p)) {
    unlinkSync(p)
    console.log('已删除', p)
  }
}

if (!existsSync(SCHEMA_PATH)) {
  console.error('找不到 schema 文件:', SCHEMA_PATH)
  process.exit(1)
}

const sql = readFileSync(SCHEMA_PATH, 'utf8')
const db = new DatabaseSync(DB_PATH)
db.exec('PRAGMA foreign_keys = ON')
db.exec('PRAGMA journal_mode = WAL')
db.exec(sql)
db.close()

console.log('SQLite 已初始化:', DB_PATH)
