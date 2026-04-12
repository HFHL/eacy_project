/**
 * EHR Data API — 投影/组装层
 * 从 field_value_selected 读取数据，组装为前端可渲染的 { schema, data } 结构
 */
import { Router, Request, Response } from 'express'
import { randomUUID } from 'crypto'
import db from '../db.js'

const router = Router()

/**
 * GET /api/v1/patients/:patientId/ehr-schema-data
 *
 * 返回该患者的 schema + draftData，前端 SchemaEhrTab 直接消费
 */
router.get('/:patientId/ehr-schema-data', (req: Request, res: Response) => {
  try {
    const { patientId } = req.params

    // 1. 查找该患者的 schema instance
    let instance = db.prepare(`
      SELECT si.id as instance_id, si.schema_id, si.status, si.name as instance_name,
             s.content_json, s.name as schema_name, s.code, s.version
      FROM schema_instances si
      JOIN schemas s ON s.id = si.schema_id
      WHERE si.patient_id = ? AND si.instance_type = 'patient_ehr'
      ORDER BY si.created_at DESC
      LIMIT 1
    `).get(patientId) as any

    if (!instance) {
      // 延迟初始化：查询是否有基准 schema
      const defaultSchema = db.prepare(`SELECT * FROM schemas ORDER BY created_at DESC LIMIT 1`).get() as any
      if (!defaultSchema) {
        return res.json({
          success: false,
          code: 40401,
          message: '系统尚无预设 Schema',
          data: { schema: {}, data: {} }
        })
      }
      
      const newInstanceId = randomUUID()
      db.prepare(`
        INSERT INTO schema_instances (id, patient_id, schema_id, name, instance_type, status)
        VALUES (?, ?, ?, ?, 'patient_ehr', 'draft')
      `).run(newInstanceId, patientId, defaultSchema.id, '自动初始化病历夹')

      instance = {
        instance_id: newInstanceId,
        schema_id: defaultSchema.id,
        status: 'draft',
        instance_name: '自动初始化病历夹',
        content_json: defaultSchema.content_json,
        schema_name: defaultSchema.name,
        code: defaultSchema.code,
        version: defaultSchema.version
      }
    }

    // 2. 解析 schema
    let schema: any = {}
    try {
      schema = JSON.parse(instance.content_json)
    } catch (e) {
      console.error('[ehr-schema-data] Failed to parse schema JSON:', e)
      return res.status(500).json({
        success: false,
        code: 500,
        message: 'Schema JSON 解析失败'
      })
    }

    // 3. 读取所有 field_value_selected，组装为嵌套 JSON
    const selectedRows = db.prepare(`
      SELECT field_path, selected_value_json
      FROM field_value_selected
      WHERE instance_id = ?
      ORDER BY field_path
    `).all(instance.instance_id) as any[]

    const draftData: any = {}

    for (const row of selectedRows) {
      const path = row.field_path  // e.g. "/基本信息/人口学情况/身份信息/患者姓名"
      const parts = path.split('/').filter((p: string) => p !== '')

      if (parts.length === 0) continue

      // Parse the stored JSON value
      let value: any
      try {
        value = JSON.parse(row.selected_value_json)
      } catch {
        value = row.selected_value_json
      }

      // Build nested structure
      let current = draftData
      for (let i = 0; i < parts.length - 1; i++) {
        if (current[parts[i]] === undefined) {
          current[parts[i]] = {}
        }
        // If current node was set as a leaf value but we need to go deeper,
        // wrap it (shouldn't normally happen with correct data)
        if (typeof current[parts[i]] !== 'object' || current[parts[i]] === null) {
          current[parts[i]] = {}
        }
        current = current[parts[i]]
      }

      const lastKey = parts[parts.length - 1]
      current[lastKey] = value
    }

    // 4. Return assembled response
    return res.json({
      success: true,
      code: 0,
      message: 'ok',
      data: {
        schema,
        data: draftData,
        instance: {
          id: instance.instance_id,
          name: instance.instance_name,
          status: instance.status,
          schema_name: instance.schema_name,
          schema_code: instance.code,
          schema_version: instance.version
        }
      }
    })
  } catch (err: any) {
    console.error('[GET ehr-schema-data]', err)
    return res.status(500).json({
      success: false,
      code: 500,
      message: err.message
    })
  }
})

/**
 * PUT /api/v1/patients/:patientId/ehr-schema-data
 *
 * 保存前端编辑后的 draftData
 * 对比现有值，仅对变化字段生成 field_value_candidates 记录（手动修改），
 * 然后更新 field_value_selected
 */
