import { Router, Request, Response } from 'express'
import db from '../db.js'

const router = Router()

type FormMeta = {
  name: string
  primary_sources: string[]
  secondary_sources: string[]
}

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

function nonEmptyString(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

function normalizeSourceList(value: unknown): string[] {
  if (value == null) return []
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (!Array.isArray(value)) return []
  return value
    .map((item) => nonEmptyString(item))
    .filter((item): item is string => Boolean(item))
}

function dedupePreserve(items: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item)
      result.push(item)
    }
  }
  return result
}

function getGroupTargetSchema(groupSchema: Record<string, any> | null | undefined): Record<string, any> | null {
  if (!groupSchema || typeof groupSchema !== 'object') return null
  if (groupSchema.type === 'array' && groupSchema.items && typeof groupSchema.items === 'object' && !Array.isArray(groupSchema.items)) {
    return groupSchema.items as Record<string, any>
  }
  return groupSchema
}

function sourcesFromXSourceBlock(target: Record<string, any> | null | undefined): { primary: string[], secondary: string[] } {
  if (!target || typeof target !== 'object') return { primary: [], secondary: [] }
  const xs = target['x-sources']
  if (!xs || typeof xs !== 'object' || Array.isArray(xs)) return { primary: [], secondary: [] }
  return {
    primary: normalizeSourceList((xs as Record<string, any>).primary),
    secondary: normalizeSourceList((xs as Record<string, any>).secondary),
  }
}

function formsMetaFromDesigner(content: Record<string, any>): FormMeta[] {
  const forms: FormMeta[] = []
  for (const folder of content.folders || []) {
    if (!folder || typeof folder !== 'object') continue
    const folderName = String(folder.name || '').trim()
    for (const group of folder.groups || []) {
      if (!group || typeof group !== 'object') continue
      const groupName = String(group.name || '').trim()
      const formName = folderName && groupName ? `${folderName} / ${groupName}` : (groupName || folderName || '未命名表单')
      forms.push({
        name: formName,
        primary_sources: normalizeSourceList(group.primarySources || group.sources?.primary),
        secondary_sources: normalizeSourceList(group.secondarySources || group.sources?.secondary),
      })
    }
  }
  return forms
}

function formsMetaFromFieldGroups(content: Record<string, any>): FormMeta[] {
  const forms: FormMeta[] = []
  for (const group of content.fieldGroups || []) {
    if (!group || typeof group !== 'object') continue
    const primary: string[] = []
    const secondary: string[] = []
    const sourcesByDocType = group._sourcesByDocType
    if (sourcesByDocType && typeof sourcesByDocType === 'object' && !Array.isArray(sourcesByDocType)) {
      for (const value of Object.values(sourcesByDocType)) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue
        primary.push(...normalizeSourceList((value as Record<string, any>).primary))
        secondary.push(...normalizeSourceList((value as Record<string, any>).secondary))
      }
    }
    primary.push(...normalizeSourceList(group.primarySources))
    secondary.push(...normalizeSourceList(group.secondarySources))
    forms.push({
      name: String(group.name || '未命名表单').trim() || '未命名表单',
      primary_sources: dedupePreserve(primary),
      secondary_sources: dedupePreserve(secondary),
    })
  }
  return forms
}

