import request from './request'
import { emptyList, emptySuccess, emptyTask } from './_empty'
import { PATIENT_DEPARTMENT_OPTIONS } from '../constants/patientDepartments'
import { getDocumentList } from './document'

const PATIENTS_ENDPOINT = '/patients'

const toArray = (value) => {
  if (Array.isArray(value)) return value
  if (value === undefined || value === null || value === '') return []
  return String(value).split(/[,\u3001;\uff1b]/).map((item) => item.trim()).filter(Boolean)
}

const pickExtra = (patient = {}) => (
  patient.extra_json && typeof patient.extra_json === 'object' ? patient.extra_json : {}
)

const normalizePatient = (patient = {}) => {
  const extra = pickExtra(patient)
  const diagnosis = toArray(extra.diagnosis ?? patient.diagnosis ?? patient.main_diagnosis)
  const department = patient.department ?? extra.department_name ?? extra.department ?? ''
  const doctor = patient.doctor_name ?? extra.attending_doctor_name ?? extra.doctor ?? ''

  return {
    ...extra,
    ...patient,
    patient_code: extra.patient_code || patient.patient_code || patient.id,
    department,
    department_id: extra.department_id || department,
    department_name: extra.department_name || department,
    diagnosis,
    main_diagnosis: patient.main_diagnosis ?? diagnosis.join(', '),
    doctor_name: doctor,
    attending_doctor_name: doctor,
    doctor,
    phone: extra.phone || patient.phone || '',
    id_card: extra.id_card || patient.id_card || '',
    address: extra.address || patient.address || '',
    admission_date: extra.admission_date || patient.admission_date || '',
    notes: extra.notes || patient.notes || '',
    tags: Array.isArray(extra.tags) ? extra.tags : [],
    projects: Array.isArray(extra.projects) ? extra.projects : [],
    document_count: Number(extra.document_count || patient.document_count || 0),
    pending_field_conflict_count: Number(extra.pending_field_conflict_count || 0),
    has_pending_field_conflicts: !!extra.has_pending_field_conflicts,
    data_completeness: Number(extra.data_completeness || 0),
    status: patient.deleted_at ? 'deleted' : (extra.status || patient.status || 'active'),
    merged_data: {
      ...(extra.merged_data || {}),
      admission_date: extra.admission_date || patient.admission_date || extra.merged_data?.admission_date || '',
      notes: extra.notes || patient.notes || extra.merged_data?.notes || '',
    },
    source_document_ids: Array.isArray(extra.source_document_ids) ? extra.source_document_ids : [],
  }
}

const normalizeListPayload = (payload = {}) => {
  const page = Number(payload.page || 1)
  const pageSize = Number(payload.page_size || 20)
  const total = Number(payload.total || 0)
  const items = (Array.isArray(payload.items) ? payload.items : []).map(normalizePatient)

  items.items = items
  items.list = items
  items.total = total
  items.page = page
  items.page_size = pageSize

  return emptySuccess(items, {
    pagination: { total, page, page_size: pageSize },
    total,
    page,
    page_size: pageSize,
    statistics: {
      total_documents: items.reduce((sum, item) => sum + Number(item.document_count || 0), 0),
      average_completeness: items.length
        ? items.reduce((sum, item) => sum + Number(item.data_completeness || 0), 0) / items.length
        : 0,
      recently_added: items.length,
    },
  })
}

const normalizeListParams = (params = {}) => {
  const next = {
    page: params.page || 1,
    page_size: params.page_size || params.pageSize || 20,
  }

  const keyword = params.keyword ?? params.search
  if (keyword) next.keyword = keyword

  const department = params.department ?? params.department_id ?? params.department_name
  if (department) next.department = department

  return next
}

const normalizePatientPayload = (data = {}) => {
  const diagnosis = toArray(data.diagnosis ?? data.main_diagnosis)
  const department = data.department ?? data.department_name ?? data.department_id ?? null
  const doctor = data.doctor_name ?? data.attending_doctor_name ?? data.doctor ?? null
  const extraJson = {
    ...(data.extra_json || {}),
    patient_code: data.patient_code,
    department_id: data.department_id ?? department,
    department_name: data.department_name ?? department,
    diagnosis,
    attending_doctor_name: doctor,
    phone: data.phone,
    id_card: data.id_card,
    address: data.address,
    admission_date: data.admission_date,
    notes: data.notes,
    tags: data.tags,
    projects: data.projects,
    merged_data: {
      ...(data.merged_data || {}),
      admission_date: data.admission_date ?? data.merged_data?.admission_date,
      notes: data.notes ?? data.merged_data?.notes,
    },
  }

  Object.keys(extraJson).forEach((key) => {
    if (extraJson[key] === undefined) delete extraJson[key]
  })

  return {
    name: data.name,
    gender: data.gender || null,
    birth_date: data.birth_date || data.birthDate || null,
    age: data.age === undefined || data.age === null || data.age === '' ? null : Number(data.age),
    department,
    main_diagnosis: (data.main_diagnosis ?? diagnosis.join(', ')) || null,
    doctor_name: doctor,
    extra_json: extraJson,
  }
}

