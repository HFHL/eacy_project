import { Router, Request, Response } from 'express'
import { randomUUID } from 'crypto'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import db from '../db.js'
import { parseDocument } from '../services/textin.js'

// ─── EHR Pipeline ────────────────────────────────────────────────────────────
// Pipeline daemon 会自动发现满足条件的文档并派发处理任务，
// 后端通过 ehr_extraction_jobs 表调度 extract/materialize 任务

const router = Router()

// ─── Multer 文件上传配置 ─────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads')

// 确保上传目录存在
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    // 用 UUID 命名避免冲突，保留扩展名
    const ext = path.extname(file.originalname)
    cb(null, `${randomUUID()}${ext}`)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
})

// ─── Types ───────────────────────────────────────────────────────────────────

type DocumentStatus =
  | 'pending_upload' | 'uploaded' | 'archived' | 'deleted'
  | 'ocr_pending' | 'ocr_running' | 'ocr_succeeded' | 'ocr_failed'

interface DocumentRecord {
  id: string
  patient_id: string | null
  file_name: string
  file_size: number
  mime_type: string
  object_key: string
  status: DocumentStatus
  batch_id: string | null
  doc_type: string | null
  doc_title: string | null
  effective_at: string | null
  metadata: string          // JSON string in SQLite
  raw_text: string | null
  ocr_payload: string | null
  extract_result_json: string | null
  extract_status: string | null
  meta_status: string | null
  materialize_status: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString()
}

