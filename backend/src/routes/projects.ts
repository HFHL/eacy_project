import { Router, Request, Response } from 'express'
import { randomUUID } from 'crypto'
import db from '../db.js'

const router = Router()

function nowIso() {
  return new Date().toISOString()
}

const ALLOWED_STATUS = new Set(['draft', 'active', 'paused', 'completed'])

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

    const data = rows.map((r) => {
      let meta: any = {}
      try {
        meta = JSON.parse(r.metadata || '{}')
      } catch {
        meta = {}
      }
      const subject_id = r.subject_label || (typeof r.patient_id === 'string' ? r.patient_id.substring(0, 8) : '')
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
        crf_data: { groups: {} },
        crf_completeness: '0',
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
        },
        template_info: {
          field_groups: [],
          db_field_mapping: {},
        },
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

export default router
