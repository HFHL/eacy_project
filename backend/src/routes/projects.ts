import { Router, Request, Response } from 'express'
import { randomUUID } from 'crypto'
import db from '../db.js'

const router = Router()

const CRF_SERVICE_URL = (process.env.CRF_SERVICE_URL || 'http://localhost:8100').replace(/\/+$/, '')

function nowIso() {
  return new Date().toISOString()
}

const ALLOWED_STATUS = new Set(['draft', 'active', 'paused', 'completed'])

function parseJsonObject(raw: unknown): Record<string, any> {
  if (!raw) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, any>
  if (typeof raw !== 'string') return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function parseJsonArray(raw: unknown): any[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw !== 'string') return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeStringList(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return [...new Set(values.map((item) => String(item ?? '').trim()).filter(Boolean))]
}

function normalizeSourceList(value: unknown): string[] {
  if (value == null) return []
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item ?? '').trim()).filter(Boolean)
}

function deriveFieldGroupsFromSchema(schema: Record<string, any>) {
  const rootProps = schema?.properties
  if (!rootProps || typeof rootProps !== 'object' || Array.isArray(rootProps)) {
    return { fieldGroups: [], fieldMap: {} as Record<string, string> }
  }

  const fieldGroups: any[] = []
  const fieldMap: Record<string, string> = {}

  const collectLeafFields = (
    target: Record<string, any> | null | undefined,
    path: string[],
    labels: string[]
  ) => {
    if (!target || typeof target !== 'object') return
    const targetType = target.type
    if (targetType === 'array' && target.items && typeof target.items === 'object' && !Array.isArray(target.items)) {
      collectLeafFields(target.items as Record<string, any>, path, labels)
      return
    }
    const props = target.properties
    if (!props || typeof props !== 'object' || Array.isArray(props)) {
      if (path.length > 0) {
        const fieldPath = path.join('/')
        const label = labels[labels.length - 1] || path[path.length - 1]
        fieldMap[fieldPath] = label
      }
      return
    }
    for (const [childKey, childSchema] of Object.entries(props)) {
      if (!childSchema || typeof childSchema !== 'object' || Array.isArray(childSchema)) continue
      const childObj = childSchema as Record<string, any>
      const childTitle = String(childObj.title || childKey)
      collectLeafFields(childObj, [...path, childKey], [...labels, childTitle])
    }
  }

  let groupIndex = 0
  for (const [groupKey, groupSchema] of Object.entries(rootProps)) {
    if (!groupSchema || typeof groupSchema !== 'object' || Array.isArray(groupSchema)) continue
    const groupObj = groupSchema as Record<string, any>
    const groupTitle = String(groupObj.title || groupKey)
    const target = groupObj.type === 'array' && groupObj.items && typeof groupObj.items === 'object' && !Array.isArray(groupObj.items)
      ? (groupObj.items as Record<string, any>)
      : groupObj
    const groupFieldsBefore = Object.keys(fieldMap).length
    collectLeafFields(target, [groupKey], [groupTitle])
    const dbFields = Object.keys(fieldMap).slice(groupFieldsBefore)
    const sources = groupObj['x-sources'] && typeof groupObj['x-sources'] === 'object' && !Array.isArray(groupObj['x-sources'])
      ? {
          primary: normalizeSourceList((groupObj['x-sources'] as Record<string, any>).primary),
          secondary: normalizeSourceList((groupObj['x-sources'] as Record<string, any>).secondary),
        }
      : { primary: [], secondary: [] }

    fieldGroups.push({
      group_id: groupKey,
      group_name: groupTitle,
      order: groupIndex++,
      is_repeatable: groupObj.type === 'array',
      db_fields: dbFields,
      field_count: dbFields.length,
      sources,
    })
  }

  return { fieldGroups, fieldMap }
}

function getProjectTemplateMeta(schemaId: string | null | undefined) {
  if (!schemaId) {
    return {
      schemaRow: null,
      schemaJson: null,
      fieldGroups: [],
      fieldMap: {},
    }
  }
  const schemaRow = db
    .prepare(`SELECT id, name, code, version, content_json FROM schemas WHERE id = ?`)
    .get(schemaId) as { id: string; name: string; code: string; version: string; content_json: string } | undefined
  if (!schemaRow) {
    return {
      schemaRow: null,
      schemaJson: null,
      fieldGroups: [],
      fieldMap: {},
    }
  }
  const schemaJson = parseJsonObject(schemaRow.content_json)
  const { fieldGroups, fieldMap } = deriveFieldGroupsFromSchema(schemaJson)
  return { schemaRow, schemaJson, fieldGroups, fieldMap }
}

function decodeSelectedValue(raw: unknown) {
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function normalizeBbox(raw: unknown) {
  if (!raw) return null
  let parsed: any = raw
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
      if (typeof parsed === 'string') {
        parsed = JSON.parse(parsed)
      }
    } catch {
      return null
    }
  }
  return parsed
}