export const getPatientList = async (params = {}) => {
  const payload = await request.get(PATIENTS_ENDPOINT, normalizeListParams(params))
  return normalizeListPayload(payload)
}

export const createPatient = async (data = {}) => {
  const payload = await request.post(PATIENTS_ENDPOINT, normalizePatientPayload(data))
  return emptySuccess(normalizePatient(payload))
}

export const getPatientDetail = async (patientId = '') => {
  const payload = await request.get(`${PATIENTS_ENDPOINT}/${patientId}`)
  return emptySuccess(normalizePatient(payload))
}

export const updatePatient = async (patientId = '', data = {}) => {
  const payload = await request.patch(`${PATIENTS_ENDPOINT}/${patientId}`, normalizePatientPayload(data))
  return emptySuccess(normalizePatient(payload))
}

export const deletePatient = async (patientId = '') => {
  await request.delete(`${PATIENTS_ENDPOINT}/${patientId}`)
  return emptySuccess(null)
}

export const batchDeletePatients = async ({ patient_ids: patientIds = [] } = {}) => {
  const failedIds = []

  for (const patientId of patientIds) {
    try {
      await deletePatient(patientId)
    } catch {
      failedIds.push(patientId)
    }
  }

  const successCount = patientIds.length - failedIds.length
  return emptySuccess({
    deleted: successCount,
    success_count: successCount,
    failed_count: failedIds.length,
    failed_ids: failedIds,
    removed_from_projects: [],
  })
}

export const batchDeleteCheck = async ({ patient_ids: patientIds = [] } = {}) => emptySuccess({
  can_delete: patientIds,
  blocked: [],
  projects: [],
})

export const exportPatients = async (params = {}) => {
  const response = await getPatientList({
    ...params,
    page: 1,
    page_size: params.scope === 'selected' ? Math.max(params.patient_ids?.length || 1, 1) : 100,
  })
  const items = Array.isArray(response.data)
    ? response.data.filter((item) => !params.patient_ids || params.patient_ids.includes(item.id))
    : []
  return JSON.stringify(items, null, 2)
}

export const getDepartmentTree = async () => emptySuccess(
  PATIENT_DEPARTMENT_OPTIONS.map((item) => ({
    id: item.value,
    name: item.label,
    children: [],
  }))
)

export function synthesizeCandidatesFromHistory() { return [] }