router.put('/:patientId/ehr-schema-data', (req: Request, res: Response) => {
  try {
    const { patientId } = req.params
    const newData = req.body

    if (!newData || typeof newData !== 'object') {
      return res.status(400).json({
        success: false,
        code: 400,
        message: '请求体必须是 JSON 对象'
      })
    }

    // Find instance
    const instance = db.prepare(`
      SELECT id FROM schema_instances
      WHERE patient_id = ? AND instance_type = 'patient_ehr'
      ORDER BY created_at DESC LIMIT 1
    `).get(patientId) as any

    if (!instance) {
      return res.status(404).json({
        success: false,
        code: 404,
        message: '该患者暂无病历夹实例'
      })
    }

    // Read existing selected values into a map
    const existingRows = db.prepare(`
      SELECT field_path, selected_value_json
      FROM field_value_selected
      WHERE instance_id = ?
    `).all(instance.id) as any[]
    const existingMap = new Map<string, string>()
    for (const row of existingRows) {
      existingMap.set(row.field_path, row.selected_value_json)
    }

    // Flatten newData into field paths
    const flatFields: Array<{ path: string; value: string }> = []
    function flatten(obj: any, parts: string[] = []) {
      if (obj === null || obj === undefined) return
      if (Array.isArray(obj)) {
        flatFields.push({ path: '/' + parts.join('/'), value: JSON.stringify(obj) })
        return
      }
      if (typeof obj === 'object') {
        for (const key of Object.keys(obj)) {
          flatten(obj[key], [...parts, key])
        }
        return
      }
      flatFields.push({ path: '/' + parts.join('/'), value: JSON.stringify(obj) })
    }
    flatten(newData)


    const insertCandidate = db.prepare(`
      INSERT INTO field_value_candidates
        (id, instance_id, field_path, value_json, value_type, source_text, confidence, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'user')
    `)

    const upsertSelected = db.prepare(`
      INSERT INTO field_value_selected
        (id, instance_id, field_path, selected_candidate_id, selected_value_json, selected_by)
      VALUES (?, ?, ?, ?, ?, 'user')
      ON CONFLICT(instance_id, COALESCE(section_instance_id, '__null__'), COALESCE(row_instance_id, '__null__'), field_path)
      DO UPDATE SET
        selected_candidate_id = excluded.selected_candidate_id,
        selected_value_json = excluded.selected_value_json,
        selected_by = 'user',
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    `)

    let changedCount = 0
    let totalCount = 0

    const saveAll = db.transaction(() => {
      for (const field of flatFields) {
        totalCount++
        const oldValue = existingMap.get(field.path)

        if (oldValue === field.value) {
          // Value unchanged — skip
          continue
        }

        changedCount++

        // Create a new candidate (extraction history record)
        const candidateId = randomUUID()
        const valueType = field.value.startsWith('[') ? 'array'
          : field.value.startsWith('"') ? 'string'
          : /^\d/.test(field.value) ? 'number'
          : 'string'

        insertCandidate.run(
          candidateId,
          instance.id,
          field.path,
          field.value,
          valueType,
          '用户手动编辑',
          null // no confidence for manual edits
        )

        // Update selected value
        const selectedId = randomUUID()
        upsertSelected.run(selectedId, instance.id, field.path, candidateId, field.value)
      }
    })

    saveAll()

    return res.json({
      success: true,
      code: 0,
      message: '保存成功',
      data: { total_fields: totalCount, changed_fields: changedCount }
    })
  } catch (err: any) {
    console.error('[PUT ehr-schema-data]', err)
    return res.status(500).json({
      success: false,
      code: 500,
      message: err.message
    })
  }
})

/**
 * GET /api/v1/patients/:patientId/ehr-field-history
 *
 * 返回某个字段路径的所有候选值历史记录
 * Query: field_path (required) — 字段路径，如 "基本信息.人口学情况.身份信息.患者姓名"
 * 前端 ModificationHistory 组件直接消费
 */
