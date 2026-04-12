/**
 * 从仓库根目录 schemas_export.csv 导入一条（或多条）schemas 记录到 backend/eacy.db
 * 用法：node scripts/importSchemasFromCsv.mjs
 */
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import Database from 'better-sqlite3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const Papa = require(path.join(__dirname, '../../frontend/node_modules/papaparse/papaparse.js'))

const csvPath = path.join(__dirname, '../../schemas_export.csv')
const dbPath = path.join(__dirname, '../eacy.db')

if (!existsSync(csvPath)) {
  console.error('找不到 CSV:', csvPath)
  process.exit(1)
}
if (!existsSync(dbPath)) {
  console.error('找不到数据库:', dbPath)
  process.exit(1)
}

const csv = readFileSync(csvPath, 'utf8')
const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true })
if (parsed.errors?.length) {
  console.error('CSV 解析错误:', parsed.errors)
  process.exit(1)
}

const rows = parsed.data.filter((r) => r && String(r.id || '').trim())
if (!rows.length) {
  console.error('CSV 中没有有效数据行')
  process.exit(1)
}

const db = new Database(dbPath)
const stmt = db.prepare(`
  INSERT OR REPLACE INTO schemas (id, name, code, schema_type, version, content_json, is_active, created_at, updated_at)
  VALUES (@id, @name, @code, @schema_type, @version, @content_json, @is_active, @created_at, @updated_at)
`)

const now = new Date().toISOString()
for (const row of rows) {
  stmt.run({
    id: String(row.id).trim(),
    name: String(row.name ?? '').trim() || row.code || '未命名',
    code: String(row.code ?? '').trim(),
    schema_type: String(row.schema_type ?? 'ehr').trim() || 'ehr',
    version: Number.parseInt(String(row.version ?? '1'), 10) || 1,
    content_json: String(row.content_json ?? '{}'),
    is_active: row.is_active === '' || row.is_active === undefined || Number(row.is_active) !== 0 ? 1 : 0,
    created_at: String(row.created_at || '').trim() || now,
    updated_at: String(row.updated_at || '').trim() || now,
  })
  console.log('已写入 schemas:', row.id, row.code)
}

db.close()
console.log('完成，共', rows.length, '条')