const getCurrentValuePayload = (currentValue = {}) => {
  if (currentValue.value_json !== undefined && currentValue.value_json !== null) return currentValue.value_json
  if (currentValue.value_number !== undefined && currentValue.value_number !== null) return Number(currentValue.value_number)
  if (currentValue.value_date !== undefined && currentValue.value_date !== null) return currentValue.value_date
  if (currentValue.value_datetime !== undefined && currentValue.value_datetime !== null) return currentValue.value_datetime
  if (currentValue.value_text !== undefined && currentValue.value_text !== null) return currentValue.value_text
  return ''
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

const setByDotPath = (target, path, value, schema = null) => {
  const parts = String(path || '').split('.').filter(Boolean)
  if (!parts.length) return
  setBySchemaPath(target, schema, parts, value)
}

const normalizeEhrResponse = (payload = {}) => {
  const currentValues = payload.current_values && typeof payload.current_values === 'object'
    ? payload.current_values
    : {}
  const data = {}

  Object.entries(currentValues).forEach(([fieldPath, currentValue]) => {
    setByDotPath(data, fieldPath, getCurrentValuePayload(currentValue), payload.schema)
  })

  return {
    context: payload.context || null,
    schema: payload.schema || null,
    records: Array.isArray(payload.records) ? payload.records : [],
    current_values: currentValues,
    data,
  }
}

const isPlainObject = (value) => (
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  !(value instanceof Date)
)

const stableStringify = (value) => {
  if (value === undefined) return '__undefined__'
  if (!isPlainObject(value) && !Array.isArray(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

const valuesEqual = (a, b) => stableStringify(a) === stableStringify(b)

const collectLeafValues = (value, prefix = '', result = {}) => {
  if (Array.isArray(value)) {
    if (value.length === 0 && prefix) {
      result[prefix] = []
      return result
    }
    value.forEach((item, index) => {
      collectLeafValues(item, prefix ? `${prefix}.${index}` : String(index), result)
    })
    return result
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value).filter(([key]) => !String(key).startsWith('_'))
    if (entries.length === 0 && prefix) {
      result[prefix] = {}
      return result
    }
    entries.forEach(([key, item]) => {
      collectLeafValues(item, prefix ? `${prefix}.${key}` : key, result)
    })
    return result
  }

  if (prefix) result[prefix] = value
  return result
}

const collectDeletedLeafPaths = (previousValue, nextValue, prefix = '', result = []) => {
  if (previousValue === undefined || previousValue === null) return result

  if (Array.isArray(previousValue)) {
    if (!Array.isArray(nextValue)) {
      Object.keys(collectLeafValues(previousValue, prefix)).forEach((path) => result.push(path))
      return result
    }
    previousValue.forEach((item, index) => {
      collectDeletedLeafPaths(item, nextValue[index], prefix ? `${prefix}.${index}` : String(index), result)
    })
    return result
  }

  if (isPlainObject(previousValue)) {
    const entries = Object.entries(previousValue).filter(([key]) => !String(key).startsWith('_'))
    if (!isPlainObject(nextValue) && !Array.isArray(nextValue)) {
      Object.keys(collectLeafValues(previousValue, prefix)).forEach((path) => result.push(path))
      return result
    }
    entries.forEach(([key, item]) => {
      const childNext = nextValue && typeof nextValue === 'object' ? nextValue[key] : undefined
      collectDeletedLeafPaths(item, childNext, prefix ? `${prefix}.${key}` : key, result)
    })
    return result
  }

  if (prefix && nextValue === undefined) result.push(prefix)
  return result
}

const inferEhrValuePayload = (fieldPath, value) => {
  const fieldKey = String(fieldPath || '').split('.').filter(Boolean).at(-1) || fieldPath
  if (value instanceof Date) {
    return {
      field_key: fieldKey,
      value_type: 'datetime',
      value_datetime: value.toISOString(),
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return {
      field_key: fieldKey,
      value_type: 'number',
      value_number: value,
    }
  }
  if (typeof value === 'boolean' || Array.isArray(value) || isPlainObject(value)) {
    return {
      field_key: fieldKey,
      value_type: 'json',
      value_json: value,
    }
  }
  return {
    field_key: fieldKey,
    value_type: 'text',
    value_text: value == null ? '' : String(value),
  }
}

const normalizeHistoryEvent = (event = {}) => ({
  id: event.id,
  field_path: event.field_path,
  field_key: event.field_key,
  change_type: event.event_type === 'manual_edit' ? 'manual' : event.event_type,
  event_type: event.event_type,
  new_value: getCurrentValuePayload(event),
  value: getCurrentValuePayload(event),
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
})

const normalizeEvidenceLocation = (evidence = {}) => {
  let rawLocation = evidence.bbox_json
  if (typeof rawLocation === 'string') {
    try {
      rawLocation = JSON.parse(rawLocation)
    } catch {
      rawLocation = null
    }
  }
  const location = rawLocation && typeof rawLocation === 'object' ? rawLocation : {}
  const pageNo = evidence.page_no || location.page_no || location.page || 1
  const polygon = Array.isArray(location.polygon)
    ? location.polygon
    : Array.isArray(location.textin_position)
      ? location.textin_position
      : Array.isArray(location.position)
        ? location.position
        : null

  return {
    ...location,
    page: pageNo,
    page_no: pageNo,
    polygon,
    coord_space: location.coord_space || 'pixel',
    page_width: location.page_width,
    page_height: location.page_height,
    quote_text: evidence.quote_text || location.quote_text || '',
    evidence_id: evidence.id,
    evidence_type: evidence.evidence_type,
    document_id: evidence.document_id,
  }
}

const normalizeFieldEvidence = (evidence = {}) => ({
  ...evidence,
  source_location: normalizeEvidenceLocation(evidence),
})

export const getPatientEhr = async (patientId = '') => {
  const payload = await request.get(`${PATIENTS_ENDPOINT}/${patientId}/ehr`)
  return emptySuccess(normalizeEhrResponse(payload))
}

export const getPatientEhrSchemaData = async (patientId = '') => getPatientEhr(patientId)

export const updatePatientEhrSchemaData = async (patientId = '', data = {}, options = {}) => {
  const previousData = options.previousData || {}
  const nextValues = collectLeafValues(data)
  const previousValues = collectLeafValues(previousData)
  const changedEntries = Object.entries(nextValues).filter(([fieldPath, value]) => (
    !valuesEqual(value, previousValues[fieldPath])
  ))

  const updated = []
  for (const [fieldPath, value] of changedEntries) {
    const payload = inferEhrValuePayload(fieldPath, value)
    const current = await request.patch(
      `${PATIENTS_ENDPOINT}/${patientId}/ehr/fields/${encodeURIComponent(fieldPath)}`,
      payload
    )
    updated.push(current)
  }

  const deleted = []
  const deletedPaths = collectDeletedLeafPaths(previousData, data)
    .filter((fieldPath) => !Object.prototype.hasOwnProperty.call(nextValues, fieldPath))
  for (const fieldPath of deletedPaths) {
    await request.delete(`${PATIENTS_ENDPOINT}/${patientId}/ehr/fields/${encodeURIComponent(fieldPath)}`)
    deleted.push(fieldPath)
  }

  return emptySuccess({
    data,
    updated,
    deleted,
    updated_count: updated.length,
    deleted_count: deleted.length,
  })
}
export const updatePatientEhrFolder = async (patientId = '') => {
  if (!patientId) return emptySuccess({ created_jobs: 0, job_ids: [] })
  const payload = await request.post(`${PATIENTS_ENDPOINT}/${patientId}/ehr/update-folder`)
  return emptySuccess({
    ...payload,
    task_id: payload.batch_id || payload.job_ids?.[0] || '',
    message: `已提交 ${payload.submitted_jobs || payload.created_jobs || 0} 个电子病历夹抽取任务，后台正在抽取`,
  })
}
export const getTaskBatchProgress = async (batchId = '') => {
  if (!batchId) return emptyTask()
  const payload = await request.get(`/task-batches/${batchId}`)
  const normalizedStatus = payload.status === 'succeeded' ? 'completed' : payload.status
  return emptySuccess({
    ...payload,
    status: normalizedStatus,
    task_id: payload.batch_id || payload.id,
    success_count: payload.succeeded_items || 0,
    error_count: payload.failed_items || 0,
  })
}
export const updatePatientEhr = async (patientId, data = {}) => updatePatientEhrSchemaData(patientId, data)
export const getPatientDocuments = async (patientId = '') => {
  const response = await getDocumentList({ patient_id: patientId, page: 1, page_size: 100 })
  return emptySuccess(response.data || [])
}
export const mergeEhrData = async () => emptySuccess(null)
export const getConflictsByExtractionId = async () => emptyList()
export const resolveConflict = async () => emptySuccess(null)
export const startPatientExtraction = async (patientId = '') => {
  if (!patientId) return emptyTask()
  const payload = await request.post('/extraction-jobs', {
    job_type: 'patient_ehr',
    patient_id: patientId,
    input_json: { source: 'patient_extract' },
  })
  return emptySuccess({ ...payload, task_id: payload.id })
}
export const getExtractionTaskStatus = async (taskId = '') => {
  if (!taskId) return emptyTask()
  if (String(taskId).startsWith('batch_')) {
    return getTaskBatchProgress(String(taskId).replace(/^batch_/, ''))
  }
  const payload = await request.get(`/extraction-jobs/${taskId}`)
  return emptySuccess({
    ...payload,
    task_id: payload.id,
    percentage: payload.progress || 0,
  })
}
export const getEhrFieldHistory = async (patientId = '', fieldPath = '') => {
  const events = await request.get(`${PATIENTS_ENDPOINT}/${patientId}/ehr/fields/${encodeURIComponent(fieldPath)}/events`)
  return emptySuccess((Array.isArray(events) ? events : []).map(normalizeHistoryEvent))
}
export const getEhrFieldEvidence = async (patientId = '', fieldPath = '') => {
  const evidences = await request.get(`${PATIENTS_ENDPOINT}/${patientId}/ehr/fields/${encodeURIComponent(fieldPath)}/evidence`)
  return emptySuccess((Array.isArray(evidences) ? evidences : []).map(normalizeFieldEvidence))
}
export const getEhrFieldHistoryV2 = async (patientId = '', fieldPath = '') => {
  const history = await getEhrFieldHistory(patientId, fieldPath)
  return emptySuccess({ history: history.data || [] })
}
export const getEhrFieldHistoryV3 = async (patientId = '', fieldPath = '') => getEhrFieldHistoryV2(patientId, fieldPath)
export const getEhrFieldCandidatesV3 = async (patientId = '', fieldPath = '') => {
  if (!patientId || !fieldPath) return emptySuccess({
    candidates: [],
    selected_candidate_id: null,
    selected_value: null,
    has_value_conflict: false,
    distinct_value_count: 0,
  })
  const payload = await request.get(`${PATIENTS_ENDPOINT}/${patientId}/ehr/fields/${encodeURIComponent(fieldPath)}/candidates`)
  return emptySuccess(payload)
}
export const saveEhrFieldValueV3 = async (patientId = '', fieldPath = '', value, options = {}) => {
  if (!patientId || !fieldPath) return emptySuccess(null)
  const payload = {
    ...inferEhrValuePayload(fieldPath, value),
    ...(options.record_instance_id ? { record_instance_id: options.record_instance_id } : {}),
    ...(options.note ? { note: options.note } : {}),
  }
  const current = await request.patch(
    `${PATIENTS_ENDPOINT}/${patientId}/ehr/fields/${encodeURIComponent(fieldPath)}`,
    payload
  )
  return emptySuccess(current)
}
export const deleteEhrFieldValueV3 = async (patientId = '', fieldPath = '') => {
  if (!patientId || !fieldPath) return emptySuccess(null)
  await request.delete(`${PATIENTS_ENDPOINT}/${patientId}/ehr/fields/${encodeURIComponent(fieldPath)}`)
  return emptySuccess(null)
}
export const createEhrRecordInstanceV3 = async (patientId = '', data = {}) => {
  if (!patientId) return emptySuccess(null)
  const payload = await request.post(`${PATIENTS_ENDPOINT}/${patientId}/ehr/records`, data)
  return emptySuccess(payload)
}
export const deleteEhrRecordInstanceV3 = async (patientId = '', recordInstanceId = '') => {
  if (!patientId || !recordInstanceId) return emptySuccess(null)
  await request.delete(`${PATIENTS_ENDPOINT}/${patientId}/ehr/records/${recordInstanceId}`)
  return emptySuccess(null)
}
export const selectEhrFieldCandidateV3 = async (patientId = '', fieldPath = '', candidateId = '', selectedValue) => {
  if (!patientId || !fieldPath) return emptySuccess(null)
  if (!candidateId) return saveEhrFieldValueV3(patientId, fieldPath, selectedValue)
  const payload = await request.post(
    `${PATIENTS_ENDPOINT}/${patientId}/ehr/fields/${encodeURIComponent(fieldPath)}/select-candidate`,
    { candidate_id: candidateId }
  )
  return emptySuccess(payload)
}
export const uploadAndExtractField = async () => emptyTask()
export const getFieldConflicts = async () => emptyList()
export const resolveFieldConflict = async () => emptySuccess(null)
export const generateAiSummary = async () => emptySuccess({ summary: '', sources: [] })
export const getAiSummary = async () => emptySuccess({ summary: '', sources: [] })

export default {
  getPatientList,
  createPatient,
  getPatientDetail,
  updatePatient,
  deletePatient,
  batchDeletePatients,
  batchDeleteCheck,
  exportPatients,
  getDepartmentTree,
  getPatientEhr,
  getPatientEhrSchemaData,
  updatePatientEhrSchemaData,
  updatePatientEhrFolder,
  getTaskBatchProgress,
  updatePatientEhr,
  getPatientDocuments,
  mergeEhrData,
  getConflictsByExtractionId,
  resolveConflict,
  startPatientExtraction,
  getExtractionTaskStatus,
  getEhrFieldHistory,
  getEhrFieldEvidence,
  getEhrFieldHistoryV2,
  getEhrFieldHistoryV3,
  getEhrFieldCandidatesV3,
  saveEhrFieldValueV3,
  deleteEhrFieldValueV3,
  createEhrRecordInstanceV3,
  deleteEhrRecordInstanceV3,
  selectEhrFieldCandidateV3,
  uploadAndExtractField,
  getFieldConflicts,
  resolveFieldConflict,
  generateAiSummary,
  getAiSummary,
}
