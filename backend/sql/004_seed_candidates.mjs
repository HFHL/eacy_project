/**
 * Seed extra candidates for demo: insert rich historical candidates
 * for several fields to show modification history in the UI.
 * 
 * Run: node backend/sql/004_seed_candidates.mjs
 */
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, '..', 'eacy.db')

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Find instance
const instance = db.prepare(`
  SELECT si.id as instance_id, si.patient_id
  FROM schema_instances si
  WHERE si.instance_type = 'patient_ehr'
  ORDER BY si.created_at DESC LIMIT 1
`).get()

if (!instance) {
  console.error('❌ No schema instance found')
  process.exit(1)
}
console.log(`✅ Instance: ${instance.instance_id}`)

// Find some documents to use as source references
const docs = db.prepare(`SELECT id, file_name FROM documents LIMIT 5`).all()
const docIds = docs.map(d => d.id)
const docNames = docs.map(d => d.file_name)

const insertCandidate = db.prepare(`
  INSERT INTO field_value_candidates
    (id, instance_id, field_path, value_json, value_type, 
     source_document_id, source_page, source_text, confidence, created_by, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

// Rich candidate data for several fields
const candidates = [
  // ── 患者姓名: 3 candidates from different docs ──
  {
    field: '/基本信息/人口学情况/身份信息/患者姓名',
    values: [
      { value: '"张三"', type: 'string', doc: 0, page: 1, text: '姓名：张三', conf: 0.95, by: 'ai', time: '2024-06-15T10:00:00Z' },
      { value: '"张三"', type: 'string', doc: 1, page: 1, text: '患者 张三 男 40岁', conf: 0.92, by: 'ai', time: '2024-06-15T11:30:00Z' },
      { value: '"张叁"', type: 'string', doc: 2, page: 2, text: '张叁（OCR识别可能有误）', conf: 0.65, by: 'ai', time: '2024-06-16T09:00:00Z' },
    ]
  },
  // ── 性别: 2 candidates ──
  {
    field: '/基本信息/人口学情况/身份信息/性别',
    values: [
      { value: '"男"', type: 'string', doc: 0, page: 1, text: '性别：男', conf: 0.98, by: 'ai', time: '2024-06-15T10:00:00Z' },
      { value: '"男"', type: 'string', doc: 1, page: 1, text: '男性患者', conf: 0.90, by: 'ai', time: '2024-06-15T11:30:00Z' },
    ]
  },
  // ── 出生日期: 3 candidates with conflict ──
  {
    field: '/基本信息/人口学情况/身份信息/出生日期',
    values: [
      { value: '"1985-03-15"', type: 'string', doc: 0, page: 1, text: '出生日期：1985年3月15日', conf: 0.95, by: 'ai', time: '2024-06-15T10:00:00Z' },
      { value: '"1985-03-15"', type: 'string', doc: 2, page: 1, text: '1985.3.15出生', conf: 0.88, by: 'ai', time: '2024-06-16T09:00:00Z' },
      { value: '"1985-03-05"', type: 'string', doc: 1, page: 2, text: '出生日期 1985-03-05（可能OCR误识别）', conf: 0.60, by: 'ai', time: '2024-06-15T14:00:00Z' },
    ]
  },
  // ── 年龄: 2 candidates ──
  {
    field: '/基本信息/人口学情况/身份信息/年龄',
    values: [
      { value: '40', type: 'number', doc: 0, page: 1, text: '年龄40岁', conf: 0.95, by: 'ai', time: '2024-06-15T10:00:00Z' },
      { value: '39', type: 'number', doc: 1, page: 1, text: '39岁男性（入院时）', conf: 0.80, by: 'ai', time: '2024-06-15T11:30:00Z' },
    ]
  },
  // ── 婚姻状况: 2 candidates ──
  {
    field: '/基本信息/人口学情况/人口统计学/婚姻状况',
    values: [
      { value: '"已婚"', type: 'string', doc: 0, page: 1, text: '婚姻状况：已婚', conf: 0.92, by: 'ai', time: '2024-06-15T10:05:00Z' },
      { value: '"已婚"', type: 'string', doc: 2, page: 1, text: '已婚', conf: 0.85, by: 'ai', time: '2024-06-16T09:05:00Z' },
    ]
  },
  // ── 过敏史: 3 candidates ──
  {
    field: '/既往情况及家族史/健康情况/过敏史/过敏源(食物或药物)',
    values: [
      { value: '"青霉素"', type: 'string', doc: 0, page: 2, text: '过敏史：青霉素过敏', conf: 0.95, by: 'ai', time: '2024-06-15T10:10:00Z' },
      { value: '"青霉素"', type: 'string', doc: 1, page: 1, text: '青霉素（+）', conf: 0.90, by: 'ai', time: '2024-06-15T11:40:00Z' },
      { value: '"青霉素、磺胺"', type: 'string', doc: 2, page: 3, text: '药物过敏：青霉素、磺胺类', conf: 0.75, by: 'ai', time: '2024-06-16T09:15:00Z' },
    ]
  },
  // ── 过敏反应 ──
  {
    field: '/既往情况及家族史/健康情况/过敏史/过敏反应',
    values: [
      { value: '"皮疹、瘙痒"', type: 'string', doc: 0, page: 2, text: '过敏反应：皮疹、瘙痒', conf: 0.90, by: 'ai', time: '2024-06-15T10:10:00Z' },
      { value: '"皮肤过敏反应"', type: 'string', doc: 1, page: 1, text: '皮肤过敏反应', conf: 0.70, by: 'ai', time: '2024-06-15T11:40:00Z' },
    ]
  },
  // ── 既往疾病 ──
  {
    field: '/既往情况及家族史/健康情况/既往史/既往疾病',
    values: [
      { value: '"高血压"', type: 'string', doc: 0, page: 2, text: '既往史：高血压病史6年', conf: 0.95, by: 'ai', time: '2024-06-15T10:12:00Z' },
      { value: '"高血压2级"', type: 'string', doc: 1, page: 1, text: '高血压2级', conf: 0.88, by: 'ai', time: '2024-06-15T11:45:00Z' },
      { value: '"高血压"', type: 'string', doc: 2, page: 2, text: '合并高血压', conf: 0.80, by: 'ai', time: '2024-06-16T09:20:00Z' },
      { value: '"高血压病"', type: 'string', doc: null, page: null, text: '用户手动修正', conf: null, by: 'user', time: '2024-06-17T15:30:00Z' },
    ]
  },
  // ── 吸烟状态 ──
  {
    field: '/既往情况及家族史/健康情况/吸烟史',
    values: [
      { value: '[{"是否吸烟":"是","吸烟状态":"已戒烟","开始日期":"2005-01-01","结束日期":"2020-06-01","频率":"10支/天","吸烟年":15}]', type: 'array', doc: 0, page: 3, text: '吸烟史：已戒烟，吸烟15年', conf: 0.90, by: 'ai', time: '2024-06-15T10:15:00Z' },
      { value: '[{"是否吸烟":"是","吸烟状态":"已戒烟","开始日期":"2005-01-01","结束日期":"2020-06-01","频率":"15支/天","吸烟年":15}]', type: 'array', doc: 1, page: 2, text: '吸烟15年 15支/天（与另一份不一致）', conf: 0.82, by: 'ai', time: '2024-06-15T11:50:00Z' },
    ]
  },
  // ── 诊断记录中的入院诊断 ──
  {
    field: '/诊断记录/诊断记录',
    values: [
      { value: '[{"入院诊断":{"主要诊断":"右肺上叶占位","次要诊断":"高血压病"},"入院日期":"2024-06-15","诊断机构":"北京协和医院"}]', type: 'array', doc: 0, page: 1, text: '入院诊断：右肺上叶占位', conf: 0.90, by: 'ai', time: '2024-06-15T10:20:00Z' },
      { value: '[{"入院诊断":{"主要诊断":"右肺上叶肺癌","次要诊断":"高血压病2级"},"出院诊断":{"主要诊断":"右肺上叶肺腺癌 pT2aN1M0 IIB期","次要诊断":"高血压病2级"},"入院日期":"2024-06-15","出院日期":"2024-07-02","诊断机构":"北京协和医院"}]', type: 'array', doc: 2, page: 1, text: '出院诊断完善后同步', conf: 0.95, by: 'ai', time: '2024-07-02T16:00:00Z' },
    ]
  },
]

const seed = db.transaction(() => {
  let total = 0
  for (const group of candidates) {
    for (const v of group.values) {
      const id = randomUUID()
      const docId = v.doc !== null && v.doc !== undefined && docIds[v.doc] ? docIds[v.doc] : null
      insertCandidate.run(
        id,
        instance.instance_id,
        group.field,
        v.value,
        v.type,
        docId,
        v.page,
        v.text,
        v.conf,
        v.by,
        v.time
      )
      total++
    }
  }
  console.log(`✅ Inserted ${total} rich candidates across ${candidates.length} fields`)
})

seed()

// Verify
const count = db.prepare('SELECT COUNT(*) as c FROM field_value_candidates WHERE instance_id = ?').get(instance.instance_id)
console.log(`📊 Total candidates for this instance: ${count.c}`)

db.close()
console.log('✅ Done!')
