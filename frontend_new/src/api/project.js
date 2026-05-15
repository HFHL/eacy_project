import { emptyList, emptySuccess, emptyTask } from './_empty'
import { normalizeFieldEvidence } from './_evidence'
import { extractEhrDataTargeted, getDocumentList } from './document'
import request, { ensureFreshAccessToken } from './request'

const PROJECTS_ENDPOINT = '/projects'

const isPlainObject = (value) => (
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  !(value instanceof Date)
)

const inferCrfValuePayload = (fieldPath, value) => {
  const normalizedPath = String(fieldPath || '').replace(/^\/+/, '').replace(/\//g, '.')
  const fieldKey = normalizedPath.split('.').filter(Boolean).at(-1) || normalizedPath
  if (value instanceof Date) {
    return { field_key: fieldKey, value_type: 'datetime', value_datetime: value.toISOString() }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { field_key: fieldKey, value_type: 'number', value_number: value }
  }
  if (typeof value === 'boolean' || Array.isArray(value) || isPlainObject(value)) {
    return { field_key: fieldKey, value_type: 'json', value_json: value }
  }
  return { field_key: fieldKey, value_type: 'text', value_text: value == null ? '' : String(value) }
}

const normalizeFieldPath = (fieldPath = '') => String(fieldPath)
  .replace(/^\/+/, '')
  .replace(/\//g, '.')
  .replace(/\[(\d+)\]/g, '.$1')
  .replace(/\[\*\]/g, '')
  .replace(/\.+/g, '.')
  .replace(/^\./, '')
  .replace(/\.$/, '')

const crfFieldUrl = (projectId, projectPatientId, fieldPath, suffix = '') => (
  `${PROJECTS_ENDPOINT}/${projectId}/patients/${projectPatientId}/crf/fields/${encodeURIComponent(normalizeFieldPath(fieldPath))}${suffix}`
)

const extractCurrentValue = (current = {}) => {
  if (current.value_json !== undefined && current.value_json !== null) return current.value_json
  if (current.value_number !== undefined && current.value_number !== null) return Number(current.value_number)
  if (current.value_date !== undefined && current.value_date !== null) return current.value_date
  if (current.value_datetime !== undefined && current.value_datetime !== null) return current.value_datetime
  if (current.value_text !== undefined && current.value_text !== null) return current.value_text
  return null
}

const isIndexedPathPart = (part) => /^\d+$/.test(String(part || ''))

const isSchemaArrayRecord = (schemaNode) => (
  schemaNode?.type === 'array' &&
  schemaNode.items?.properties &&
  typeof schemaNode.items.properties === 'object'
)

const isSchemaObject = (schemaNode) => (
  schemaNode?.properties &&
  typeof schemaNode.properties === 'object'
)

const setBySchemaPath = (target, schemaNode, parts, value) => {
  if (!parts.length) return

  if (isSchemaArrayRecord(schemaNode)) {
    const [firstPart, ...restParts] = parts
    const hasExplicitIndex = isIndexedPathPart(firstPart)
    const rowIndex = hasExplicitIndex ? Number(firstPart) : 0
    const nextParts = hasExplicitIndex ? restParts : parts

    while (target.length <= rowIndex) target.push({})
    if (target[rowIndex] == null || typeof target[rowIndex] !== 'object' || Array.isArray(target[rowIndex])) {
      target[rowIndex] = {}
    }
    setBySchemaPath(target[rowIndex], schemaNode.items, nextParts, value)
    return
  }

  const [part, ...restParts] = parts
  const isLast = restParts.length === 0
  const childSchema = isSchemaObject(schemaNode) ? schemaNode.properties[part] : null

  if (isLast) {
    target[part] = value
    return
  }

  if (isSchemaArrayRecord(childSchema)) {
    if (!Array.isArray(target[part])) target[part] = []
    setBySchemaPath(target[part], childSchema, restParts, value)
    return
  }

  if (target[part] == null || typeof target[part] !== 'object' || Array.isArray(target[part])) {
    target[part] = {}
  }
  setBySchemaPath(target[part], childSchema, restParts, value)
}

const setNestedValue = (target, path, value, schema = null) => {
  const parts = normalizeFieldPath(path).split('.').filter(Boolean)
  if (parts.length === 0) return
  setBySchemaPath(target, schema, parts, value)
}

const currentValuesToData = (currentValues = {}, schema = null) => {
  const data = {}
  Object.entries(currentValues || {}).forEach(([fieldPath, current]) => {
    setNestedValue(data, fieldPath, extractCurrentValue(current), schema)
  })
  return data
}

const toProjectCode = (data = {}) => {
  const rawCode = data.project_code || data.projectCode || data.code
  if (rawCode) return String(rawCode).trim()
  const rawName = data.project_name || data.projectName || data.name || 'research_project'
  const slug = String(rawName)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `${slug || 'research_project'}_${Date.now()}`.slice(0, 100)
}

const normalizeProjectPayload = (data = {}, { create = false } = {}) => {
  const {
    projectCode,
    projectName,
    name,
    principal_investigator_id: principalInvestigatorId,
    expected_patient_count: expectedPatientCount,
    crf_template_id: crfTemplateId,
    patient_criteria: patientCriteria,
    template_scope_config: templateScopeConfig,
    extra_json: extraJson,
    ...rest
  } = data
  const payload = {
    ...rest,
    ...(create ? { project_code: toProjectCode(data) } : {}),
    ...(data.project_name || projectName || name ? { project_name: data.project_name || projectName || name } : {}),
  }
  const nextExtraJson = {
    ...(isPlainObject(extraJson) ? extraJson : {}),
    ...(principalInvestigatorId ? { principal_investigator_id: principalInvestigatorId } : {}),
    ...(expectedPatientCount != null ? { expected_patient_count: expectedPatientCount } : {}),
    ...(crfTemplateId ? { crf_template_id: crfTemplateId } : {}),
    ...(patientCriteria ? { patient_criteria: patientCriteria } : {}),
    ...(templateScopeConfig ? { template_scope_config: templateScopeConfig } : {}),
  }
  if (Object.keys(nextExtraJson).length > 0) payload.extra_json = nextExtraJson
  delete payload.project_code
  if (create) payload.project_code = toProjectCode(data)
  return payload
}

const withProjectAliases = (project = {}) => {
  const extra = isPlainObject(project.extra_json) ? project.extra_json : {}
  const templateConfig = extra.template_scope_config || {}
  // 后端聚合字段（actual_patient_count / avg_completeness /
  // principal_investigator_name / expected_patient_count）已在 /projects 响应中提供，
  // extra_json 仅作为兼容旧数据时的兜底来源
  const actualPatientCount = Number(
    project.actual_patient_count ?? extra.actual_patient_count ?? extra.patient_count ?? 0,
  ) || 0
  const expectedPatientCount = (
    project.expected_patient_count
    ?? extra.expected_patient_count
    ?? extra.target_patient_count
    ?? null
  )
  const avgCompleteness = Number(project.avg_completeness ?? extra.avg_completeness ?? 0) || 0
  const principalInvestigatorName = (
    project.principal_investigator_name
    || extra.principal_investigator_name
    || ''
  )
  return {
    ...extra,
    ...project,
    projectId: project.id,
    project_code: project.project_code,
    project_name: project.project_name,
    status_key: project.status,
    actual_patient_count: actualPatientCount,
    expected_patient_count: expectedPatientCount,
    avg_completeness: avgCompleteness,
    crf_template_id: extra.crf_template_id || templateConfig.template_id || null,
    template_scope_config: templateConfig,
    principal_investigator_name: principalInvestigatorName,
  }
}

const wrapPaged = (payload = {}, itemMapper = (item) => item) => {
  const items = Array.isArray(payload.items) ? payload.items.map(itemMapper) : []
  const page = payload.page || 1
  const pageSize = payload.page_size || payload.pageSize || items.length || 20
  const total = payload.total ?? items.length
  return emptySuccess(items, {
    total,
    page,
    page_size: pageSize,
    pagination: { page, page_size: pageSize, total },
  })
}

const wrapList = (items = [], pagination = {}) => emptySuccess(items, {
  total: pagination.total ?? items.length,
  page: pagination.page ?? 1,
  page_size: pagination.page_size ?? items.length,
  pagination: {
    page: pagination.page ?? 1,
    page_size: pagination.page_size ?? items.length,
    total: pagination.total ?? items.length,
  },
})

const projectPatientToDetail = (item = {}, crf = null) => ({
  ...item,
  project_patient_id: item.id,
  subject_id: item.enroll_no || item.subject_id || item.patient_id,
  enrollment_date: item.enrolled_at || item.enrollment_date,
  patient_name: item.patient_name || item.name || '',
  patient_gender: item.patient_gender ?? item.gender ?? null,
  patient_age: item.patient_age ?? item.age ?? null,
  patient_birth_date: item.patient_birth_date ?? item.birth_date ?? null,
  patient_phone: item.patient_phone ?? item.phone ?? '',
  patient_code: item.patient_code ?? item.patient_id,
  patient_diagnosis: item.patient_diagnosis ?? item.diagnosis ?? [],
  crf_data: crf ? { groups: {}, data: currentValuesToData(crf.current_values || {}, crf.schema), current_values: crf.current_values || {}, _documents: item._documents || {}, _crf: crf } : item.crf_data || { groups: {} },
  documents: item.documents || [],
  document_count: item.document_count ?? 0,
  crf_completeness: item.crf_completeness ?? 0,
})

const documentListToMap = (documents = []) => Object.fromEntries(
  (Array.isArray(documents) ? documents : [])
    .filter((doc) => doc?.id)
    .map((doc) => [String(doc.id), doc])
)

const fetchPatientDocuments = async (patientId = '') => {
  if (!patientId) return []
  try {
    const response = await getDocumentList({ patient_id: patientId, page: 1, page_size: 1000 })
    return Array.isArray(response?.data) ? response.data : []
  } catch (error) {
    console.warn('[project] 获取项目患者文档失败:', error)
    return []
  }
}

const mergePatientProfile = async (projectPatient = {}) => {
  if (!projectPatient?.patient_id) return projectPatientToDetail(projectPatient)
  const documents = await fetchPatientDocuments(projectPatient.patient_id)
  try {
    const patient = await request.get(`/patients/${projectPatient.patient_id}`)
    return projectPatientToDetail({
      ...projectPatient,
      documents,
      _documents: documentListToMap(documents),
      document_count: projectPatient.document_count ?? documents.length,
      patient_name: patient.name,
      patient_gender: patient.gender,
      patient_age: patient.age,
      patient_birth_date: patient.birth_date,
      patient_phone: patient.extra_json?.phone || patient.phone || '',
      patient_code: patient.extra_json?.patient_code || patient.id,
      patient_diagnosis: patient.extra_json?.diagnosis || (patient.main_diagnosis ? [patient.main_diagnosis] : []),
      department: patient.department,
      main_diagnosis: patient.main_diagnosis,
      doctor_name: patient.doctor_name,
    })
  } catch {
    return projectPatientToDetail({
      ...projectPatient,
      documents,
      _documents: documentListToMap(documents),
      document_count: projectPatient.document_count ?? documents.length,
    })
  }
}

const resolveProjectPatient = async (projectId = '', patientOrProjectPatientId = '') => {
  if (!projectId || !patientOrProjectPatientId) return null
  const patients = await request.get(`${PROJECTS_ENDPOINT}/${projectId}/patients`)
  return (Array.isArray(patients) ? patients : []).find((item) => (
    String(item.id) === String(patientOrProjectPatientId) ||
    String(item.patient_id) === String(patientOrProjectPatientId) ||
    String(item.enroll_no || '') === String(patientOrProjectPatientId)
  )) || null
}

export const getProjects = async (params = {}) => {
  const payload = await request.get(PROJECTS_ENDPOINT, params)
  return wrapPaged(payload, withProjectAliases)
}
export const getProject = async (projectId = '') => {
  if (!projectId) return emptySuccess(null)
  const project = await request.get(`${PROJECTS_ENDPOINT}/${projectId}`)
  const aliased = withProjectAliases(project)
  // 若页面读取的 template_info / template_scope_config.template_id 尚未填充，
  // 则通过 template-bindings 接口补齐。注意：extra_json.crf_template_id 可能已有值，
  // 但这两个字段才是 ProjectDatasetView "模板 · {name}" 按钮真正读取的来源。
  const needTemplateInfo = !aliased.template_info?.template_id
    && !aliased.template_scope_config?.template_id
  if (needTemplateInfo) {
    try {
      const bindings = await request.get(`${PROJECTS_ENDPOINT}/${projectId}/template-bindings`)
      const list = Array.isArray(bindings) ? bindings : []
      const primary = list.find((b) => b?.status === 'active' && b?.binding_type === 'primary_crf')
        || list.find((b) => b?.status === 'active')
      const templateId = primary?.template_id || aliased.crf_template_id
      if (templateId) {
        let templateName = ''
        try {
          const template = await request.get(`/schema-templates/${templateId}`)
          templateName = template?.template_name || template?.name || ''
        } catch (error) {
          console.warn('[project] 解析模板名称失败:', error)
        }
        aliased.crf_template_id = templateId
        aliased.template_scope_config = {
          ...(aliased.template_scope_config || {}),
          template_id: templateId,
          template_name: templateName || aliased.template_scope_config?.template_name || '',
          schema_version_id: primary?.schema_version_id,
        }
        aliased.template_info = {
          ...(aliased.template_info || {}),
          template_id: templateId,
          template_name: templateName,
          schema_version_id: primary?.schema_version_id,
        }
      }
    } catch (error) {
      console.warn('[project] 获取项目模板绑定失败:', error)
    }
  }
  return emptySuccess(aliased)
}
export const createProject = async (data = {}) => {
  const project = await request.post(PROJECTS_ENDPOINT, normalizeProjectPayload(data, { create: true }))
  return emptySuccess(withProjectAliases(project))
}
export const updateProject = async (projectId = '', data = {}) => {
  if (!projectId) return emptySuccess(null)
  const project = await request.patch(`${PROJECTS_ENDPOINT}/${projectId}`, normalizeProjectPayload(data))
  return emptySuccess(withProjectAliases(project))
}
export const deleteProject = async (projectId = '') => {
  if (!projectId) return emptySuccess(null)
  const project = await request.delete(`${PROJECTS_ENDPOINT}/${projectId}`)
  return emptySuccess(withProjectAliases(project))
}
export const toggleProjectStatus = async (projectId = '', status = 'active') => {
  if (!projectId) return emptySuccess(null)
  const project = await request.patch(`${PROJECTS_ENDPOINT}/${projectId}`, { status })
  return emptySuccess(withProjectAliases(project))
}
export const getProjectMembers = async () => emptyList()
export const addProjectMember = async () => emptySuccess(null)
export const removeProjectMember = async () => emptySuccess(null)
export const getProjectPatients = async (projectId = '') => {
  if (!projectId) return wrapList([])
  const patients = await request.get(`${PROJECTS_ENDPOINT}/${projectId}/patients`)
  const enriched = await Promise.all((Array.isArray(patients) ? patients : []).map(mergePatientProfile))
  return wrapList(enriched)
}
export const getProjectPatientDetail = async (projectId = '', patientId = '') => {
  const projectPatient = await resolveProjectPatient(projectId, patientId)
  if (!projectPatient) return emptySuccess(null)
  const crf = await request.get(`${PROJECTS_ENDPOINT}/${projectId}/patients/${projectPatient.id}/crf`)
  const enriched = await mergePatientProfile(projectPatient)
  return emptySuccess(projectPatientToDetail(enriched, crf))
}
export const updateProjectPatientCrfFields = async (projectId, projectPatientId, data = {}) => {
  const fields = Array.isArray(data?.fields) ? data.fields : []
  const updated = []
  for (const field of fields) {
    const fieldPath = field.field_path || field.fieldPath || field.path
    if (!fieldPath) continue
    const payload = {
      ...inferCrfValuePayload(fieldPath, field.value),
      ...(field.record_instance_id ? { record_instance_id: field.record_instance_id } : {}),
      ...(field.note ? { note: field.note } : {}),
    }
    const current = await request.patch(crfFieldUrl(projectId, projectPatientId, fieldPath), payload)
    updated.push(current)
  }
  return emptySuccess({ ...data, updated, updated_count: updated.length })
}
export const getProjectPatientCrfConflicts = async () => emptyList()
export const resolveProjectPatientCrfConflict = async () => emptySuccess(null)
export const resolveAllProjectPatientCrfConflicts = async () => emptySuccess(null)
export const getProjectCrfFieldHistory = async (projectId = '', projectPatientId = '', fieldPath = '') => {
  if (!projectId || !projectPatientId || !fieldPath) return emptySuccess({ history: [] })
  const events = await request.get(crfFieldUrl(projectId, projectPatientId, fieldPath, '/events'))
  const history = (Array.isArray(events) ? events : []).map((event) => ({
    id: event.id,
    field_path: event.field_path,
    field_key: event.field_key,
    change_type: event.event_type === 'manual_edit' ? 'manual' : event.event_type,
    event_type: event.event_type,
    new_value: event.value_json ?? event.value_number ?? event.value_date ?? event.value_datetime ?? event.value_text,
    value: event.value_json ?? event.value_number ?? event.value_date ?? event.value_datetime ?? event.value_text,
    source: event.source_document_id ? 'document' : event.created_by ? 'manual' : 'system',
    source_document_id: event.source_document_id || null,
    source_event_id: event.source_event_id || null,
    source_page: event.source_page ?? null,
    source_text: event.source_text || null,
    source_location: event.source_location || null,
    extraction_run_id: event.extraction_run_id || null,
    review_status: event.review_status || '',
    created_at: event.created_at || '',
    operator: event.created_by || event.selected_by || '',
    timestamp: event.created_at || event.updated_at || '',
    confidence: event.confidence,
    note: event.note,
  }))
  return emptySuccess({ history })
}
/**
 * 获取科研项目 CRF 字段的 evidence（坐标证据）。
 * 与 getEhrFieldEvidence 对齐：返回经过 normalizeFieldEvidence 处理的 evidence 数组，
 * 每条都带有 source_location（polygon / page_width / page_height / page）。
 */
export const getCrfFieldEvidence = async (projectId = '', projectPatientId = '', fieldPath = '') => {
  if (!projectId || !projectPatientId || !fieldPath) return emptySuccess([])
  const evidences = await request.get(crfFieldUrl(projectId, projectPatientId, fieldPath, '/evidence'))
  return emptySuccess((Array.isArray(evidences) ? evidences : []).map(normalizeFieldEvidence))
}

export const getProjectCrfFieldCandidates = async (projectId = '', projectPatientId = '', fieldPath = '') => {
  if (!projectId || !projectPatientId || !fieldPath) return emptySuccess({
    candidates: [],
    selected_candidate_id: null,
    selected_value: null,
    has_value_conflict: false,
    distinct_value_count: 0,
  })
  const payload = await request.get(crfFieldUrl(projectId, projectPatientId, fieldPath, '/candidates'))
  return emptySuccess(payload)
}
export const saveProjectCrfFieldValue = async (projectId = '', projectPatientId = '', fieldPath = '', value, options = {}) => {
  if (!projectId || !projectPatientId || !fieldPath) return emptySuccess(null)
  const payload = {
    ...inferCrfValuePayload(fieldPath, value),
    ...(options.record_instance_id ? { record_instance_id: options.record_instance_id } : {}),
    ...(options.note ? { note: options.note } : {}),
  }
  const current = await request.patch(crfFieldUrl(projectId, projectPatientId, fieldPath), payload)
  return emptySuccess(current)
}
export const deleteProjectCrfFieldValue = async (projectId = '', projectPatientId = '', fieldPath = '') => {
  if (!projectId || !projectPatientId || !fieldPath) return emptySuccess(null)
  await request.delete(crfFieldUrl(projectId, projectPatientId, fieldPath))
  return emptySuccess(null)
}
export const createProjectCrfRecordInstance = async (projectId = '', projectPatientId = '', data = {}) => {
  if (!projectId || !projectPatientId) return emptySuccess(null)
  const payload = await request.post(`${PROJECTS_ENDPOINT}/${projectId}/patients/${projectPatientId}/crf/records`, data)
  return emptySuccess(payload)
}
export const deleteProjectCrfRecordInstance = async (projectId = '', projectPatientId = '', recordInstanceId = '') => {
  if (!projectId || !projectPatientId || !recordInstanceId) return emptySuccess(null)
  await request.delete(`${PROJECTS_ENDPOINT}/${projectId}/patients/${projectPatientId}/crf/records/${recordInstanceId}`)
  return emptySuccess(null)
}
export const selectProjectCrfFieldCandidate = async (projectId = '', projectPatientId = '', fieldPath = '', candidateId = '', selectedValue) => {
  if (!projectId || !projectPatientId || !fieldPath) return emptySuccess(null)
  if (!candidateId) return saveProjectCrfFieldValue(projectId, projectPatientId, fieldPath, selectedValue)
  const payload = await request.post(crfFieldUrl(projectId, projectPatientId, fieldPath, '/select-candidate'), { candidate_id: candidateId })
  return emptySuccess(payload)
}
export const updateProjectCrfFolder = async (projectId = '', projectPatientId = '') => {
  if (!projectId || !projectPatientId) return emptySuccess({ created_jobs: 0, job_ids: [] })
  const payload = await request.post(`${PROJECTS_ENDPOINT}/${projectId}/patients/${projectPatientId}/crf/update-folder`)
  return emptySuccess({
    ...payload,
    task_id: payload.batch_id || payload.job_ids?.[0] || '',
    message: `已提交 ${payload.submitted_jobs || payload.created_jobs || 0} 个项目 CRF 抽取任务，后台正在抽取`,
  })
}
export const updateProjectCrfFolderBatch = async (projectId = '', projectPatientIds = null) => {
  if (!projectId) return emptySuccess({ created_jobs: 0, job_ids: [] })
  const body = Array.isArray(projectPatientIds) && projectPatientIds.length > 0
    ? { project_patient_ids: projectPatientIds.filter(Boolean) }
    : {}
  const payload = await request.post(`${PROJECTS_ENDPOINT}/${projectId}/crf/update-folder`, body)
  return emptySuccess({
    ...payload,
    task_id: payload.batch_id || payload.job_ids?.[0] || '',
    message: `已提交 ${payload.submitted_jobs || payload.created_jobs || 0} 个项目 CRF 抽取任务，后台正在抽取`,
  })
}
export const enrollPatient = async (projectId = '', data = {}) => {
  if (!projectId || !data?.patient_id) return emptySuccess(null)
  const projectPatient = await request.post(`${PROJECTS_ENDPOINT}/${projectId}/patients`, data)
  return emptySuccess(projectPatientToDetail(projectPatient))
}
export const removeProjectPatient = async (projectId = '', patientOrProjectPatientId = '') => {
  if (!projectId || !patientOrProjectPatientId) return emptySuccess(null)
  const projectPatient = await resolveProjectPatient(projectId, patientOrProjectPatientId)
  if (!projectPatient) return emptySuccess(null)
  const removed = await request.delete(`${PROJECTS_ENDPOINT}/${projectId}/patients/${projectPatient.id}`)
  return emptySuccess(projectPatientToDetail(removed))
}
export const startCrfExtraction = async ({
  projectId = '',
  projectPatientId = '',
  patientId = '',
  documentId = '',
  contextId = '',
  schemaVersionId = '',
  targetFormKey = '',
  waitForDocumentReady = false,
} = {}) => extractEhrDataTargeted({
  jobType: 'project_crf',
  projectId,
  projectPatientId,
  patientId,
  documentId,
  contextId,
  schemaVersionId,
  targetFormKey,
  waitForDocumentReady,
})
export const getCrfExtractionProgress = async (_projectId = '', taskId = '') => {
  if (!taskId) return emptyTask()
  try {
    const batch = await request.get(`/task-batches/${taskId}`)
    const failedItems = Array.isArray(batch.items) ? batch.items.filter(item => item.status === 'failed') : []
    const normalizedStatus = batch.status === 'succeeded' ? 'completed' : batch.status
    return emptySuccess({
      ...batch,
      status: normalizedStatus,
      task_id: batch.batch_id || batch.id,
      total_patients: batch.total_items || 0,
      processed_patients: (batch.succeeded_items || 0) + (batch.failed_items || 0) + (batch.cancelled_items || 0),
      success_count: batch.succeeded_items || 0,
      error_count: batch.failed_items || 0,
      current_step: batch.message || batch.items?.find(item => item.status === 'running')?.stage_label || '',
      errors: failedItems.map(item => ({
        patient_id: item.patient_id || item.project_patient_id || '',
        error: item.error_message || item.message || '抽取失败',
      })),
    })
  } catch (error) {
    if (error?.status && error.status !== 404) throw error
  }
  const job = await request.get(`/extraction-jobs/${taskId}`)
  return emptySuccess({
    ...job,
    task_id: job.id,
    progress: job.progress ?? 0,
    success_count: job.status === 'completed' ? 1 : 0,
    error_count: job.status === 'failed' ? 1 : 0,
  })
}
const fetchActiveProjectBinding = async (projectId = '') => {
  if (!projectId) return null
  try {
    const bindings = await request.get(`${PROJECTS_ENDPOINT}/${projectId}/template-bindings`)
    const list = Array.isArray(bindings) ? bindings : []
    // 优先取激活的 primary_crf
    const primary = list.find(
      (b) => b?.status === 'active' && b?.binding_type === 'primary_crf',
    )
    if (primary) return primary
    return list.find((b) => b?.status === 'active') || null
  } catch (error) {
    console.warn('[project] 获取模板绑定失败:', error)
    return null
  }
}

const pickSchemaVersionFromTemplate = (template = {}, schemaVersionId = '') => {
  const versions = Array.isArray(template?.versions) ? template.versions : []
  if (schemaVersionId) {
    const matched = versions.find((v) => String(v?.id) === String(schemaVersionId))
    if (matched) return matched
  }
  return (
    versions.find((v) => v?.status === 'published')
    || versions.find((v) => v?.status === 'active')
    || versions[0]
    || null
  )
}

export const getProjectTemplateDesigner = async (projectId = '') => {
  if (!projectId) return emptySuccess(null)
  const binding = await fetchActiveProjectBinding(projectId)
  if (!binding?.template_id) {
    return emptySuccess(null, { message: '项目尚未关联 CRF 模板' })
  }
  try {
    const template = await request.get(`/schema-templates/${binding.template_id}`)
    const version = pickSchemaVersionFromTemplate(template, binding.schema_version_id)
    const schemaJson = version?.schema_json || version?.schema || template?.schema_json || {}
    const layoutConfig = (schemaJson && typeof schemaJson === 'object' && schemaJson.layout_config) || {}
    const designer = schemaJson?.designer || layoutConfig.designer || null
    const fieldGroups = schemaJson?.fieldGroups || layoutConfig.fieldGroups || version?.field_groups || []
    return emptySuccess({
      template_id: template?.id || binding.template_id,
      template_name: template?.template_name || template?.name || '项目模板',
      schema_version: version?.version_no ? `v${version.version_no}` : (version?.version_name || ''),
      schema_version_id: version?.id || binding.schema_version_id,
      binding_id: binding.id,
      schema_json: schemaJson,
      schema: schemaJson,
      designer,
      field_groups: fieldGroups,
    })
  } catch (error) {
    console.error('[project] 加载项目模板失败:', error)
    return { success: false, message: error?.message || '加载项目模板失败', data: null }
  }
}

export const saveProjectTemplateDesigner = async (projectId = '', payload = {}) => {
  if (!projectId) return emptySuccess(null)
  const designer = payload.designer || {}
  const fieldGroups = Array.isArray(designer.fieldGroups)
    ? designer.fieldGroups
    : (Array.isArray(payload.field_groups) ? payload.field_groups : [])

  const binding = await fetchActiveProjectBinding(projectId)
  if (!binding?.template_id) {
    return { success: false, message: '项目尚未关联 CRF 模板，无法保存', data: null }
  }

  // 1) 在原模板上创建新版本（草稿）并发布，使其成为最新活动版本
  const detail = await request.get(`/schema-templates/${binding.template_id}`)
  const versions = Array.isArray(detail?.versions) ? detail.versions : []
  const nextVersionNo = versions.reduce(
    (max, v) => Math.max(max, Number(v?.version_no || 0)),
    0,
  ) + 1
  const exportedSchema = payload.schema_json || payload.schema || {}
  const schemaJson = {
    ...exportedSchema,
    title: exportedSchema.title
      || payload.template_name
      || detail?.template_name
      || designer?.meta?.title
      || 'CRF模版',
    $schema: exportedSchema.$schema
      || designer?.meta?.$schema
      || 'https://json-schema.org/draft/2020-12/schema',
    layout_config: {
      ...(exportedSchema.layout_config || {}),
      designer,
      fieldGroups,
      category: payload.category || '',
    },
    designer,
    fieldGroups,
  }
  const newVersion = await request.post(`/schema-templates/${binding.template_id}/versions`, {
    version_no: nextVersionNo,
    version_name: `v${nextVersionNo} project-save`,
    schema_json: schemaJson,
    status: 'draft',
  })
  const publishedVersion = await request.post(
    `/schema-template-versions/${newVersion.id}/publish`,
  )

  // 2) 把项目绑定切换到新版本：先停用旧绑定，再创建新绑定
  try {
    if (binding?.id) {
      await request.delete(`${PROJECTS_ENDPOINT}/${projectId}/template-bindings/${binding.id}`)
    }
  } catch (error) {
    console.warn('[project] 停用旧模板绑定失败:', error)
  }

  let nextBinding = null
  try {
    nextBinding = await request.post(`${PROJECTS_ENDPOINT}/${projectId}/template-bindings`, {
      template_id: binding.template_id,
      schema_version_id: publishedVersion?.id || newVersion?.id,
      binding_type: binding.binding_type || 'primary_crf',
    })
  } catch (error) {
    console.error('[project] 创建新模板绑定失败:', error)
    return { success: false, message: error?.message || '保存成功但绑定切换失败', data: null }
  }

  return emptySuccess({
    template_id: binding.template_id,
    schema_version_id: publishedVersion?.id || newVersion?.id,
    binding_id: nextBinding?.id || null,
    migrated: 0,
    skipped: 0,
  })
}
export const getProjectExtractionTasks = async () => emptyList()
export const getActiveExtractionTask = async () => emptySuccess(null)
export const cancelCrfExtraction = async () => emptySuccess(null)
export const resetCrfExtraction = async () => emptySuccess(null)
export const applyTemplateVersion = async () => emptySuccess(null)
export const exportProjectCrfFile = async (projectId = '', payload = {}) => {
  if (!projectId) return new Blob([])
  const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/+$/, '')
  const token = await ensureFreshAccessToken()
  const response = await fetch(`${apiBase}${PROJECTS_ENDPOINT}/${projectId}/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'same-origin',
    body: JSON.stringify(payload || {}),
  })
  const blob = await response.blob()
  if (!response.ok) return blob
  return blob
}

export default {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  toggleProjectStatus,
  getProjectMembers,
  addProjectMember,
  removeProjectMember,
  getProjectPatients,
  getProjectPatientDetail,
  updateProjectPatientCrfFields,
  getProjectPatientCrfConflicts,
  resolveProjectPatientCrfConflict,
  resolveAllProjectPatientCrfConflicts,
  getProjectCrfFieldHistory,
  getProjectCrfFieldCandidates,
  saveProjectCrfFieldValue,
  deleteProjectCrfFieldValue,
  createProjectCrfRecordInstance,
  deleteProjectCrfRecordInstance,
  selectProjectCrfFieldCandidate,
  updateProjectCrfFolder,
  updateProjectCrfFolderBatch,
  enrollPatient,
  removeProjectPatient,
  startCrfExtraction,
  getCrfExtractionProgress,
  getProjectTemplateDesigner,
  saveProjectTemplateDesigner,
  getProjectExtractionTasks,
  getActiveExtractionTask,
  cancelCrfExtraction,
  resetCrfExtraction,
  applyTemplateVersion,
  exportProjectCrfFile,
}