function formsMetaFromJsonSchema(content: Record<string, any>): FormMeta[] {
  const root = content.properties
  if (!root || typeof root !== 'object' || Array.isArray(root)) return []
  const forms: FormMeta[] = []
  for (const [folderName, folderSchema] of Object.entries(root)) {
    if (!folderSchema || typeof folderSchema !== 'object' || Array.isArray(folderSchema)) continue
    const folderSchemaObj = folderSchema as Record<string, any>
    const folderProps = folderSchemaObj.properties
    if (!folderProps || typeof folderProps !== 'object' || Array.isArray(folderProps)) {
      const target = getGroupTargetSchema(folderSchemaObj)
      let { primary, secondary } = sourcesFromXSourceBlock(folderSchemaObj)
      if (primary.length === 0 && secondary.length === 0) {
        ({ primary, secondary } = sourcesFromXSourceBlock(target))
      }
      if (primary.length > 0 || secondary.length > 0) {
        forms.push({
          name: String(folderName).trim() || '未命名表单',
          primary_sources: primary,
          secondary_sources: secondary,
        })
      }
      continue
    }

    for (const [groupName, groupSchema] of Object.entries(folderProps)) {
      if (!groupSchema || typeof groupSchema !== 'object' || Array.isArray(groupSchema)) continue
      const groupSchemaObj = groupSchema as Record<string, any>
      const target = getGroupTargetSchema(groupSchemaObj)
      let { primary, secondary } = sourcesFromXSourceBlock(groupSchemaObj)
      if (primary.length === 0 && secondary.length === 0) {
        ({ primary, secondary } = sourcesFromXSourceBlock(target))
      }
      forms.push({
        name: `${String(folderName).trim()} / ${String(groupName).trim()}`,
        primary_sources: primary,
        secondary_sources: secondary,
      })
    }
  }
  return forms
}

function buildFormsMetaList(content: Record<string, any>): FormMeta[] {
  if (Array.isArray(content.folders) && content.folders.length > 0) return formsMetaFromDesigner(content)
  if (Array.isArray(content.fieldGroups) && content.fieldGroups.length > 0) return formsMetaFromFieldGroups(content)
  if (content.properties && typeof content.properties === 'object' && !Array.isArray(content.properties)) return formsMetaFromJsonSchema(content)
  return []
}

function normalizeSourceToken(value: unknown): string {
  const text = nonEmptyString(value)
  if (!text) return ''
  return text
    .toLowerCase()
    .replace(/[_\-/\\·\s、，,。.（）()【】\[\]《》<>「」『』]+/g, '')
}

function docMatchesSourceLabels(docSubType: unknown, labels: string[]): boolean {
  const normalizedDocSubType = normalizeSourceToken(docSubType)
  if (!normalizedDocSubType) return false
  for (const label of labels) {
    const normalizedLabel = normalizeSourceToken(label)
    if (!normalizedLabel) continue
    if (
      normalizedDocSubType === normalizedLabel ||
      normalizedLabel.includes(normalizedDocSubType) ||
      normalizedDocSubType.includes(normalizedLabel)
    ) {
      return true
    }
  }
  return false
}

function getDefaultPatientEhrSchema() {
  return db.prepare(`
    SELECT id, name, code, version, content_json
    FROM schemas
    WHERE code = 'patient_ehr_v2' AND is_active = 1
    ORDER BY version DESC
    LIMIT 1
  `).get() as any
}