router.get('/:patientId/ehr-field-history', (req: Request, res: Response) => {
  try {
    const { patientId } = req.params
    const rawFieldPath = req.query.field_path as string

    if (!rawFieldPath) {
      return res.json({
        success: true,
        code: 0,
        data: { history: [] }
      })
    }

    // 前端传点分隔，数据库存斜杠分隔，两者都支持
    let fieldPath = rawFieldPath
    if (!fieldPath.startsWith('/')) {
      fieldPath = '/' + fieldPath.replace(/\./g, '/')
    }

    // Build list of candidate paths to query:
    // 1. Exact path (for scalar fields)
    // 2. Strip trailing /N/subField (for table cell clicks → query parent array)
    // 3. Strip trailing /N (for table row clicks → query parent array)
    // This handles clicks on table rows/cells whose candidates are stored at the array level.
    const pathsToTry: string[] = [fieldPath]
    // Strip /N/subField: e.g. /foo/bar/0/name → /foo/bar
    const cellMatch = fieldPath.match(/^(.+)\/\d+\/.+$/)
    if (cellMatch) {
      pathsToTry.push(cellMatch[1])
    }
    // Strip /N: e.g. /foo/bar/0 → /foo/bar
    const rowMatch = fieldPath.match(/^(.+)\/\d+$/)
    if (rowMatch) {
      pathsToTry.push(rowMatch[1])
    }
    // Dedupe
    const uniquePaths = [...new Set(pathsToTry)]

    // Find instance
    const instance = db.prepare(`
      SELECT id FROM schema_instances
      WHERE patient_id = ? AND instance_type = 'patient_ehr'
      ORDER BY created_at DESC LIMIT 1
    `).get(patientId) as any

    if (!instance) {
      return res.json({
        success: true,
        code: 0,
        data: { history: [] }
      })
    }

    // Query all candidates for this field path (try multiple path variants)
    const placeholders = uniquePaths.map(() => '?').join(',')
    const candidates = db.prepare(`
      SELECT
        fvc.id,
        fvc.field_path,
        fvc.value_json,
        fvc.value_type,
        fvc.source_document_id,
        fvc.source_page,
        fvc.source_block_id,
        fvc.source_bbox_json,
        fvc.source_text,
        fvc.confidence,
        fvc.created_by,
        fvc.created_at,
        fvc.extraction_run_id,
        d.file_name as source_document_name
      FROM field_value_candidates fvc
      LEFT JOIN documents d ON d.id = fvc.source_document_id
      WHERE fvc.instance_id = ? AND fvc.field_path IN (${placeholders})
      ORDER BY fvc.created_at DESC
    `).all(instance.id, ...uniquePaths) as any[]

    // Transform into the format the ModificationHistory component expects
    const history = candidates.map((c, idx) => {
      let newValue: any
      try { newValue = JSON.parse(c.value_json) } catch { newValue = c.value_json }

      // Determine the "old_value" — the value from the next (older) candidate
      const olderCandidate = candidates[idx + 1]
      let oldValue: any = null
      if (olderCandidate) {
        try { oldValue = JSON.parse(olderCandidate.value_json) } catch { oldValue = olderCandidate.value_json }
      }

      return {
        id: c.id,
        field_path: fieldPath,
        old_value: oldValue,
        new_value: newValue,
        change_type: c.created_by === 'ai' ? 'extract' : (c.created_by === 'user' ? 'manual_edit' : 'initial_extract'),
        change_type_display: c.created_by === 'ai' ? 'AI抽取' : (c.created_by === 'user' ? '手动修改' : '系统初始化'),
        operator_type: c.created_by,
        operator_name: c.created_by === 'ai' ? 'AI系统' : (c.created_by === 'user' ? '用户' : '系统'),
        source_document_id: c.source_document_id,
        source_document_name: c.source_document_name,
        source_page: c.source_page,
        source_text: c.source_text,
        confidence: c.confidence,
        source_location: c.source_bbox_json ? (() => {
          try { return JSON.parse(c.source_bbox_json) } catch { return null }
        })() : null,
        remark: c.source_text || null,
        created_at: c.created_at
      }
    })

    return res.json({
      success: true,
      code: 0,
      data: { history }
    })
  } catch (err: any) {
    console.error('[GET ehr-field-history]', err)
    return res.status(500).json({
      success: false,
      code: 500,
      message: err.message
    })
  }
})

/**
 * POST /api/v1/patients/:patientId/merge-ehr
 *
 * 将文档抽取的 EHR 数据合并到患者病历夹
 * Body: { document_id, source_extraction_id? }
 */
