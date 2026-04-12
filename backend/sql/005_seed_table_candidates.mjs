/**
 * Seed rich candidates for array-type (table) fields:
 * 医疗事件标识符, 联系方式, 紧急联系人
 *
 * Demonstrates how whole-array candidates create row-level diff history.
 *
 * Run: node backend/sql/005_seed_table_candidates.mjs
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

const instance = db.prepare(`
  SELECT id FROM schema_instances WHERE instance_type = 'patient_ehr'
  ORDER BY created_at DESC LIMIT 1
`).get()
if (!instance) { console.error('❌ No instance'); process.exit(1) }

const docs = db.prepare('SELECT id, file_name FROM documents LIMIT 5').all()

const ins = db.prepare(`
  INSERT INTO field_value_candidates
    (id, instance_id, field_path, value_json, value_type,
     source_document_id, source_page, source_text, confidence, created_by, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const candidates = [
  // ═══════════════════════════════════════════
  // 医疗事件标识符 — 渐进式抽取历史
  // ═══════════════════════════════════════════
  {
    field: '/基本信息/人口学情况/医疗事件标识符',
    values: [
      // 第 1 次抽取：只拿到住院号
      {
        value: JSON.stringify([
          { "标识符类型": "住院号", "标识符编号": "ZY2024001234" }
        ]),
        type: 'array', doc: 0, page: 1,
        text: '住院号：ZY2024001234',
        conf: 0.95, by: 'ai', time: '2024-06-15T10:00:00Z'
      },
      // 第 2 次抽取：从另一份文档又拿到病案号，合并
      {
        value: JSON.stringify([
          { "标识符类型": "住院号", "标识符编号": "ZY2024001234" },
          { "标识符类型": "病案号", "标识符编号": "BA20240567" }
        ]),
        type: 'array', doc: 2, page: 1,
        text: '病案号：BA20240567',
        conf: 0.92, by: 'ai', time: '2024-06-16T09:00:00Z'
      },
      // 第 3 次抽取：有一份文档给了不同的住院号（冲突！）
      {
        value: JSON.stringify([
          { "标识符类型": "住院号", "标识符编号": "ZY2024001235" },
          { "标识符类型": "病案号", "标识符编号": "BA20240567" }
        ]),
        type: 'array', doc: 1, page: 2,
        text: '住院号：ZY2024001235（可能为复诊号）',
        conf: 0.70, by: 'ai', time: '2024-06-17T14:00:00Z'
      },
      // 用户手动确认：选回正确的住院号
      {
        value: JSON.stringify([
          { "标识符类型": "住院号", "标识符编号": "ZY2024001234" },
          { "标识符类型": "病案号", "标识符编号": "BA20240567" }
        ]),
        type: 'array', doc: null, page: null,
        text: '用户确认住院号为 ZY2024001234（排除复诊号）',
        conf: null, by: 'user', time: '2024-06-17T16:00:00Z'
      },
    ]
  },

  // ═══════════════════════════════════════════
  // 联系方式 — 渐进式补全
  // ═══════════════════════════════════════════
  {
    field: '/基本信息/人口学情况/联系方式',
    values: [
      // 第 1 次：只拿到电话
      {
        value: JSON.stringify([
          { "联系电话": "13812345678", "出生地": "", "现住址": "" }
        ]),
        type: 'array', doc: 0, page: 1,
        text: '联系电话：13812345678',
        conf: 0.95, by: 'ai', time: '2024-06-15T10:02:00Z'
      },
      // 第 2 次：补全了出生地
      {
        value: JSON.stringify([
          { "联系电话": "13812345678", "出生地": "北京市朝阳区", "现住址": "" }
        ]),
        type: 'array', doc: 2, page: 1,
        text: '出生地：北京市朝阳区',
        conf: 0.88, by: 'ai', time: '2024-06-16T09:05:00Z'
      },
      // 第 3 次：另一份文档给了不同的出生地
      {
        value: JSON.stringify([
          { "联系电话": "13812345678", "出生地": "北京市东城区", "现住址": "" }
        ]),
        type: 'array', doc: 1, page: 1,
        text: '出生地：北京市东城区（户籍地可能不同）',
        conf: 0.72, by: 'ai', time: '2024-06-16T14:00:00Z'
      },
      // 第 4 次：补全了现住址
      {
        value: JSON.stringify([
          { "联系电话": "13812345678", "出生地": "北京市朝阳区", "现住址": "北京市海淀区中关村南大街5号院" }
        ]),
        type: 'array', doc: 2, page: 2,
        text: '现住址：北京市海淀区中关村南大街5号院',
        conf: 0.90, by: 'ai', time: '2024-06-17T10:00:00Z'
      },
      // 用户手动确认
      {
        value: JSON.stringify([
          { "联系电话": "13812345678", "出生地": "北京市朝阳区", "现住址": "北京市海淀区中关村南大街5号院" }
        ]),
        type: 'array', doc: null, page: null,
        text: '用户确认出生地为朝阳区',
        conf: null, by: 'user', time: '2024-06-17T16:10:00Z'
      },
    ]
  },

  // ═══════════════════════════════════════════
  // 紧急联系人 — 从无到有 + 信息补全
  // ═══════════════════════════════════════════
  {
    field: '/基本信息/人口学情况/紧急联系人',
    values: [
      // 第 1 次：只拿到姓名
      {
        value: JSON.stringify([
          { "姓名": "李四", "关系": "", "电话": "" }
        ]),
        type: 'array', doc: 0, page: 3,
        text: '紧急联系人：李四',
        conf: 0.85, by: 'ai', time: '2024-06-15T10:05:00Z'
      },
      // 第 2 次：补全了关系
      {
        value: JSON.stringify([
          { "姓名": "李四", "关系": "配偶", "电话": "" }
        ]),
        type: 'array', doc: 2, page: 1,
        text: '紧急联系人：李四（配偶）',
        conf: 0.90, by: 'ai', time: '2024-06-16T09:10:00Z'
      },
      // 第 3 次：另一份文档写的是"妻子"而非"配偶"
      {
        value: JSON.stringify([
          { "姓名": "李四", "关系": "妻子", "电话": "" }
        ]),
        type: 'array', doc: 1, page: 2,
        text: '联系人关系：妻子',
        conf: 0.80, by: 'ai', time: '2024-06-16T14:05:00Z'
      },
      // 第 4 次：补全了电话
      {
        value: JSON.stringify([
          { "姓名": "李四", "关系": "配偶", "电话": "13987654321" }
        ]),
        type: 'array', doc: 2, page: 3,
        text: '紧急联系人电话：13987654321',
        conf: 0.92, by: 'ai', time: '2024-06-17T10:10:00Z'
      },
      // 第 5 次：电话有冲突
      {
        value: JSON.stringify([
          { "姓名": "李四", "关系": "配偶", "电话": "13987654322" }
        ]),
        type: 'array', doc: 1, page: 3,
        text: '联系人电话：13987654322（可能是旧号）',
        conf: 0.65, by: 'ai', time: '2024-06-17T14:10:00Z'
      },
      // 用户手动确认
      {
        value: JSON.stringify([
          { "姓名": "李四", "关系": "配偶", "电话": "13987654321" }
        ]),
        type: 'array', doc: null, page: null,
        text: '用户确认电话为 13987654321',
        conf: null, by: 'user', time: '2024-06-17T16:20:00Z'
      },
    ]
  },
]

const seed = db.transaction(() => {
  let total = 0
  for (const group of candidates) {
    for (const v of group.values) {
      const docId = v.doc !== null && docs[v.doc] ? docs[v.doc].id : null
      ins.run(
        randomUUID(),
        instance.id,
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
  console.log(`✅ Inserted ${total} candidates for ${candidates.length} table fields`)
})

seed()

const count = db.prepare('SELECT COUNT(*) as c FROM field_value_candidates WHERE instance_id = ?').get(instance.id)
console.log(`📊 Total candidates: ${count.c}`)
db.close()
console.log('✅ Done!')