router.get('/', (req: Request, res: Response) => {
  try {
    const { page = 1, page_size = 20, search, project_id } = req.query
    const pageNum = Math.max(1, Number(page) || 1)
    const limit = Math.min(200, Math.max(1, Number(page_size) || 20))
    const offset = (pageNum - 1) * limit

    let sql = `SELECT * FROM patients`
    const params: string[] = []

    if (search) {
      sql += ` WHERE name LIKE ?`
      params.push(`%${search}%`)
    }

    sql += ` ORDER BY updated_at DESC LIMIT ? OFFSET ?`
    params.push(String(limit))
    params.push(String(offset))

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

    const filterProjectId =
      project_id != null && String(project_id).trim() !== '' ? String(project_id).trim() : ''
    let enrolledSet = new Set<string>()
    let filterProjectName = ''
    if (filterProjectId) {
      try {
        const pr = db.prepare(`SELECT project_name FROM projects WHERE id = ?`).get(filterProjectId) as
          | { project_name: string }
          | undefined
        filterProjectName = pr?.project_name || ''
        const enrolledRows = db
          .prepare(`SELECT patient_id FROM project_patients WHERE project_id = ?`)
          .all(filterProjectId) as { patient_id: string }[]
        enrolledSet = new Set(enrolledRows.map((x) => x.patient_id))
      } catch {
        enrolledSet = new Set()
      }
    }

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
        projects: enrolledSet.has(r.id)
          ? [
              {
                id: filterProjectId,
                project_name: filterProjectName,
                enrollment_status: 'enrolled',
              },
            ]
          : [],
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
        page: pageNum,
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

router.post('/:patientId/ehr-folder/update', async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params

    const patient = db.prepare(`SELECT id, name FROM patients WHERE id = ?`).get(patientId) as any
    if (!patient) {
      return res.status(404).json({ success: false, code: 404, message: '患者不存在', data: null })
    }

    const rows = db.prepare(`
      SELECT
        d.id,
        d.file_name,
        d.status,
        d.document_sub_type,
        d.metadata,
        d.extract_status,
        d.extract_result_json,
        d.created_at,
        d.updated_at,
        COUNT(e.id) AS extract_job_count
      FROM documents d
      LEFT JOIN ehr_extraction_jobs e
        ON e.document_id = d.id
       AND e.job_type = 'extract'
      WHERE d.patient_id = ?
        AND d.status != 'deleted'
      GROUP BY
        d.id,
        d.file_name,
        d.status,
        d.document_sub_type,
        d.metadata,
        d.extract_status,
        d.extract_result_json,
        d.created_at,
        d.updated_at
      ORDER BY d.created_at DESC
    `).all(patientId) as any[]

    const unextractedDocs = rows
      .filter((row) => !row.extract_result_json && Number(row.extract_job_count || 0) === 0)
      .map((row) => {
        const metadata = parseJsonObject(row.metadata)
        const metadataResult = metadata.result && typeof metadata.result === 'object' ? metadata.result : metadata
        return {
          id: row.id,
          file_name: row.file_name,
          status: row.status,
          doc_sub_type: row.document_sub_type || metadataResult?.['文档子类型'] || null,
          extract_status: row.extract_status,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }
      })

    const schemaRow = getDefaultPatientEhrSchema()
    if (!schemaRow?.id) {
      return res.status(500).json({ success: false, code: 500, message: '未找到可用的病历夹 schema', data: null })
    }
    const schemaContent = parseJsonObject(schemaRow?.content_json)
    const schemaForms = buildFormsMetaList(schemaContent)

    const expectedFormsByDoc = unextractedDocs.map((doc) => {
      const matchedForms = schemaForms
        .filter((form) => form.primary_sources.length > 0 && docMatchesSourceLabels(doc.doc_sub_type, form.primary_sources))
        .map((form) => ({
          form_name: form.name,
          primary_sources: form.primary_sources,
          secondary_sources: form.secondary_sources,
        }))
      return {
        ...doc,
        expected_form_count: matchedForms.length,
        expected_forms: matchedForms,
      }
    })

    const expectedFormSummaryMap = new Map<string, {
      form_name: string
      matched_document_count: number
      matched_document_ids: string[]
      matched_doc_sub_types: string[]
      primary_sources: string[]
      secondary_sources: string[]
    }>()

    for (const doc of expectedFormsByDoc) {
      for (const form of doc.expected_forms) {
        const existing = expectedFormSummaryMap.get(form.form_name) || {
          form_name: form.form_name,
          matched_document_count: 0,
          matched_document_ids: [],
          matched_doc_sub_types: [],
          primary_sources: form.primary_sources,
          secondary_sources: form.secondary_sources,
        }
        existing.matched_document_count += 1
        existing.matched_document_ids.push(doc.id)
        if (doc.doc_sub_type) existing.matched_doc_sub_types.push(doc.doc_sub_type)
        expectedFormSummaryMap.set(form.form_name, existing)
      }
    }

    const expectedFormSummary = Array.from(expectedFormSummaryMap.values()).map((item) => ({
      ...item,
      matched_doc_sub_types: dedupePreserve(item.matched_doc_sub_types),
    }))

    console.log(`[update-ehr-folder] patient=${patientId} name=${patient.name || '未知患者'} total_docs=${rows.length} unextracted=${unextractedDocs.length}`)
    if (unextractedDocs.length === 0) {
      console.log('[update-ehr-folder] 没有未抽取过的文档')
    } else {
      expectedFormsByDoc.forEach((doc, index) => {
        console.log(
          `[update-ehr-folder] [${index + 1}/${expectedFormsByDoc.length}] doc_id=${doc.id} file_name=${doc.file_name || '未知文档'} doc_sub_type=${doc.doc_sub_type || 'null'} status=${doc.status || 'unknown'} extract_status=${doc.extract_status || 'null'} expected_form_count=${doc.expected_form_count}`
        )
        if (doc.expected_forms.length === 0) {
          console.log(`[update-ehr-folder]   -> 未命中任何表单（可能是文档子类型未配置到 schema 的 primary_sources）`)
        } else {
          doc.expected_forms.forEach((form, formIndex) => {
            console.log(
              `[update-ehr-folder]   -> form[${formIndex + 1}/${doc.expected_forms.length}] ${form.form_name} | primary=${form.primary_sources.join('、') || '（未配置）'} | secondary=${form.secondary_sources.join('、') || '（未配置）'}`
            )
          })
        }
      })

      console.log(`[update-ehr-folder] 预期命中的唯一表单数量=${expectedFormSummary.length}`)
      expectedFormSummary.forEach((item, index) => {
        console.log(
          `[update-ehr-folder] summary[${index + 1}/${expectedFormSummary.length}] form=${item.form_name} matched_document_count=${item.matched_document_count} matched_doc_sub_types=${item.matched_doc_sub_types.join('、') || '无'}`
        )
      })
    }

    const documentIdsToExtract = unextractedDocs.map((doc) => doc.id)
    let submitResult: any = null

    if (documentIdsToExtract.length > 0) {
      console.log(
        `[update-ehr-folder] 开始提交抽取任务 patient=${patientId} schema=${schemaRow.id} document_count=${documentIdsToExtract.length}`
      )

      const response = await fetch('http://localhost:8100/api/extract/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          schema_id: schemaRow.id,
          document_ids: documentIdsToExtract,
          instance_type: 'patient_ehr'
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[update-ehr-folder] 提交抽取任务失败 status=${response.status} body=${errorText}`)
        return res.status(response.status).json({
          success: false,
          code: response.status,
          message: errorText || '提交抽取任务失败',
          data: null
        })
      }

      submitResult = await response.json()
      console.log(
        `[update-ehr-folder] 抽取任务已提交 message=${submitResult?.message || 'ok'} jobs=${Array.isArray(submitResult?.jobs) ? submitResult.jobs.length : 0}`
      )
    } else {
      console.log('[update-ehr-folder] 无需提交抽取任务，因为没有未抽取文档')
    }

    return res.json({
      success: true,
      code: 0,
      message: documentIdsToExtract.length > 0
        ? `已提交 ${documentIdsToExtract.length} 份未抽取文档进行抽取`
        : '没有需要抽取的文档',
      data: {
        patient_id: patientId,
        patient_name: patient.name || '未知患者',
        schema_id: schemaRow.id,
        total_document_count: rows.length,
        unextracted_document_count: unextractedDocs.length,
        expected_form_count: expectedFormSummary.length,
        submitted_document_count: documentIdsToExtract.length,
        documents: expectedFormsByDoc,
        expected_forms: expectedFormSummary,
        submission: submitResult,
      }
    })
  } catch (err: any) {
    console.error('[POST /patients/:patientId/ehr-folder/update]', err)
    return res.status(500).json({ success: false, code: 500, message: err.message, data: null })
  }
})

export default router