function safeParseMetadata(raw: string | null | undefined): Record<string, unknown> {
  try {
    const v = JSON.parse(raw ?? '{}')
    return v != null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** 获取默认 schema 的 UUID id */
function getDefaultSchemaId(): string | null {
  const row = db.prepare(
    `SELECT id FROM schemas WHERE code = 'patient_ehr_v2' AND is_active = 1 ORDER BY version DESC LIMIT 1`
  ).get() as any
  return row?.id ?? null
}

/** 从 ehr_extraction_jobs 获取文档的最新 job 状态 */
function getJobStatus(documentId: string, jobType: string): string {
  const row = db.prepare(`
    SELECT status FROM ehr_extraction_jobs
    WHERE document_id = ? AND job_type = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(documentId, jobType) as any
  return row?.status ?? 'pending'
}

/** 把 SQLite 行转成对外 JSON（metadata 反序列化） */
function serialize(row: DocumentRecord) {
  return {
    ...row,
    metadata: safeParseMetadata(row.metadata),
  }
}

/** 中文 metadata key → 前端英文 key 映射 */
const META_KEY_MAP: Record<string, string> = {
  '机构名称': 'organizationName',
  '患者姓名': 'patientName',
  '患者性别': 'gender',
  '患者年龄': 'age',
  '文档类型': 'documentType',
  '文档子类型': 'documentSubtype',
  '文档标题': 'docTitle',
  '文档生效日期': 'effectiveDate',
  '唯一标识符': 'identifiers',
  '出生日期': 'birthDate',
  '联系电话': 'phone',
  '诊断': 'diagnosis',
  '科室信息': 'department',
}

/** 反向映射：英文 key → 中文 key */
const META_KEY_MAP_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(META_KEY_MAP).map(([k, v]) => [v, k])
)

/** 从 metadata JSON 中提取 result 并映射为前端期望的英文 key */
function normalizeMetadata(metadataStr: string): Record<string, any> {
  let meta: any = {}
  try { meta = JSON.parse(metadataStr || '{}') } catch {}
  const result = meta?.result || meta || {}
  const normalized: Record<string, any> = {}
  for (const [cnKey, enKey] of Object.entries(META_KEY_MAP)) {
    if (result[cnKey] !== undefined) {
      normalized[enKey] = result[cnKey]
    }
  }
  return normalized
}

/** 从 raw_text 生成简化的 content_list（无 ocr_payload 时的降级方案） */
function rawTextToContentList(rawText: string | null): any[] {
  if (!rawText || rawText.trim().length === 0) return []
  // 按连续空行分段
  const paragraphs = rawText.split(/\n{2,}/).filter(p => p.trim().length > 0)
  return paragraphs.map((text, idx) => ({
    type: 'paragraph',
    sub_type: idx === 0 ? 'header' : 'body',
    text: text.trim(),
    page_id: 1,
    position: [],
    _originalIndex: idx
  }))
}

/** 从 ocr_payload 或 raw_text 解析 content_list */
function buildContentList(row: DocumentRecord): any[] {
  // 1. 优先使用 ocr_payload
  if (row.ocr_payload) {
    try {
      const payload = JSON.parse(row.ocr_payload)
      if (Array.isArray(payload.segments) && payload.segments.length > 0) {
        return payload.segments.map((seg: any, idx: number) => ({
          ...seg,
          _originalIndex: idx
        }))
      }
    } catch {}
  }
  // 2. 尝试将 raw_text 当作 OCR JSON 解析（当前 OCR worker 将结构化结果存入了 raw_text）
  if (row.raw_text) {
    try {
      const payload = JSON.parse(row.raw_text)
      if (Array.isArray(payload.segments) && payload.segments.length > 0) {
        return payload.segments.map((seg: any, idx: number) => ({
          ...seg,
          _originalIndex: idx
        }))
      }
    } catch {
      // 不是 JSON，当作纯文本处理
    }
  }
  // 3. 最终降级：按段落分割纯文本
  return rawTextToContentList(row.raw_text)
}

/** 组装 linked_patients */
function buildLinkedPatients(patientId: string | null): any[] {
  if (!patientId) return []
  const patient = db.prepare(`SELECT * FROM patients WHERE id = ?`).get(patientId) as any
  if (!patient) return []
  let meta: any = {}
  try { meta = JSON.parse(patient.metadata || '{}') } catch {}
  return [{
    patient_id: patient.id,
    patient_name: patient.name || '未知患者',
    patient_code: patient.id.substring(0, 8),
    gender: meta['患者性别'] || null,
    age: meta['患者年龄'] || null,
    birth_date: meta['出生日期'] || null,
    phone: meta['联系电话'] || null,
    id_card: meta['身份证号'] || null,
    address: meta['地址'] || null,
    department: meta['科室信息'] || null,
    attending_doctor: meta['主治医师'] || null,
    diagnoses: Array.isArray(meta['主要诊断']) ? meta['主要诊断'] : (meta['诊断'] ? [meta['诊断']] : []),
  }]
}

/** 组装 extraction_records（从 documents.extract_result_json + extraction_runs 表） */
function buildExtractionRecords(documentId: string): { records: any[], count: number } {
  // 1. 先查 extraction_runs 表
  const runs = db.prepare(`
    SELECT * FROM extraction_runs WHERE document_id = ? ORDER BY created_at DESC
  `).all(documentId) as any[]

  if (runs.length > 0) {
    const records = runs.map(run => ({
      extraction_id: run.id,
      created_at: run.created_at,
      status: run.status,
      model_name: run.model_name,
      is_merged: false,  // TODO: 后续从合并记录判断
      merged_at: null,
      conflict_count: 0,
      extracted_ehr_data: {},  // extraction_runs 的数据需要另外从 field_value_candidates 聚合
    }))
    return { records, count: records.length }
  }

  // 2. 降级方案：从 documents.extract_result_json 读取
  const doc = db.prepare(`SELECT extract_result_json, extract_status, extract_completed_at FROM documents WHERE id = ?`).get(documentId) as any
  if (!doc?.extract_result_json) return { records: [], count: 0 }

  try {
    const ehrData = JSON.parse(doc.extract_result_json)
    const records = [{
      extraction_id: `${documentId}-extract-0`,
      created_at: doc.extract_completed_at || now(),
      status: doc.extract_status || 'succeeded',
      model_name: ehrData?._extraction_metadata?.model || 'unknown',
      is_merged: false,
      merged_at: null,
      conflict_count: 0,
      extracted_ehr_data: ehrData,
    }]
    return { records, count: 1 }
  } catch {
    return { records: [], count: 0 }
  }
}

// ─── Prepared statements ──────────────────────────────────────────────────────

const stmtInsert = db.prepare(`
  INSERT INTO documents
    (id, patient_id, file_name, file_size, mime_type, object_key,
     status, batch_id, doc_type, doc_title, effective_at, metadata, raw_text,
     created_at, updated_at)
  VALUES
    (@id, @patient_id, @file_name, @file_size, @mime_type, @object_key,
     @status, @batch_id, @doc_type, @doc_title, @effective_at, @metadata, @raw_text,
     @created_at, @updated_at)
`)

const stmtFindById = db.prepare<[string]>(`
  SELECT * FROM documents WHERE id = ?
`)

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/documents/upload
 * 接收文件二进制 (multipart/form-data)，保存到本地磁盘，创建 DB 记录，
 * 自动设置 status = ocr_pending 以便 pipeline-daemon 自动发现并处理
 */
router.post('/upload', upload.single('file'), (req: Request, res: Response) => {
  const file = (req as any).file as Express.Multer.File | undefined

  if (!file) {
    return res.status(400).json({
      success: false, code: 400,
      message: '缺少文件',
      data: null,
    })
  }

  const batchId = req.body.batchId ?? null

  const id = randomUUID()
  // object_key 指向本地磁盘路径（相对于 uploads 目录）
  const objectKey = path.join(UPLOADS_DIR, file.filename)
  const ts = now()

  stmtInsert.run({
    id,
    patient_id:   null,
    file_name:    file.originalname,
    file_size:    file.size,
    mime_type:    file.mimetype,
    object_key:   objectKey,
    status:       'ocr_pending',   // 直接进入 OCR 排队
    batch_id:     batchId,
    doc_type:     null,
    doc_title:    file.originalname,
    effective_at: null,
    metadata:     '{}',
    raw_text:     null,
    created_at:   ts,
    updated_at:   ts,
  })

  const row = stmtFindById.get(id) as DocumentRecord
  return res.status(201).json({
    success: true, code: 0,
    message: '上传成功，OCR 已排队',
    data: serialize(row),
  })
})

/**
 * POST /api/v1/documents/upload-init
 */
router.post('/upload-init', (req: Request, res: Response) => {
  const { fileName, fileSize, mimeType, patientId, batchId } = req.body

  if (!fileName || fileSize === undefined || !mimeType) {
    return res.status(400).json({
      success: false, code: 400,
      message: '缺少必填参数：fileName, fileSize, mimeType',
      data: null,
    })
  }

  if (typeof fileSize !== 'number' || fileSize <= 0) {
    return res.status(400).json({
      success: false, code: 400,
      message: 'fileSize 必须为正整数',
      data: null,
    })
  }

  const id = randomUUID()
  const objectKey = `uploads/${id}/${fileName}`
  const ts = now()

  stmtInsert.run({
    id,
    patient_id:   patientId ?? null,
    file_name:    fileName,
    file_size:    fileSize,
    mime_type:    mimeType,
    object_key:   objectKey,
    status:       'pending_upload',
    batch_id:     batchId ?? null,
    doc_type:     null,
    doc_title:    fileName,
    effective_at: null,
    metadata:     '{}',
    raw_text:     null,
    created_at:   ts,
    updated_at:   ts,
  })

  return res.status(201).json({
    success: true, code: 0,
    message: '初始化上传成功',
    data: { documentId: id, objectKey, status: 'pending_upload' },
  })
})

/**
 * POST /api/v1/documents/complete
 */
router.post('/complete', async (req: Request, res: Response) => {
  const { documentId, objectKey } = req.body

  if (!documentId || !objectKey) {
    return res.status(400).json({
      success: false, code: 400,
      message: '缺少必填参数：documentId, objectKey',
      data: null,
    })
  }

  const row = stmtFindById.get(documentId) as DocumentRecord | undefined
  if (!row) {
    return res.status(404).json({ success: false, code: 404, message: '文档不存在', data: null })
  }

  if (row.status !== 'pending_upload') {
    return res.status(409).json({
      success: false, code: 409,
      message: `当前状态 ${row.status} 不允许执行 complete 操作`,
      data: null,
    })
  }

  // 更新为 ocr_pending，pipeline-daemon 会自动发现并触发 OCR
  db.prepare(`
    UPDATE documents SET object_key = ?, status = 'ocr_pending', updated_at = ? WHERE id = ?
  `).run(objectKey, now(), documentId)

  const updated = stmtFindById.get(documentId) as DocumentRecord
  return res.json({ success: true, code: 0, message: '上传完成，OCR 已排队（daemon 自动调度）', data: serialize(updated) })
})

/**
 * GET /api/v1/documents
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const { patientId, status, ids } = req.query

    let sql = `SELECT * FROM documents WHERE status != 'deleted'`
    const params: string[] = []

    if (patientId) {
      sql += ` AND patient_id = ?`
      params.push(String(patientId))
    }
    if (status) {
      sql += ` AND status = ?`
      params.push(String(status))
    }
    // 支持按 id 列表过滤（逗号分隔）
    if (ids) {
      const idList = String(ids).split(',')
      const placeholders = idList.map(() => '?').join(',')
      sql += ` AND id IN (${placeholders})`
      params.push(...idList)
    }
    sql += ` ORDER BY created_at DESC`

    const rows = db.prepare(sql).all(...params) as any[]
    // 返回完整的流水线状态字段
    return res.json({
      success: true, code: 0, message: 'ok',
      data: rows.map(row => ({
        ...row,
        metadata: safeParseMetadata(row.metadata),
        // 确保流水线状态字段始终存在
        meta_status: row.meta_status ?? 'pending',
        extract_status: getJobStatus(row.id, 'extract'),
        materialize_status: getJobStatus(row.id, 'materialize'),
      })),
    })
  } catch (err: any) {
    console.error('[GET /documents]', err)
    return res.status(500).json({
      success: false,
      code: 500,
      message: err?.message || '服务器错误',
      data: null,
    })
  }
})

/**
 * GET /api/v1/documents/:id
 * 增强版文档详情：返回 normalized_metadata, linked_patients, content_list, extraction_records
 */
router.get('/:id', (req: Request, res: Response) => {
  const row = stmtFindById.get(req.params.id) as DocumentRecord | undefined

  if (!row || row.status === 'deleted') {
    return res.status(404).json({ success: false, code: 404, message: '文档不存在', data: null })
  }

  const includePatients = req.query.include_patients !== 'false'
  const includeExtracted = req.query.include_extracted !== 'false'

  // 基础序列化
  const base = serialize(row)

  // 规范化元数据（中文 key → 英文 key）
  const normalizedMeta = normalizeMetadata(row.metadata)

  // OCR 内容块列表
  const contentList = buildContentList(row)

  // 关联患者
  const linkedPatients = includePatients ? buildLinkedPatients(row.patient_id) : []

  // 抽取记录
  const { records: extractionRecords, count: extractionCount } = includeExtracted
    ? buildExtractionRecords(row.id)
    : { records: [], count: 0 }

  // 文件类型
  const ext = path.extname(row.file_name || '').replace('.', '').toLowerCase()
  const fileType = ext || (row.mime_type?.split('/')[1]) || 'unknown'

  return res.json({
    success: true, code: 0, message: 'ok',
    data: {
      ...base,
      // 前端期望的规范化字段
      metadata: normalizedMeta,
      raw_metadata: JSON.parse(row.metadata ?? '{}'),
      file_type: fileType,
      // 文档状态
      isParsed: row.status === 'ocr_succeeded',
      meta_status: (row as any).meta_status ?? 'pending',
      extract_status: getJobStatus(row.id, 'extract'),
      materialize_status: getJobStatus(row.id, 'materialize'),
      // 关联数据
      linked_patients: linkedPatients,
      content_list: contentList,
      extraction_records: extractionRecords,
      extraction_count: extractionCount,
    }
  })
})

/**
 * GET /api/v1/documents/:id/temp-url
 * 获取文档预览的临时 URL
 */
router.get('/:id/temp-url', (req: Request, res: Response) => {
  const row = stmtFindById.get(req.params.id) as DocumentRecord | undefined

  if (!row || row.status === 'deleted') {
    return res.status(404).json({ success: false, code: 404, message: '文档不存在', data: null })
  }

  // 本地模式：直接返回静态文件 URL
  // object_key 存的是完整路径如 /xxx/uploads/uuid.jpg
  const objectKey = row.object_key || ''
  const fileName = path.basename(objectKey)
  const ext = path.extname(row.file_name || '').replace('.', '').toLowerCase()
  const fileType = ext || (row.mime_type?.split('/')[1]) || 'unknown'

  // 检查文件是否存在
  if (!fs.existsSync(objectKey)) {
    return res.status(404).json({ success: false, code: 404, message: '文件不存在于磁盘', data: null })
  }

  const tempUrl = `/uploads/${fileName}`

  return res.json({
    success: true, code: 0, message: 'ok',
    data: {
      temp_url: tempUrl,
      file_type: fileType,
      file_name: row.file_name,
      mime_type: row.mime_type,
    }
  })
})

/**
 * PUT /api/v1/documents/:id/metadata
 * 保存用户编辑的元数据字段（英文 key → 中文 key 存库）
 */
router.put('/:id/metadata', (req: Request, res: Response) => {
  const row = stmtFindById.get(req.params.id) as DocumentRecord | undefined

  if (!row || row.status === 'deleted') {
    return res.status(404).json({ success: false, code: 404, message: '文档不存在', data: null })
  }

  const updates = req.body
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ success: false, code: 400, message: '请求体必须是 JSON 对象', data: null })
  }

  // 读取现有 metadata
  let meta: any = {}
  try { meta = JSON.parse(row.metadata || '{}') } catch {}
  if (!meta.result) meta.result = {}

  // 将前端英文 key 映射回中文 key 写入 result
  let changedCount = 0
  for (const [enKey, value] of Object.entries(updates)) {
    const cnKey = META_KEY_MAP_REVERSE[enKey]
    if (cnKey) {
      meta.result[cnKey] = value
      changedCount++
    }
  }

  // 同步更新 doc_type / effective_at 等顶层字段
  const docType = updates.documentType ?? row.doc_type
  const effectiveAt = updates.effectiveDate ?? row.effective_at

  db.prepare(`
    UPDATE documents SET metadata = ?, doc_type = ?, effective_at = ?, updated_at = ? WHERE id = ?
  `).run(JSON.stringify(meta), docType, effectiveAt, now(), req.params.id)

  return res.json({
    success: true, code: 0, message: '元数据保存成功',
    data: { updated_fields: changedCount }
  })
})

/**
 * POST /api/v1/documents/:id/extract-metadata
 * 触发重新抽取元数据（重置 meta_status 让 daemon 自动调度）
 */
router.post('/:id/extract-metadata', (req: Request, res: Response) => {
  const row = stmtFindById.get(req.params.id) as DocumentRecord | undefined

  if (!row || row.status === 'deleted') {
    return res.status(404).json({ success: false, code: 404, message: '文档不存在', data: null })
  }

  if (row.status !== 'ocr_succeeded') {
    return res.status(400).json({
      success: false, code: 400,
      message: '文档尚未完成 OCR 解析，无法抽取元数据', data: null
    })
  }

  // 重置 meta_status 为 pending，daemon 会自动发现并处理
  db.prepare(`
    UPDATE documents SET meta_status = 'pending', meta_error_message = NULL, updated_at = ? WHERE id = ?
  `).run(now(), req.params.id)

  return res.json({
    success: true, code: 0, message: '元数据抽取任务已排队',
    data: { status: 'pending', document_id: req.params.id }
  })
})

/**
 * POST /api/v1/documents/:id/extract-ehr
 * 触发 EHR 结构化抽取（重置 extract_status 让 daemon 自动调度）
 */
router.post('/:id/extract-ehr', (req: Request, res: Response) => {
  const row = stmtFindById.get(req.params.id) as DocumentRecord | undefined

  if (!row || row.status === 'deleted') {
    return res.status(404).json({ success: false, code: 404, message: '文档不存在', data: null })
  }

  if (row.status !== 'ocr_succeeded') {
    return res.status(400).json({
      success: false, code: 400,
      message: '文档尚未完成 OCR 解析，无法进行 EHR 抽取', data: null
    })
  }

  const schemaId = getDefaultSchemaId()
  if (!schemaId) {
    return res.status(500).json({
      success: false, code: 500,
      message: '未找到可用的 EHR schema', data: null
    })
  }

  // 清除旧的失败 job（如果有），以便重新创建
  db.prepare(`
    DELETE FROM ehr_extraction_jobs
    WHERE document_id = ? AND schema_id = ? AND job_type = 'extract' AND status IN ('failed', 'completed')
  `).run(req.params.id, schemaId)

  // 插入新的 pending job（部分唯一索引保证幂等）
  const jobId = `job_${randomUUID().replace(/-/g, '')}`
  try {
    db.prepare(`
      INSERT INTO ehr_extraction_jobs
        (id, document_id, patient_id, schema_id, job_type, status,
         attempt_count, max_attempts, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'extract', 'pending', 0, 3, ?, ?)
    `).run(jobId, req.params.id, row.patient_id, schemaId, now(), now())
  } catch (e: any) {
    if (e.message?.includes('UNIQUE constraint')) {
      return res.json({
        success: true, code: 0, message: 'EHR 抽取任务已在队列中',
        data: { status: 'pending', document_id: req.params.id }
      })
    }
    throw e
  }

  // 同时重置 documents 表的旧字段（兼容）
  db.prepare(`
    UPDATE documents SET extract_status = 'pending', extract_error_message = NULL, extract_result_json = NULL, updated_at = ? WHERE id = ?
  `).run(now(), req.params.id)

  return res.json({
    success: true, code: 0, message: 'EHR 抽取任务已排队',
    data: { status: 'pending', document_id: req.params.id, job_id: jobId }
  })
})

/**
 * POST /api/v1/documents/:id/reparse
 * 同步重新解析文档（重置 OCR 状态让 daemon 自动调度）
 */
router.post('/:id/reparse', (req: Request, res: Response) => {
  const row = stmtFindById.get(req.params.id) as DocumentRecord | undefined

  if (!row || row.status === 'deleted') {
    return res.status(404).json({ success: false, code: 404, message: '文档不存在', data: null })
  }

  // 重置为 ocr_pending，daemon 会自动发现并重新 OCR
  db.prepare(`
    UPDATE documents SET status = 'ocr_pending', raw_text = NULL, ocr_payload = NULL, 
      meta_status = 'pending', extract_status = 'pending', updated_at = ? WHERE id = ?
  `).run(now(), req.params.id)

  // 清除该文档的所有活跃 job（重解析后需要重新走流程）
  const schemaId = getDefaultSchemaId()
  if (schemaId) {
    db.prepare(`
      DELETE FROM ehr_extraction_jobs
      WHERE document_id = ? AND schema_id = ? AND status IN ('pending', 'running')
    `).run(req.params.id, schemaId)
  }

  return res.json({
    success: true, code: 0, message: '重新解析任务已排队',
    data: { status: 'ocr_pending', document_id: req.params.id }
  })
})

/**
 * POST /api/v1/documents/:id/unarchive
 * 解除患者绑定
 */
router.post('/:id/unarchive', (req: Request, res: Response) => {
  const row = stmtFindById.get(req.params.id) as DocumentRecord | undefined

  if (!row || row.status === 'deleted') {
    return res.status(404).json({ success: false, code: 404, message: '文档不存在', data: null })
  }

  if (!row.patient_id) {
    return res.status(400).json({ success: false, code: 400, message: '文档未绑定患者', data: null })
  }

  // 清除 patient_id，状态回退到 ocr_succeeded（如果已 OCR 完）
  const newStatus = row.raw_text ? 'ocr_succeeded' : row.status
  db.prepare(`
    UPDATE documents SET patient_id = NULL, status = ?, materialize_status = 'pending', updated_at = ? WHERE id = ?
  `).run(newStatus, now(), req.params.id)

  return res.json({
    success: true, code: 0, message: '已解除患者绑定',
    data: { document_id: req.params.id }
  })
})

/**
 * GET /api/v1/documents/:id/operation-history
 * 操作历史 — 从现有数据聚合（简化实现）
 */
router.get('/:id/operation-history', (req: Request, res: Response) => {
  const row = stmtFindById.get(req.params.id) as DocumentRecord | undefined

  if (!row || row.status === 'deleted') {
    return res.status(404).json({ success: false, code: 404, message: '文档不存在', data: null })
  }

  const history: any[] = []

  // 1. 上传事件
  history.push({
    id: `${row.id}-upload`,
    type: 'upload',
    title: '文档上传',
    description: `上传文件 ${row.file_name} (${(row.file_size / 1024).toFixed(1)}KB)`,
    operator_type: 'system',
    operator_name: '系统',
    created_at: row.created_at
  })

  // 2. OCR 完成事件
  if (row.status === 'ocr_succeeded' || row.raw_text) {
    history.push({
      id: `${row.id}-ocr`,
      type: 'extraction',
      title: 'OCR 解析完成',
      description: `文档已完成 OCR 文字识别`,
      operator_type: 'ai',
      operator_name: 'OCR引擎',
      created_at: row.updated_at
    })
  }

  // 3. 元数据抽取事件
  const metaStatus = (row as any).meta_status
  if (metaStatus === 'completed') {
    const metaCompletedAt = (row as any).meta_completed_at
    history.push({
      id: `${row.id}-meta`,
      type: 'extraction',
      title: '元数据抽取完成',
      description: '提取到文档类型、患者信息等元数据字段',
      operator_type: 'ai',
      operator_name: 'AI系统',
      created_at: metaCompletedAt || row.updated_at
    })
  }

  return res.json({
    success: true, code: 0, message: 'ok',
    data: {
      history: history.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
      extraction_count: history.filter(h => h.type === 'extraction').length,
      field_change_count: 0,
      conflict_resolve_count: 0
    }
  })
})

/**
 * POST /api/v1/documents/:id/archive
 */
router.post('/:id/archive', (req: Request, res: Response) => {
  const { patientId } = req.body

  if (!patientId) {
    return res.status(400).json({
      success: false, code: 400,
      message: '缺少必填参数：patientId',
      data: null,
    })
  }

  const row = stmtFindById.get(req.params.id) as DocumentRecord | undefined
  if (!row || row.status === 'deleted') {
    return res.status(404).json({ success: false, code: 404, message: '文档不存在', data: null })
  }

  db.prepare(`
    UPDATE documents SET patient_id = ?, status = 'archived', updated_at = ? WHERE id = ?
  `).run(patientId, now(), req.params.id)

  const updated = stmtFindById.get(req.params.id) as DocumentRecord
  return res.json({ success: true, code: 0, message: '归档成功', data: serialize(updated) })
})

/**
 * POST /api/v1/documents/:id/ocr
 * 对指定文档调用 Textin OCR，返回解析后的段落列表（不落库）
 */
router.post('/:id/ocr', async (req: Request, res: Response) => {
  const row = stmtFindById.get(req.params.id) as DocumentRecord | undefined

  if (!row || row.status === 'deleted') {
    return res.status(404).json({ success: false, code: 404, message: '文档不存在', data: null })
  }

  if (!row.object_key) {
    return res.status(400).json({ success: false, code: 400, message: '文档尚无 object_key，无法 OCR', data: null })
  }

  try {
    const ocrResult = await parseDocument(row.id, row.object_key)
    return res.json({
      success: true,
      code: 0,
      message: `OCR 完成，共 ${ocrResult.segments.length} 个段落`,
      data: ocrResult,
    })
  } catch (err: any) {
    console.error('[OCR] 失败:', err)
    return res.status(502).json({
      success: false,
      code: 502,
      message: `OCR 调用失败: ${err.message}`,
      data: null,
    })
  }
})

/**
 * DELETE /api/v1/documents/:id
 */
router.delete('/:id', (req: Request, res: Response) => {
  const row = stmtFindById.get(req.params.id) as DocumentRecord | undefined

  if (!row || row.status === 'deleted') {
    return res.status(404).json({ success: false, code: 404, message: '文档不存在', data: null })
  }

  db.prepare(`
    UPDATE documents SET status = 'deleted', updated_at = ? WHERE id = ?
  `).run(now(), req.params.id)

  return res.json({ success: true, code: 0, message: '删除成功', data: null })
})
/**
 * POST /api/v1/documents/archive-to-patient
 */
router.post('/archive-to-patient', (req: Request, res: Response) => {
  const { documentIds, patientId, batchId } = req.body

  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    return res.status(400).json({ success: false, code: 400, message: 'documentIds 必须是非空数组', data: null })
  }
  if (!patientId) {
    return res.status(400).json({ success: false, code: 400, message: '缺少必填参数：patientId', data: null })
  }

  const archiveTransaction = db.transaction(() => {
    const patientRow = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId) as any
    if (!patientRow) throw new Error(`PATIENT_NOT_FOUND`)

    let patientMeta: any = {}
    try { patientMeta = JSON.parse(patientRow.metadata || '{}') } catch {}
    let patientName = patientRow.name

    const archivedIds: string[] = []
    const docsToArchive: any[] = []
    const stmtCheck = db.prepare(`SELECT * FROM documents WHERE id = ?`)
    const stmtUpdate = db.prepare(`UPDATE documents SET patient_id = ?, status = 'archived', updated_at = ? WHERE id = ?`)
    const currentTs = now()

    for (const docId of documentIds) {
      const docRaw = stmtCheck.get(docId) as DocumentRecord | undefined
      if (!docRaw) throw new Error(`DOCUMENT_NOT_FOUND:${docId}`)
      if (docRaw.status === 'deleted') throw new Error(`DOCUMENT_DELETED:${docId}`)
      if (docRaw.patient_id && docRaw.patient_id !== patientId) {
         throw new Error(`DOCUMENT_ALREADY_ARCHIVED:${docId}`)
      }

      stmtUpdate.run(patientId, currentTs, docId)
      archivedIds.push(docId)
      docsToArchive.push(docRaw)
    }

    // 补充归档到已有患者的信息合并逻辑
    const names: string[] = []
    const allIdentifiers: any[] = Array.isArray(patientMeta['唯一标识符']) ? [...patientMeta['唯一标识符']] : []
    let hasChanges = false

    for (const docLine of docsToArchive) {
      let docMeta: any = {}
      try { docMeta = JSON.parse(docLine.metadata || '{}') } catch {}
      const metaResult = docMeta?.result || docMeta || {}

      if (metaResult['患者姓名']) names.push(metaResult['患者姓名'])
      
      const scalarFields = ['患者性别', '患者年龄', '出生日期', '联系电话', '机构名称', '科室信息']
      for (const f of scalarFields) {
        // 如果患者原先没有这个项，但新文档里有，则补进去
        // 不等于 null / undefined / 空字符串 可视为“有值”
        if (!patientMeta[f] && metaResult[f]) {
          patientMeta[f] = metaResult[f]
          hasChanges = true
        }
      }

      if (Array.isArray(metaResult['唯一标识符'])) {
         allIdentifiers.push(...metaResult['唯一标识符'])
      }
    }

    // 标识符去重
    if (allIdentifiers.length > 0) {
      const uniqueIdentifiersMap = new Map()
      for (const idObj of allIdentifiers) {
          if (!idObj) continue
          const key = `${idObj['标识符类型'] || 'Unknown'}-${idObj['标识符编号'] || 'Unknown'}`
          if (!uniqueIdentifiersMap.has(key)) {
              uniqueIdentifiersMap.set(key, idObj)
          }
      }
      const dedupedIdentifiers = Array.from(uniqueIdentifiersMap.values())
      if (JSON.stringify(patientMeta['唯一标识符'] || []) !== JSON.stringify(dedupedIdentifiers)) {
         patientMeta['唯一标识符'] = dedupedIdentifiers
         hasChanges = true
      }
    }

    // 尝试补全患者姓名
    if (!patientName && names.length > 0) {
      const nameCounts = new Map<string, number>()
      let maxNameCount = 0
      let mostFreqName: string | null = null
      for (const n of names) {
         const cnt = (nameCounts.get(n) || 0) + 1
         nameCounts.set(n, cnt)
         if (cnt > maxNameCount) {
           maxNameCount = cnt
           mostFreqName = n
         }
      }
      if (mostFreqName) {
        patientName = mostFreqName
        hasChanges = true
      }
    }

    if (hasChanges) {
       db.prepare(`UPDATE patients SET name = ?, metadata = ?, updated_at = ? WHERE id = ?`)
         .run(patientName, JSON.stringify(patientMeta), currentTs, patientId)
    }

    return archivedIds
  })

  try {
    const archivedIds = archiveTransaction()

    // 归档成功后，daemon 会自动发现已归档文档并通过 ehr_extraction_jobs 创建 materialize job

    return res.json({
      success: true,
      code: 0,
      data: {
        patientId,
        archivedDocumentIds: archivedIds,
        skippedDocumentIds: [],
        message: `${archivedIds.length} 份文档已归档到已有患者`
      }
    })
  } catch (err: any) {
    const msg = err.message as string
    if (msg === 'PATIENT_NOT_FOUND') {
      return res.status(404).json({ success: false, code: 404, message: '目标患者不存在', data: null })
    }
    if (msg.startsWith('DOCUMENT_NOT_FOUND:')) {
      return res.status(400).json({ success: false, code: 400, message: `文档不存在: ${msg.split(':')[1]}`, data: null })
    }
    if (msg.startsWith('DOCUMENT_DELETED:')) {
      return res.status(400).json({ success: false, code: 400, message: `文档已删除: ${msg.split(':')[1]}`, data: null })
    }
    if (msg.startsWith('DOCUMENT_ALREADY_ARCHIVED:')) {
      return res.status(409).json({ success: false, code: 409, message: `已归档到其他患者，禁止覆盖: ${msg.split(':')[1]}`, data: null })
    }
    console.error('[archive-to-patient] error:', err)
    return res.status(500).json({ success: false, code: 500, message: '服务器内部错误', data: null })
  }
})

/**
 * POST /api/v1/documents/create-patient-and-archive
 */
router.post('/create-patient-and-archive', (req: Request, res: Response) => {
  const { documentIds, batchId } = req.body

  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    return res.status(400).json({ success: false, code: 400, message: 'documentIds 必须是非空数组', data: null })
  }

  const tx = db.transaction(() => {
    const stmtCheck = db.prepare(`SELECT * FROM documents WHERE id = ?`)
    const docs: DocumentRecord[] = []

    for (const docId of documentIds) {
      const docRaw = stmtCheck.get(docId) as DocumentRecord | undefined
      if (!docRaw) throw new Error(`DOCUMENT_NOT_FOUND:${docId}`)
      if (docRaw.status === 'deleted') throw new Error(`DOCUMENT_DELETED:${docId}`)
      if (docRaw.patient_id) throw new Error(`DOCUMENT_ALREADY_ARCHIVED:${docId}`)
      docs.push(docRaw)
    }

    const names: string[] = []
    const genderAndAge: any = {}
    const allIdentifiers: any[] = []
    let hospitalName: string | null = null
    let deptName: string | null = null
    let phoneInfo: string | null = null
    let birthDateInfo: string | null = null

    for (const docLine of docs) {
      let docMeta: any = {}
      try { docMeta = JSON.parse(docLine.metadata) } catch {}
      const metaResult = docMeta?.result || docMeta || {}
      
      if (metaResult['患者姓名']) names.push(metaResult['患者姓名'])
      if (metaResult['患者性别']) genderAndAge['患者性别'] = metaResult['患者性别']
      if (metaResult['患者年龄']) genderAndAge['患者年龄'] = metaResult['患者年龄']
      if (metaResult['出生日期']) birthDateInfo = metaResult['出生日期']
      if (metaResult['联系电话']) phoneInfo = metaResult['联系电话']
      if (metaResult['机构名称']) hospitalName = metaResult['机构名称']
      if (metaResult['科室信息']) deptName = metaResult['科室信息']

      if (Array.isArray(metaResult['唯一标识符'])) {
         allIdentifiers.push(...metaResult['唯一标识符'])
      }
    }

    const uniqueIdentifiersMap = new Map()
    for (const idObj of allIdentifiers) {
        if (!idObj) continue
        const key = `${idObj['标识符类型'] || 'Unknown'}-${idObj['标识符编号'] || 'Unknown'}`
        if (!uniqueIdentifiersMap.has(key)) {
            uniqueIdentifiersMap.set(key, idObj)
        }
    }

    const nameCounts = new Map<string, number>()
    let maxNameCount = 0
    let mostFreqName: string | null = null
    for (const n of names) {
       const cnt = (nameCounts.get(n) || 0) + 1
       nameCounts.set(n, cnt)
       if (cnt > maxNameCount) {
         maxNameCount = cnt
         mostFreqName = n
       }
    }

    const patientMeta = {
      '患者性别': genderAndAge['患者性别'] || null,
      '患者年龄': genderAndAge['患者年龄'] || null,
      '出生日期': birthDateInfo,
      '联系电话': phoneInfo,
      '唯一标识符': Array.from(uniqueIdentifiersMap.values()),
      '机构名称': hospitalName,
      '科室信息': deptName
    }

    const newPatientId = randomUUID()
    const currentTs = now()

    db.prepare(`
      INSERT INTO patients (id, name, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(newPatientId, mostFreqName, JSON.stringify(patientMeta), currentTs, currentTs)

    const stmtUpdate = db.prepare(`UPDATE documents SET patient_id = ?, status = 'archived', updated_at = ? WHERE id = ?`)
    for (const docId of documentIds) {
      stmtUpdate.run(newPatientId, currentTs, docId)
    }

    return { patientId: newPatientId, archivedDocumentIds: documentIds }
  })

  try {
    const result = tx()

    // 归档成功后，daemon 会自动发现已归档文档并通过 ehr_extraction_jobs 创建 materialize job

    return res.json({
      success: true,
      code: 0,
      data: {
        ...result,
        message: `已新建患者并归档 ${result.archivedDocumentIds.length} 份文档`
      }
    })
  } catch (err: any) {
    const msg = err.message as string
    if (msg.startsWith('DOCUMENT_NOT_FOUND:')) {
      return res.status(400).json({ success: false, code: 400, message: `文档不存在: ${msg.split(':')[1]}`, data: null })
    }
    if (msg.startsWith('DOCUMENT_DELETED:')) {
      return res.status(400).json({ success: false, code: 400, message: `文档已删除: ${msg.split(':')[1]}`, data: null })
    }
    if (msg.startsWith('DOCUMENT_ALREADY_ARCHIVED:')) {
      return res.status(409).json({ success: false, code: 409, message: `文档已归档，无法新建患者: ${msg.split(':')[1]}`, data: null })
    }
    console.error('[create-patient-and-archive] error:', err)
    return res.status(500).json({ success: false, code: 500, message: '服务器内部错误', data: null })
  }
})

export default router
