import { Router, Request, Response } from 'express'
import db from '../db.js'

const router = Router()

/**
 * GET /api/v1/schemas
 * 列出可用 schema，供新建科研项目等选择 schema_id。
 *
 * Query:
 * - include_inactive=1：包含未启用的行
 * - schema_type：按类型过滤；默认 **crf**（仅 CRF 模板）。传 all 或 * 表示不按类型过滤
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.include_inactive !== '1'
    const typeParam = req.query.schema_type
    const wantAllTypes = typeParam === 'all' || typeParam === '*'
    const schemaTypeFilter = wantAllTypes
      ? null
      : typeParam != null && String(typeParam).trim() !== ''
        ? String(typeParam).trim()
        : 'crf'

    const parts: string[] = []
    const params: string[] = []
    if (activeOnly) {
      parts.push('is_active = 1')
    }
    if (schemaTypeFilter) {
      parts.push('schema_type = ?')
      params.push(schemaTypeFilter)
    }

    let sql = `SELECT id, name, code, version, schema_type, is_active, created_at, updated_at FROM schemas`
    if (parts.length) {
      sql += ` WHERE ${parts.join(' AND ')}`
    }
    sql += ` ORDER BY code ASC, version DESC`
    const rows = db.prepare(sql).all(...params) as any[]
    return res.json({
      success: true,
      code: 0,
      message: 'ok',
      data: rows,
    })
  } catch (err: any) {
    console.error('[GET /schemas]', err)
    return res.status(500).json({
      success: false,
      code: 500,
      message: err?.message || '服务器错误',
      data: null,
    })
  }
})

/**
 * GET /api/v1/schemas/:id
 * 单条 schema（含 content_json），供 CRF 设计器加载
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id || '').trim()
    if (!id) {
      return res.status(400).json({ success: false, code: 400, message: '缺少 id', data: null })
    }
    const row = db.prepare(`SELECT * FROM schemas WHERE id = ?`).get(id) as Record<string, unknown> | undefined
    if (!row) {
      return res.status(404).json({ success: false, code: 404, message: 'schema 不存在', data: null })
    }
    let schemaObj: unknown = {}
    const raw = row.content_json
    if (typeof raw === 'string') {
      try {
        schemaObj = JSON.parse(raw || '{}')
      } catch {
        schemaObj = {}
      }
    } else if (raw != null && typeof raw === 'object') {
      schemaObj = raw
    }

    return res.json({
      success: true,
      code: 0,
      message: 'ok',
      data: {
        id: row.id,
        name: row.name,
        template_name: row.name,
        code: row.code,
        schema_type: row.schema_type,
        version: row.version,
        is_active: row.is_active,
        is_published: !!row.is_active,
        created_at: row.created_at,
        updated_at: row.updated_at,
        schema_json: schemaObj,
        content_json: schemaObj,
        designer: null,
        layout_config: null,
        category: '通用',
        description: '',
        source: 'database',
      },
    })
  } catch (err: any) {
    console.error('[GET /schemas/:id]', err)
    return res.status(500).json({
      success: false,
      code: 500,
      message: err?.message || '服务器错误',
      data: null,
    })
  }
})

export default router