router.post('/:patientId/merge-ehr', (req: Request, res: Response) => {
  try {
    const { patientId } = req.params
    const { document_id, source_extraction_id } = req.body

    if (!document_id) {
      return res.status(400).json({ success: false, code: 400, message: '缺少 document_id', data: null })
    }

    // 1. 获取文档的 extract_result_json
    const doc = db.prepare(`SELECT extract_result_json FROM documents WHERE id = ?`).get(document_id) as any
    if (!doc?.extract_result_json) {
      return res.status(400).json({
        success: false, code: 400,
        message: '该文档无可合并的抽取结果',
        data: null
      })
    }

    let ehrData: any = {}
    try { ehrData = JSON.parse(doc.extract_result_json) } catch {
      return res.status(400).json({
        success: false, code: 400,
        message: '抽取结果 JSON 解析失败',
        data: null
      })
    }

    // 2. 获取或创建 schema instance
    let instance = db.prepare(`
      SELECT id FROM schema_instances
      WHERE patient_id = ? AND instance_type = 'patient_ehr'
      ORDER BY created_at DESC LIMIT 1
    `).get(patientId) as any

    if (!instance) {
      const defaultSchema = db.prepare(`SELECT id FROM schemas ORDER BY created_at DESC LIMIT 1`).get() as any
      if (!defaultSchema) {
        return res.status(400).json({ success: false, code: 400, message: '系统尚无预设 Schema', data: null })
      }
      const newInstanceId = randomUUID()
      db.prepare(`
        INSERT INTO schema_instances (id, patient_id, schema_id, name, instance_type, status)
        VALUES (?, ?, ?, ?, 'patient_ehr', 'draft')
      `).run(newInstanceId, patientId, defaultSchema.id, '自动初始化病历夹')
      instance = { id: newInstanceId }
    }

    // 3. 打平 ehrData 为 field paths，然后 upsert 到 field_value_candidates + field_value_selected
    const flatFields: Array<{ path: string; value: string }> = []
    function flatten(obj: any, parts: string[] = []) {
      if (obj === null || obj === undefined) return
      // 跳过 _extraction_metadata 等内部字段
      if (parts.length > 0 && parts[0].startsWith('_')) return
      if (Array.isArray(obj)) {
        flatFields.push({ path: '/' + parts.join('/'), value: JSON.stringify(obj) })
        return
      }
      if (typeof obj === 'object') {
        for (const key of Object.keys(obj)) {
          if (key.startsWith('_')) continue
          flatten(obj[key], [...parts, key])
        }
        return
      }
      flatFields.push({ path: '/' + parts.join('/'), value: JSON.stringify(obj) })
    }
    flatten(ehrData)

    const insertCandidate = db.prepare(`
      INSERT INTO field_value_candidates
        (id, instance_id, field_path, value_json, value_type, source_document_id, source_text, confidence, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ai')
    `)

    const upsertSelected = db.prepare(`
      INSERT INTO field_value_selected
        (id, instance_id, field_path, selected_candidate_id, selected_value_json, selected_by)
      VALUES (?, ?, ?, ?, ?, 'ai')
      ON CONFLICT(instance_id, COALESCE(section_instance_id, '__null__'), COALESCE(row_instance_id, '__null__'), field_path)
      DO UPDATE SET
        selected_candidate_id = excluded.selected_candidate_id,
        selected_value_json = excluded.selected_value_json,
        selected_by = 'ai',
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    `)

    let newFieldCount = 0
    let updatedFieldCount = 0
    let appendedArrayCount = 0

    // 读取已有 selected values
    const existingRows = db.prepare(`
      SELECT field_path, selected_value_json FROM field_value_selected WHERE instance_id = ?
    `).all(instance.id) as any[]
    const existingMap = new Map<string, string>()
    for (const row of existingRows) {
      existingMap.set(row.field_path, row.selected_value_json)
    }

    const mergeAll = db.transaction(() => {
      for (const field of flatFields) {
        const candidateId = randomUUID()
        const valueType = field.value.startsWith('[') ? 'array'
          : field.value.startsWith('"') ? 'string'
          : /^\d/.test(field.value) ? 'number'
          : 'string'

        insertCandidate.run(
          candidateId,
          instance.id,
          field.path,
          field.value,
          valueType,
          document_id,
          'AI抽取合并',
          0.85  // 默认置信度
        )

        const selectedId = randomUUID()
        upsertSelected.run(selectedId, instance.id, field.path, candidateId, field.value)

        if (existingMap.has(field.path)) {
          if (existingMap.get(field.path) !== field.value) {
            updatedFieldCount++
          }
        } else {
          newFieldCount++
        }
        if (valueType === 'array') appendedArrayCount++
      }
    })

    mergeAll()

    return res.json({
      success: true, code: 0, message: '合并成功',
      data: {
        new_field_count: newFieldCount,
        updated_field_count: updatedFieldCount,
        appended_array_count: appendedArrayCount,
        conflict_count: 0
      }
    })
  } catch (err: any) {
    console.error('[POST merge-ehr]', err)
    return res.status(500).json({ success: false, code: 500, message: err.message, data: null })
  }
})

export default router