function buildProjectCrfData(patientId: string, schemaId: string | null | undefined, fieldMap: Record<string, string> = {}) {
  const empty = { groups: {}, _extracted_at: null, _extraction_mode: null, _change_logs: [], _task_results: [], _documents: {} }
  if (!schemaId) {
    return { crfData: empty, crfCompleteness: '0', instanceId: null }
  }

  const instance = db.prepare(`
    SELECT si.id
    FROM schema_instances si
    WHERE si.patient_id = ? AND si.schema_id = ? AND si.instance_type = 'project_crf'
    ORDER BY si.updated_at DESC
    LIMIT 1
  `).get(patientId, schemaId) as { id: string } | undefined

  if (!instance?.id) {
    return { crfData: empty, crfCompleteness: '0', instanceId: null }
  }

  const rows = db.prepare(`
    SELECT
      fvs.field_path,
      fvs.selected_value_json,
      fvc.id AS candidate_id,
      fvc.source_document_id,
      fvc.source_page,
      fvc.source_bbox_json,
      fvc.source_text,
      fvc.confidence,
      d.file_name AS source_document_name,
      d.document_sub_type AS source_document_type
    FROM field_value_selected fvs
    LEFT JOIN field_value_candidates fvc ON fvc.id = fvs.selected_candidate_id
    LEFT JOIN documents d ON d.id = fvc.source_document_id
    WHERE fvs.instance_id = ?
    ORDER BY fvs.field_path
  `).all(instance.id) as any[]

  const groups: Record<string, any> = {}
  let totalFields = 0
  let filledFields = 0

  for (const row of rows) {
    const rawPath = String(row.field_path || '')
    const parts = rawPath.split('/').filter(Boolean)
    if (parts.length === 0) continue
    const groupId = parts[0]
    const fieldId = parts.slice(1).join('/')
    if (!groups[groupId]) {
      groups[groupId] = {
        group_name: fieldMap[groupId] || groupId,
        fields: {},
      }
    }
    const value = decodeSelectedValue(row.selected_value_json)
    const leafKey = parts[parts.length - 1]
    groups[groupId].fields[fieldId] = {
      value,
      field_name: fieldMap[rawPath] || fieldMap[fieldId] || leafKey,
      source: row.source_document_id ? 'AI抽取' : null,
      confidence: row.confidence,
      document_id: row.source_document_id,
      document_name: row.source_document_name,
      document_type: row.source_document_type,
      raw: row.source_text,
      bbox: normalizeBbox(row.source_bbox_json),
      page_idx: row.source_page,
      source_id: row.candidate_id,
    }
    totalFields += 1
    if (value !== null && value !== undefined && value !== '') {
      filledFields += 1
    }
  }

  const lastRun = db.prepare(`
    SELECT finished_at
    FROM extraction_runs
    WHERE instance_id = ? AND status = 'succeeded'
    ORDER BY finished_at DESC
    LIMIT 1
  `).get(instance.id) as { finished_at: string } | undefined

  return {
    crfData: {
      groups,
      _extracted_at: lastRun?.finished_at || null,
      _extraction_mode: 'full',
      _change_logs: [],
      _task_results: [],
      _documents: {},
    },
    crfCompleteness: totalFields > 0 ? String(Math.round((filledFields / totalFields) * 100)) : '0',
    instanceId: instance.id,
  }
}

