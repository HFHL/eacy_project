/**
 * Seed script: Insert EHR schema + instance + field_value_selected data
 * for the existing patient in the database.
 * 
 * Run: node backend/sql/003_seed_ehr_data.mjs
 */
import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, '..', 'eacy.db')
const SCHEMA_PATH = join(__dirname, '..', '..', 'frontend', 'src', 'data', 'patient_ehr-V2.schema.json')
const MOCK_DATA_PATH = join(__dirname, '..', '..', 'frontend', 'src', 'data', 'mockPatientData.json')

const db = new Database(DB_PATH, { verbose: console.log })
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ── Read source files ──────────────────────────────────────────
const schemaJson = readFileSync(SCHEMA_PATH, 'utf-8')
const mockData = JSON.parse(readFileSync(MOCK_DATA_PATH, 'utf-8'))

// ── Find existing patient ──────────────────────────────────────
const patient = db.prepare('SELECT id, name FROM patients LIMIT 1').get()
if (!patient) {
  console.error('❌ No patient found in database')
  process.exit(1)
}
console.log(`\n✅ Found patient: ${patient.name} (${patient.id})\n`)

const PATIENT_ID = patient.id

// ── IDs ────────────────────────────────────────────────────────
const SCHEMA_ID = randomUUID()
const INSTANCE_ID = randomUUID()

// ── Transaction ────────────────────────────────────────────────
const seed = db.transaction(() => {
  // 1. Insert schema template
  console.log('📝 Inserting schema template...')
  db.prepare(`
    INSERT INTO schemas (id, name, code, schema_type, version, content_json, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    SCHEMA_ID,
    '肿瘤患者标准电子病历夹 V2',
    'patient_ehr_v2',
    'ehr',
    1,
    schemaJson,
    1
  )
  console.log(`   ✅ Schema: ${SCHEMA_ID}`)

  // 2. Insert schema instance
  console.log('📝 Inserting schema instance...')
  db.prepare(`
    INSERT INTO schema_instances (id, schema_id, patient_id, instance_type, name, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    INSTANCE_ID,
    SCHEMA_ID,
    PATIENT_ID,
    'patient_ehr',
    `${patient.name}的电子病历夹`,
    'in_progress'
  )
  console.log(`   ✅ Instance: ${INSTANCE_ID}`)

  // 3. Flatten mockPatientData and insert field_value_selected + field_value_candidates
  console.log('📝 Inserting field values...')

  const insertCandidate = db.prepare(`
    INSERT INTO field_value_candidates
      (id, instance_id, field_path, value_json, value_type, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  const insertSelected = db.prepare(`
    INSERT INTO field_value_selected
      (id, instance_id, field_path, selected_candidate_id, selected_value_json, selected_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  let fieldCount = 0

  /**
   * Recursively flatten the mockPatientData into field paths.
   * For leaf values (string, number, boolean, null), store directly.
   * For arrays and objects at leaf level, store as JSON.
   */
  function flattenAndInsert(obj, pathParts = []) {
    if (obj === null || obj === undefined) return

    if (Array.isArray(obj)) {
      // Store array as a single JSON value at this path
      const fieldPath = '/' + pathParts.join('/')
      const valueJson = JSON.stringify(obj)
      const candidateId = randomUUID()
      const selectedId = randomUUID()

      insertCandidate.run(candidateId, INSTANCE_ID, fieldPath, valueJson, 'array', 'system')
      insertSelected.run(selectedId, INSTANCE_ID, fieldPath, candidateId, valueJson, 'system')
      fieldCount++
      return
    }

    if (typeof obj === 'object') {
      // Check if this object has any non-object children (leaf object)
      const keys = Object.keys(obj)
      for (const key of keys) {
        flattenAndInsert(obj[key], [...pathParts, key])
      }
      return
    }

    // Leaf value (string, number, boolean)
    const fieldPath = '/' + pathParts.join('/')
    const valueJson = JSON.stringify(obj)
    const valueType = typeof obj
    const candidateId = randomUUID()
    const selectedId = randomUUID()

    insertCandidate.run(candidateId, INSTANCE_ID, fieldPath, valueJson, valueType, 'system')
    insertSelected.run(selectedId, INSTANCE_ID, fieldPath, candidateId, valueJson, 'system')
    fieldCount++
  }

  flattenAndInsert(mockData)
  console.log(`   ✅ Inserted ${fieldCount} field values`)

  // 4. Add some extra candidates for a few fields to demonstrate multi-candidate
  console.log('📝 Adding extra candidates for demo...')

  const demoFields = [
    { path: '/基本信息/人口学情况/身份信息/患者姓名', value: '"陆梦涵"', type: 'string', source: '出院小结' },
    { path: '/基本信息/人口学情况/身份信息/患者姓名', value: '"陆梦涵test"', type: 'string', source: '入院记录' },
    { path: '/基本信息/人口学情况/身份信息/性别', value: '"女"', type: 'string', source: '出院小结' },
    { path: '/基本信息/人口学情况/身份信息/年龄', value: '12', type: 'number', source: '出院小结' },
    { path: '/基本信息/人口学情况/身份信息/年龄', value: '11', type: 'number', source: '入院记录（旧）' },
  ]

  for (const demo of demoFields) {
    const id = randomUUID()
    db.prepare(`
      INSERT INTO field_value_candidates
        (id, instance_id, field_path, value_json, value_type, source_text, confidence, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, INSTANCE_ID, demo.path, demo.value, demo.type, `来源：${demo.source}`, 0.85, 'ai')
  }
  console.log(`   ✅ Added ${demoFields.length} extra candidates`)
})

seed()

// Verify
const schemaCount = db.prepare('SELECT COUNT(*) as c FROM schemas').get()
const instanceCount = db.prepare('SELECT COUNT(*) as c FROM schema_instances').get()
const candidateCount = db.prepare('SELECT COUNT(*) as c FROM field_value_candidates').get()
const selectedCount = db.prepare('SELECT COUNT(*) as c FROM field_value_selected').get()

console.log('\n📊 Final counts:')
console.log(`   schemas:              ${schemaCount.c}`)
console.log(`   schema_instances:     ${instanceCount.c}`)
console.log(`   field_value_candidates: ${candidateCount.c}`)
console.log(`   field_value_selected:   ${selectedCount.c}`)
console.log('\n✅ Seed complete!')

db.close()
