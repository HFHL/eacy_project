import { Router, Request, Response } from 'express'
import db from '../db.js'

const router = Router()

router.get('/', (req: Request, res: Response) => {
  try {
    const { page = 1, page_size = 20, search } = req.query
    const limit = Number(page_size)
    const offset = (Number(page) - 1) * limit

    let sql = `SELECT * FROM patients`
    const params: string[] = []

    if (search) {
      sql += ` WHERE name LIKE ?`
      params.push(`%${search}%`)
    }

    sql += ` ORDER BY updated_at DESC LIMIT ? OFFSET ?`
    params.push(limit.toString())
    params.push(offset.toString())

    const rows = db.prepare(sql).all(...params) as any[]
    
    // Get total count
    let countSql = `SELECT COUNT(*) as count FROM patients`
    const countParams: string[] = []
    if (search) {
      countSql += ` WHERE name LIKE ?`
      countParams.push(`%${search}%`)
    }
    const countRow = db.prepare(countSql).get(...countParams) as any
    const total = countRow.count

    const stmtDocCount = db.prepare(`SELECT COUNT(*) as cnt FROM documents WHERE patient_id = ? AND status != 'deleted'`)

    const data = rows.map(r => {
      let meta: any = {}
      try { meta = JSON.parse(r.metadata || '{}') } catch {}
      
      const docCountRow = stmtDocCount.get(r.id) as any
      const docCount = docCountRow ? docCountRow.cnt : 0

      // Mock completeness logic
      let filledFields = 0
      const checkFields = ['患者性别', '患者年龄', '出生日期', '联系电话', '机构名称', '科室信息']
      checkFields.forEach(f => {
        if (meta[f]) filledFields++
      })
      const data_completeness = (filledFields / checkFields.length) * 100

      const patient_code = r.id.substring(0, 8)

      return {
        id: r.id,
        patient_code,
        name: r.name || '未知患者',
        gender: meta['患者性别'] || null,
        age: meta['患者年龄'] || null,
        birth_date: meta['出生日期'] || null,
        department_name: meta['科室信息'] || '未设置',
        attending_doctor_name: meta['主治医师'] || '未设置',
        diagnosis: Array.isArray(meta['主要诊断']) ? meta['主要诊断'] : (meta['主要诊断'] ? [meta['主要诊断']] : []),
        tags: [],
        document_count: docCount,
        pending_field_conflict_count: 0,
        has_pending_field_conflicts: false,
        data_completeness: data_completeness.toFixed(1),
        projects: [],
        updated_at: r.updated_at,
        created_at: r.created_at,
        status: 'active'
      }
    })

    const totalDocsRow = db.prepare(`SELECT COUNT(*) as c FROM documents WHERE patient_id IS NOT NULL AND status != 'deleted'`).get() as any

    return res.json({
      success: true,
      code: 0,
      message: 'ok',
      data,
      pagination: {
        total,
        page: Number(page),
        page_size: limit
      },
      statistics: {
        total_documents: totalDocsRow.c || 0,
        average_completeness: 85,
        recently_added: total
      }
    })
  } catch (err: any) {
    console.error('[GET /patients]', err)
    return res.status(500).json({ success: false, code: 500, message: err.message, data: null })
  }
})

export default router