function getLatestProjectExtractionTask(projectId: string) {
  return db.prepare(`
    SELECT *
    FROM project_extraction_tasks
    WHERE project_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(projectId) as any
}

function summarizeProjectTask(taskRow: any) {
  if (!taskRow) return null
  const jobIds = normalizeStringList(parseJsonArray(taskRow.job_ids_json))
  const patientIds = normalizeStringList(parseJsonArray(taskRow.patient_ids_json))
  const documentIds = normalizeStringList(parseJsonArray(taskRow.document_ids_json))
  const targetGroups = normalizeStringList(parseJsonArray(taskRow.target_groups_json))
  const summary = parseJsonObject(taskRow.summary_json)

  const jobStatusRows = jobIds.length > 0
    ? (db.prepare(`
        SELECT id, patient_id, document_id, status, last_error, started_at, completed_at, updated_at
        FROM ehr_extraction_jobs
        WHERE id IN (${jobIds.map(() => '?').join(',')})
      `).all(...jobIds) as any[])
    : []

  let pending = 0
  let running = 0
  let completed = 0
  let failed = 0
  const errors: any[] = []

  for (const job of jobStatusRows) {
    if (job.status === 'pending') pending += 1
    else if (job.status === 'running') running += 1
    else if (job.status === 'completed') completed += 1
    else if (job.status === 'failed') {
      failed += 1
      errors.push({
        job_id: job.id,
        patient_id: job.patient_id,
        document_id: job.document_id,
        message: job.last_error || '抽取失败',
      })
    }
  }

  const total = jobIds.length
  let status = String(taskRow.status || 'pending')
  if (status !== 'cancelled' && total > 0) {
    if (failed === total) {
      status = 'failed'
    } else if (completed + failed === total) {
      status = failed > 0 ? 'completed_with_errors' : 'completed'
    } else if (running > 0) {
      status = 'running'
    } else if (pending > 0) {
      status = 'pending'
    }
  } else if (status !== 'cancelled' && total === 0) {
    status = summary.submitted_job_count > 0 ? 'running' : 'idle'
  }

  const progress = total > 0 ? Math.round(((completed + failed) / total) * 100) : 0

  return {
    task_id: taskRow.id,
    project_id: taskRow.project_id,
    schema_id: taskRow.schema_id,
    status,
    mode: taskRow.mode || 'incremental',
    target_groups: targetGroups,
    patient_ids: patientIds,
    document_ids: documentIds,
    job_ids: jobIds,
    total,
    completed,
    failed,
    running,
    pending,
    success_count: total > 0 ? Math.max(0, patientIds.length - errors.length) : 0,
    error_count: failed,
    progress,
    started_at: taskRow.started_at || taskRow.created_at,
    finished_at: taskRow.finished_at || null,
    summary: {
      ...summary,
      submitted_job_count: total,
      submitted_patient_count: patientIds.length,
      submitted_document_count: documentIds.length,
    },
    errors,
  }
}

function persistProjectTaskSummary(task: any) {
  if (!task?.task_id) return task
  db.prepare(`
    UPDATE project_extraction_tasks
    SET
      status = ?,
      summary_json = ?,
      finished_at = CASE
        WHEN ? IN ('completed', 'completed_with_errors', 'failed', 'cancelled') THEN COALESCE(finished_at, ?)
        ELSE finished_at
      END,
      updated_at = ?
    WHERE id = ?
  `).run(
    task.status,
    JSON.stringify(task.summary || {}),
    task.status,
    nowIso(),
    nowIso(),
    task.task_id
  )
  return task
}

/**
 * GET /api/v1/projects
 * 项目列表（与前端科研数据集列表字段对齐）
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(req.query.page_size) || 100))
    const offset = (page - 1) * pageSize
    const status = req.query.status != null ? String(req.query.status).trim() : ''
    const search = req.query.search != null ? String(req.query.search).trim() : ''

    let sql = `
      SELECT p.*, s.name AS schema_name,
        (SELECT COUNT(*) FROM project_patients pp WHERE pp.project_id = p.id) AS actual_patient_count
      FROM projects p
      LEFT JOIN schemas s ON s.id = p.schema_id
      WHERE 1=1
    `
    const params: string[] = []
    if (status) {
      sql += ` AND p.status = ?`
      params.push(status)
    }
    if (search) {
      sql += ` AND p.project_name LIKE ?`
      params.push(`%${search}%`)
    }
    sql += ` ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`
    params.push(String(pageSize), String(offset))

    const rows = db.prepare(sql).all(...params) as any[]

    let countSql = `SELECT COUNT(*) AS c FROM projects p WHERE 1=1`
    const countParams: string[] = []
    if (status) {
      countSql += ` AND p.status = ?`
      countParams.push(status)
    }
    if (search) {
      countSql += ` AND p.project_name LIKE ?`
      countParams.push(`%${search}%`)
    }
    const totalRow = db.prepare(countSql).get(...countParams) as { c: number }

    const data = rows.map((p) => ({
      id: p.id,
      project_code: typeof p.id === 'string' && p.id.length >= 8 ? p.id.substring(0, 8) : p.id,
      project_name: p.project_name,
      description: p.description ?? '',
      status: p.status,
      schema_id: p.schema_id,
      crf_template_id: p.schema_id,
      template_scope_config: {
        template_id: p.schema_id,
        template_name: p.schema_name || 'CRF 模板',
      },
      actual_patient_count: p.actual_patient_count ?? 0,
      principal_investigator_name: p.principal_investigator_name ?? null,
      principal_investigator_id: null,
      created_at: p.created_at,
      updated_at: p.updated_at,
      avg_completeness: 0,
    }))

    return res.json({
      success: true,
      code: 0,
      message: 'ok',
      data,
      pagination: {
        total: totalRow?.c ?? 0,
        page,
        page_size: pageSize,
      },
    })
  } catch (err: any) {
    console.error('[GET /projects]', err)
    if (String(err?.message || '').includes('no such table: projects')) {
      return res.json({
        success: true,
        code: 0,
        message: 'projects 表尚未创建，返回空列表',
        data: [],
        pagination: { total: 0, page: 1, page_size: 100 },
      })
    }
    return res.status(500).json({
      success: false,
      code: 500,
      message: err?.message || '服务器错误',
      data: null,
    })
  }
})

/**
 * POST /api/v1/projects
 * 新建科研项目，写入 projects；可选同时写入 project_patients（受试者）
 *
 * Body:
 * - project_name (必填)
 * - schema_id 或 crf_template_id (必填，对应 schemas.id)
 * - description (可选)
 * - principal_investigator_name (可选)
 * - principal_investigator_id (可选，暂无用户表时写入 name 列作占位)
 * - status (可选，默认 draft)
 * - patient_ids (可选，患者 id 字符串数组)
 * - selected_patients (可选，与前端向导兼容：{ id }[] 或 id[]）
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const project_name = String((body as any).project_name ?? '').trim()
    if (!project_name) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: '缺少必填字段：project_name',
        data: null,
      })
    }

    const b = body as Record<string, unknown>
    const schemaIdRaw = b.schema_id ?? b.crf_template_id
    const schema_id =
      schemaIdRaw != null && schemaIdRaw !== '' ? String(schemaIdRaw).trim() : ''
    if (!schema_id) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: '缺少必填字段：schema_id 或 crf_template_id（对应 schemas 表主键）',
        data: null,
      })
    }

    const schemaRow = db.prepare(`SELECT id FROM schemas WHERE id = ?`).get(schema_id) as { id: string } | undefined
    if (!schemaRow) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: '指定的 schema / CRF 模板不存在',
        data: null,
      })
    }

    const description =
      b.description != null && String(b.description).trim() !== '' ? String(b.description) : null

    let principal_investigator_name: string | null = null
    if (b.principal_investigator_name != null && String(b.principal_investigator_name).trim() !== '') {
      principal_investigator_name = String(b.principal_investigator_name).trim()
    } else if (b.principal_investigator_id != null && String(b.principal_investigator_id).trim() !== '') {
      principal_investigator_name = String(b.principal_investigator_id).trim()
    }

    let status = b.status != null ? String(b.status).trim() : 'draft'
    if (!ALLOWED_STATUS.has(status)) {
      status = 'draft'
    }

    const rawPatients = b.patient_ids ?? b.selected_patients
    const patient_ids: string[] = []
    if (Array.isArray(rawPatients)) {
      for (const item of rawPatients) {
        if (typeof item === 'string' && item.trim()) {
          patient_ids.push(item.trim())
        } else if (item && typeof item === 'object' && 'id' in item && String((item as any).id).trim()) {
          patient_ids.push(String((item as any).id).trim())
        }
      }
    }
    const uniquePatientIds = [...new Set(patient_ids)]

    const stmtPatient = db.prepare(`SELECT id FROM patients WHERE id = ?`)
    for (const pid of uniquePatientIds) {
      if (!stmtPatient.get(pid)) {
        return res.status(400).json({
          success: false,
          code: 400,
          message: `患者不存在：${pid}`,
          data: null,
        })
      }
    }

    const id = randomUUID()
    const ts = nowIso()

    const insertProject = db.prepare(`
      INSERT INTO projects (id, project_name, description, principal_investigator_name, schema_id, status, created_at, updated_at)
      VALUES (@id, @project_name, @description, @principal_investigator_name, @schema_id, @status, @created_at, @updated_at)
    `)
    const insertEnrollment = db.prepare(`
      INSERT INTO project_patients (id, project_id, patient_id, enrolled_at, subject_label, metadata)
      VALUES (@id, @project_id, @patient_id, @enrolled_at, NULL, '{}')
    `)

    const run = db.transaction(() => {
      insertProject.run({
        id,
        project_name,
        description,
        principal_investigator_name,
        schema_id,
        status,
        created_at: ts,
        updated_at: ts,
      })
      for (const patient_id of uniquePatientIds) {
        insertEnrollment.run({
          id: randomUUID(),
          project_id: id,
          patient_id,
          enrolled_at: ts,
        })
      }
    })
    run()

    const row = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as Record<string, unknown>
    const enrolled = db
      .prepare(`SELECT COUNT(*) AS c FROM project_patients WHERE project_id = ?`)
      .get(id) as { c: number }

    return res.status(201).json({
      success: true,
      code: 0,
      message: '项目已创建',
      data: {
        ...row,
        enrolled_patient_count: enrolled?.c ?? 0,
      },
    })
  } catch (err: any) {
    console.error('[POST /projects]', err)
    const msg = err?.message || '创建项目失败'
    if (String(msg).includes('no such table: projects')) {
      return res.status(503).json({
        success: false,
        code: 503,
        message: '数据库缺少 projects 表，请升级 schema 或执行 backend 增量迁移后重启',
        data: null,
      })
    }
    return res.status(500).json({
      success: false,
      code: 500,
      message: msg,
      data: null,
    })
  }
})

function paramId(v: string | string[] | undefined): string {
  const x = Array.isArray(v) ? v[0] : v
  return String(x ?? '').trim()
}

/**
 * GET /api/v1/projects/:projectId/patients
 */
router.get('/:projectId/patients', (req: Request, res: Response) => {
  try {
    const projectId = paramId(req.params.projectId)
    if (!projectId) {
      return res.status(400).json({ success: false, code: 400, message: '缺少 projectId', data: null })
    }
    const proj = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(projectId) as { id: string } | undefined
    if (!proj) {
      return res.status(404).json({ success: false, code: 404, message: '项目不存在', data: null })
    }

    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(req.query.page_size) || 20))
    const offset = (page - 1) * pageSize

    const rows = db
      .prepare(
        `
      SELECT pp.id AS enrollment_id, pp.patient_id, pp.enrolled_at, pp.subject_label,
             p.name AS patient_name, p.metadata
      FROM project_patients pp
      JOIN patients p ON p.id = pp.patient_id
      WHERE pp.project_id = ?
      ORDER BY pp.enrolled_at DESC
      LIMIT ? OFFSET ?
    `
      )
      .all(projectId, pageSize, offset) as any[]

    const totalRow = db
      .prepare(`SELECT COUNT(*) AS c FROM project_patients WHERE project_id = ?`)
      .get(projectId) as { c: number }

    const projectRow = db.prepare(`SELECT schema_id FROM projects WHERE id = ?`).get(projectId) as { schema_id: string } | undefined
    const projectSchemaId = projectRow?.schema_id || null
    const { fieldMap } = getProjectTemplateMeta(projectSchemaId)

    const data = rows.map((r) => {
      let meta: any = {}
      try {
        meta = JSON.parse(r.metadata || '{}')
      } catch {
        meta = {}
      }
      const subject_id = r.subject_label || (typeof r.patient_id === 'string' ? r.patient_id.substring(0, 8) : '')

      const { crfData, crfCompleteness } = buildProjectCrfData(r.patient_id, projectSchemaId, fieldMap)

      return {
        id: r.enrollment_id,
        patient_id: r.patient_id,
        patient_name: r.patient_name || '未知患者',
        patient_gender: meta['患者性别'] || null,
        patient_age: meta['患者年龄'] || null,
        patient_birth_date: meta['出生日期'] || null,
        subject_id,
        group_name: null,
        status: 'enrolled',
        enrollment_date: r.enrolled_at,
        crf_data: crfData,
        crf_completeness: crfCompleteness,
      }
    })

    return res.json({
      success: true,
      code: 0,
      message: 'ok',
      data,
      pagination: {
        total: totalRow?.c ?? 0,
        page,
        page_size: pageSize,
      },
    })
  } catch (err: any) {
    console.error('[GET /projects/:projectId/patients]', err)
    return res.status(500).json({
      success: false,
      code: 500,
      message: err?.message || '服务器错误',
      data: null,
    })
  }
})

/**
 * POST /api/v1/projects/:projectId/patients
 * Body: { patient_ids: string[] } 或 { patient_id: string }
 */
router.post('/:projectId/patients', (req: Request, res: Response) => {
  try {
    const projectId = paramId(req.params.projectId)
    if (!projectId) {
      return res.status(400).json({ success: false, code: 400, message: '缺少 projectId', data: null })
    }
    const proj = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(projectId) as { id: string } | undefined
    if (!proj) {
      return res.status(404).json({ success: false, code: 404, message: '项目不存在', data: null })
    }

    const b = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>
    const raw: string[] = []
    if (Array.isArray(b.patient_ids)) {
      for (const x of b.patient_ids) {
        if (typeof x === 'string' && x.trim()) raw.push(x.trim())
      }
    } else if (b.patient_id != null && String(b.patient_id).trim()) {
      raw.push(String(b.patient_id).trim())
    }
    const patient_ids = [...new Set(raw)]
    if (patient_ids.length === 0) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: '缺少 patient_id 或 patient_ids',
        data: null,
      })
    }

    const stmtCheck = db.prepare(`SELECT id FROM patients WHERE id = ?`)
    for (const pid of patient_ids) {
      if (!stmtCheck.get(pid)) {
        return res.status(400).json({
          success: false,
          code: 400,
          message: `患者不存在：${pid}`,
          data: null,
        })
      }
    }

    const ts = nowIso()
    const insert = db.prepare(`
      INSERT OR IGNORE INTO project_patients (id, project_id, patient_id, enrolled_at, subject_label, metadata)
      VALUES (@id, @project_id, @patient_id, @enrolled_at, NULL, '{}')
    `)
    const updateProj = db.prepare(`UPDATE projects SET updated_at = ? WHERE id = ?`)

    let added = 0
    let skipped = 0
    const run = db.transaction(() => {
      for (const patient_id of patient_ids) {
        const r = insert.run({
          id: randomUUID(),
          project_id: projectId,
          patient_id,
          enrolled_at: ts,
        })
        if (r.changes > 0) added += 1
        else skipped += 1
      }
      updateProj.run(ts, projectId)
    })
    run()

    const total = (db.prepare(`SELECT COUNT(*) AS c FROM project_patients WHERE project_id = ?`).get(projectId) as any)
      ?.c ?? 0

    return res.status(201).json({
      success: true,
      code: 0,
      message: skipped > 0 ? `已添加 ${added} 人，${skipped} 人已在项目中` : `已添加 ${added} 人`,
      data: { added, skipped, total_enrolled: total, patient_ids },
    })
  } catch (err: any) {
    console.error('[POST /projects/:projectId/patients]', err)
    return res.status(500).json({
      success: false,
      code: 500,
      message: err?.message || '服务器错误',
      data: null,
    })
  }
})

/**
 * DELETE /api/v1/projects/:projectId/patients/:patientId
 */
router.delete('/:projectId/patients/:patientId', (req: Request, res: Response) => {
  try {
    const projectId = paramId(req.params.projectId)
    const patientId = paramId(req.params.patientId)
    if (!projectId || !patientId) {
      return res.status(400).json({ success: false, code: 400, message: '缺少参数', data: null })
    }
    const r = db
      .prepare(`DELETE FROM project_patients WHERE project_id = ? AND patient_id = ?`)
      .run(projectId, patientId)
    db.prepare(`UPDATE projects SET updated_at = ? WHERE id = ?`).run(nowIso(), projectId)
    if (r.changes === 0) {
      return res.status(404).json({ success: false, code: 404, message: '未找到该入组记录', data: null })
    }
    return res.json({ success: true, code: 0, message: '已移出项目', data: null })
  } catch (err: any) {
    console.error('[DELETE /projects/.../patients/...]', err)
    return res.status(500).json({
      success: false,
      code: 500,
      message: err?.message || '服务器错误',
      data: null,
    })
  }
})

/**
 * GET /api/v1/projects/:projectId/patients/:patientId
 */
router.get('/:projectId/patients/:patientId', (req: Request, res: Response) => {
  try {
    const projectId = paramId(req.params.projectId)
    const patientId = paramId(req.params.patientId)
    if (!projectId || !patientId) {
      return res.status(400).json({ success: false, code: 400, message: '缺少参数', data: null })
    }

    const project = db.prepare(`
      SELECT p.id, p.project_name, p.schema_id, s.name AS schema_name
      FROM projects p
      LEFT JOIN schemas s ON s.id = p.schema_id
      WHERE p.id = ?
    `).get(projectId) as any
    if (!project) {
      return res.status(404).json({ success: false, code: 404, message: '项目不存在', data: null })
    }

    const row = db.prepare(`
      SELECT
        pp.id AS enrollment_id,
        pp.project_id,
        pp.patient_id,
        pp.enrolled_at,
        pp.subject_label,
        p.name AS patient_name,
        p.metadata AS patient_metadata
      FROM project_patients pp
      JOIN patients p ON p.id = pp.patient_id
      WHERE pp.project_id = ? AND pp.patient_id = ?
      LIMIT 1
    `).get(projectId, patientId) as any

    if (!row) {
      return res.status(404).json({ success: false, code: 404, message: '项目中未找到该患者', data: null })
    }

    const meta = parseJsonObject(row.patient_metadata)
    const { fieldMap } = getProjectTemplateMeta(project.schema_id)
    const { crfData, crfCompleteness, instanceId } = buildProjectCrfData(patientId, project.schema_id, fieldMap)

    const documents = db.prepare(`
      SELECT
        d.id,
        d.file_name,
        d.document_sub_type,
        d.status,
        d.created_at,
        d.updated_at,
        d.extract_status
      FROM documents d
      WHERE d.patient_id = ? AND d.status != 'deleted'
      ORDER BY d.created_at DESC
    `).all(patientId) as any[]

    return res.json({
      success: true,
      code: 0,
      message: 'ok',
      data: {
        id: row.enrollment_id,
        project_id: projectId,
        patient_id: patientId,
        patient_name: row.patient_name || '未知患者',
        patient_gender: meta['患者性别'] || null,
        patient_age: meta['患者年龄'] || null,
        patient_birth_date: meta['出生日期'] || null,
        patient_phone: meta['联系电话'] || null,
        patient_code: typeof patientId === 'string' ? patientId.slice(0, 8) : patientId,
        patient_diagnosis: Array.isArray(meta['诊断']) ? meta['诊断'] : [],
        subject_id: row.subject_label || (typeof patientId === 'string' ? patientId.slice(0, 8) : ''),
        group_name: null,
        status: 'enrolled',
        enrollment_date: row.enrolled_at,
        document_count: documents.length,
        schema_instance_id: instanceId,
        crf_data: crfData,
        crf_completeness: Number(crfCompleteness) || 0,
        documents,
      },
    })
  } catch (err: any) {
    console.error('[GET /projects/:projectId/patients/:patientId]', err)
    return res.status(500).json({
      success: false,
      code: 500,
      message: err?.message || '服务器错误',
      data: null,
    })
  }
})

/**
 * GET /api/v1/projects/:projectId
 */
router.get('/:projectId', (req: Request, res: Response) => {
  try {
    const projectId = paramId(req.params.projectId)
    if (!projectId) {
      return res.status(400).json({ success: false, code: 400, message: '缺少 projectId', data: null })
    }
    const row = db
      .prepare(
        `
      SELECT p.*, s.name AS schema_name,
        (SELECT COUNT(*) FROM project_patients pp WHERE pp.project_id = p.id) AS actual_patient_count
      FROM projects p
      LEFT JOIN schemas s ON s.id = p.schema_id
      WHERE p.id = ?
    `
      )
      .get(projectId) as any
    if (!row) {
      return res.status(404).json({ success: false, code: 404, message: '项目不存在', data: null })
    }

    const { schemaRow, schemaJson, fieldGroups, fieldMap } = getProjectTemplateMeta(row.schema_id)

    return res.json({
      success: true,
      code: 0,
      message: 'ok',
      data: {
        id: row.id,
        project_name: row.project_name,
        description: row.description ?? '',
        status: row.status,
        schema_id: row.schema_id,
        expected_patient_count: null,
        actual_patient_count: row.actual_patient_count ?? 0,
        avg_completeness: 0,
        updated_at: row.updated_at,
        created_at: row.created_at,
        principal_investigator_name: row.principal_investigator_name,
        template_scope_config: {
          template_id: row.schema_id,
          template_name: row.schema_name || 'CRF 模板',
          schema_version: schemaRow?.version || null,
        },
        template_info: {
          template_id: row.schema_id,
          template_name: row.schema_name || 'CRF 模板',
          field_groups: fieldGroups,
          db_field_mapping: {
            enabled: true,
            field_map: fieldMap,
          },
        },
        schema_json: schemaJson,
      },
    })
  } catch (err: any) {
    console.error('[GET /projects/:projectId]', err)
    return res.status(500).json({
      success: false,
      code: 500,
      message: err?.message || '服务器错误',
      data: null,
    })
  }
})

/**
 * POST /api/v1/projects/:projectId/crf/extraction
 * 启动项目的 CRF 抽取任务
 */
router.post('/:projectId/crf/extraction', async (req: Request, res: Response) => {
  try {
    const projectId = paramId(req.params.projectId)
    if (!projectId) {
      return res.status(400).json({ success: false, code: 400, message: '缺少 projectId', data: null })
    }

    const proj = db.prepare(`SELECT id, schema_id FROM projects WHERE id = ?`).get(projectId) as { id: string, schema_id: string } | undefined
    if (!proj) {
      return res.status(404).json({ success: false, code: 404, message: '项目不存在', data: null })
    }
    if (!proj.schema_id) {
      return res.status(400).json({ success: false, code: 400, message: '项目未绑定 CRF 模板/schema', data: null })
    }

    const existingTask = persistProjectTaskSummary(summarizeProjectTask(getLatestProjectExtractionTask(projectId)))
    if (existingTask && ['pending', 'running'].includes(existingTask.status)) {
      return res.status(409).json({
        success: false,
        code: 40901,
        message: '该项目已有正在进行的抽取任务',
        data: {
          has_active_task: true,
          active_task: existingTask,
        },
      })
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, any>
    const mode = String(body.mode || 'incremental').trim() || 'incremental'
    const targetGroups = normalizeStringList(Array.isArray(body.target_groups) ? body.target_groups : [])
    let targetPatients: string[] = []

    if (Array.isArray(body.patient_ids) && body.patient_ids.length > 0) {
      targetPatients = normalizeStringList(body.patient_ids)
    } else {
      const rows = db.prepare(`SELECT patient_id FROM project_patients WHERE project_id = ?`).all(projectId) as any[]
      targetPatients = normalizeStringList(rows.map((r) => r.patient_id))
    }

    if (targetPatients.length === 0) {
      return res.status(400).json({ success: false, code: 400, message: '该项目下无可用的患者进行抽取', data: null })
    }

    const stmtDocs = db.prepare(`
      SELECT id
      FROM documents
      WHERE patient_id = ? AND status != 'deleted' AND status IN ('ocr_succeeded', 'archived')
      ORDER BY created_at ASC
    `)
    const taskId = randomUUID()
    const startedAt = nowIso()
    const submittedJobIds: string[] = []
    const submittedDocumentIds: string[] = []
    const submittedPatientIds: string[] = []
    const skippedPatients: any[] = []

    for (const patientId of targetPatients) {
      const docRows = stmtDocs.all(patientId) as any[]
      const docIds = normalizeStringList(docRows.map((r) => r.id))

      if (docIds.length === 0) {
        skippedPatients.push({ patient_id: patientId, reason: 'no_documents' })
        continue
      }

      const response = await fetch(`${CRF_SERVICE_URL}/api/extract/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patient_id: patientId,
            schema_id: proj.schema_id,
            document_ids: docIds,
            instance_type: 'project_crf',
          })
        })

      if (!response.ok) {
        const errorText = await response.text()
        return res.status(response.status).json({
          success: false,
          code: response.status,
          message: errorText || '提交科研抽取任务失败',
          data: null,
        })
      }

      const result = await response.json()
      const jobs = Array.isArray(result?.jobs) ? result.jobs : []
      const jobIds = normalizeStringList(jobs.map((job: any) => job?.job_id))
      if (jobIds.length === 0) {
        skippedPatients.push({ patient_id: patientId, reason: 'no_new_jobs' })
        continue
      }

      submittedPatientIds.push(patientId)
      submittedJobIds.push(...jobIds)
      submittedDocumentIds.push(...docIds)
    }

    db.prepare(`
      INSERT INTO project_extraction_tasks (
        id, project_id, schema_id, status, mode, target_groups_json, patient_ids_json,
        job_ids_json, document_ids_json, summary_json, started_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      taskId,
      projectId,
      proj.schema_id,
      submittedJobIds.length > 0 ? 'running' : 'completed',
      mode,
      JSON.stringify(targetGroups),
      JSON.stringify(submittedPatientIds),
      JSON.stringify(submittedJobIds),
      JSON.stringify(submittedDocumentIds),
      JSON.stringify({
        requested_patient_count: targetPatients.length,
        submitted_patient_count: submittedPatientIds.length,
        submitted_document_count: submittedDocumentIds.length,
        skipped_patients: skippedPatients,
      }),
      startedAt,
      startedAt,
      startedAt
    )

    const task = persistProjectTaskSummary(summarizeProjectTask(getLatestProjectExtractionTask(projectId)))

    return res.json({
      success: true,
      code: 0,
      message: submittedJobIds.length > 0
        ? `已为 ${submittedPatientIds.length} 位患者提交抽取任务`
        : '没有找到可提交的新抽取任务',
      data: {
        task_id: task?.task_id || taskId,
        has_active_task: !!task && ['pending', 'running'].includes(task.status),
        submitted_patient_count: submittedPatientIds.length,
        submitted_document_count: submittedDocumentIds.length,
        skipped_patients: skippedPatients,
        active_task: task,
      },
    })
  } catch (err: any) {
    console.error('[POST /projects/:projectId/crf/extraction]', err)
    return res.status(500).json({ success: false, code: 500, message: err?.message || '服务器错误', data: null })
  }
})

/**
 * GET /api/v1/projects/:projectId/crf/extraction/progress
 * 动态计算整个项目的抽取进度（基于当前 projects 关联的患者及其文档的 ehr_extraction_jobs）
 */
router.get('/:projectId/crf/extraction/progress', (req: Request, res: Response) => {
  try {
    const projectId = paramId(req.params.projectId)
    const proj = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(projectId) as { id: string } | undefined
    if (!proj) {
      return res.status(404).json({ success: false, code: 404, message: '项目不存在', data: null })
    }
    const taskId = String(req.query.task_id || '').trim()
    const taskRow = taskId
      ? (db.prepare(`SELECT * FROM project_extraction_tasks WHERE id = ? AND project_id = ?`).get(taskId, projectId) as any)
      : getLatestProjectExtractionTask(projectId)
    if (!taskRow) {
      return res.json({
        success: true,
        code: 0,
        data: {
          task_id: null,
          status: 'idle',
          total: 0,
          completed: 0,
          failed: 0,
          running: 0,
          pending: 0,
          progress: 0,
          success_count: 0,
          error_count: 0,
          errors: [],
        },
      })
    }

    return res.json({
      success: true,
      code: 0,
      data: persistProjectTaskSummary(summarizeProjectTask(taskRow)),
    })
  } catch (err: any) {
     console.error('[GET /projects/:projectId/crf/extraction/progress]', err)
     return res.status(500).json({ success: false, code: 500, message: err?.message, data: null })
  }
})

/**
 * GET /api/v1/projects/:projectId/crf/extraction/active
 * 查询是否有正在进行的活跃抽取
 */
router.get('/:projectId/crf/extraction/active', (req: Request, res: Response) => {
  try {
    const projectId = paramId(req.params.projectId)
    const proj = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(projectId) as { id: string } | undefined
    if (!proj) {
      return res.status(404).json({ success: false, code: 404, message: '项目不存在', data: null })
    }
    const task = persistProjectTaskSummary(summarizeProjectTask(getLatestProjectExtractionTask(projectId)))
    return res.json({
      success: true,
      code: 0,
      data: {
        has_active_task: !!task && ['pending', 'running'].includes(task.status),
        task_id: task?.task_id || null,
        status: task?.status || 'idle',
        active_task: task,
      },
    })
  } catch (err: any) {
     console.error('[GET /projects/:projectId/crf/extraction/active]', err)
     return res.status(500).json({ success: false, code: 500, message: err?.message, data: null })
  }
})

router.delete('/:projectId/crf/extraction', (req: Request, res: Response) => {
  try {
    const projectId = paramId(req.params.projectId)
    if (!projectId) {
      return res.status(400).json({ success: false, code: 400, message: '缺少 projectId', data: null })
    }
    const task = persistProjectTaskSummary(summarizeProjectTask(getLatestProjectExtractionTask(projectId)))
    if (!task || !['pending', 'running'].includes(task.status)) {
      return res.json({ success: true, code: 0, message: '当前无进行中的抽取任务', data: null })
    }

    const cancelledAt = nowIso()
    if (task.job_ids.length > 0) {
      db.prepare(`
        UPDATE ehr_extraction_jobs
        SET status = 'failed', last_error = ?, completed_at = ?, updated_at = ?
        WHERE id IN (${task.job_ids.map(() => '?').join(',')})
          AND status IN ('pending', 'running')
      `).run('任务被用户取消', cancelledAt, cancelledAt, ...task.job_ids)
    }
    db.prepare(`
      UPDATE project_extraction_tasks
      SET status = 'cancelled', cancelled_at = ?, finished_at = ?, updated_at = ?
      WHERE id = ?
    `).run(cancelledAt, cancelledAt, cancelledAt, task.task_id)

    return res.json({
      success: true,
      code: 0,
      message: '抽取任务已取消',
      data: {
        task_id: task.task_id,
        status: 'cancelled',
      },
    })
  } catch (err: any) {
    console.error('[DELETE /projects/:projectId/crf/extraction]', err)
    return res.status(500).json({ success: false, code: 500, message: err?.message || '服务器错误', data: null })
  }
})

router.post('/:projectId/crf/extraction/reset', (req: Request, res: Response) => {
  try {
    const projectId = paramId(req.params.projectId)
    if (!projectId) {
      return res.status(400).json({ success: false, code: 400, message: '缺少 projectId', data: null })
    }
    const latest = getLatestProjectExtractionTask(projectId)
    if (!latest) {
      return res.json({ success: true, code: 0, message: '当前无抽取任务可重置', data: null })
    }

    const task = persistProjectTaskSummary(summarizeProjectTask(latest))
    const resetAt = nowIso()
    if (task?.job_ids?.length > 0) {
      db.prepare(`
        UPDATE ehr_extraction_jobs
        SET status = 'failed', last_error = ?, completed_at = ?, updated_at = ?
        WHERE id IN (${task.job_ids.map(() => '?').join(',')})
          AND status IN ('pending', 'running')
      `).run('任务已被重置', resetAt, resetAt, ...task.job_ids)
    }
    db.prepare(`
      UPDATE project_extraction_tasks
      SET status = 'cancelled', cancelled_at = COALESCE(cancelled_at, ?), finished_at = COALESCE(finished_at, ?), updated_at = ?
      WHERE id = ?
    `).run(resetAt, resetAt, resetAt, latest.id)

    return res.json({
      success: true,
      code: 0,
      message: '项目抽取状态已重置',
      data: {
        task_id: latest.id,
        status: 'cancelled',
      },
    })
  } catch (err: any) {
    console.error('[POST /projects/:projectId/crf/extraction/reset]', err)
    return res.status(500).json({ success: false, code: 500, message: err?.message || '服务器错误', data: null })
  }
})

export default router
