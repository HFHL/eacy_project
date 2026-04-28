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

const setByDotPath = (target, path, value) => {
  const parts = String(path || '').split('.').filter(Boolean)
  if (!parts.length) return

  let cursor = target
  parts.forEach((part, index) => {
    const isLast = index === parts.length - 1
    const nextPart = parts[index + 1]
    const nextIsArrayIndex = /^\d+$/.test(nextPart)

    if (/^\d+$/.test(part)) {
      const arrayIndex = Number(part)
      if (!Array.isArray(cursor)) return
      while (cursor.length <= arrayIndex) cursor.push(nextIsArrayIndex ? [] : {})
      if (isLast) {
        cursor[arrayIndex] = value
      } else {
        if (cursor[arrayIndex] == null || typeof cursor[arrayIndex] !== 'object') {
          cursor[arrayIndex] = nextIsArrayIndex ? [] : {}
        }
        cursor = cursor[arrayIndex]
      }
      return
    }

    if (isLast) {
      cursor[part] = value
      return
    }

    if (cursor[part] == null || typeof cursor[part] !== 'object') {
      cursor[part] = nextIsArrayIndex ? [] : {}
    }
    cursor = cursor[part]
  })
}

const normalizeEhrResponse = (payload = {}) => {
  const currentValues = payload.current_values && typeof payload.current_values === 'object'
    ? payload.current_values
    : {}
  const data = {}

  Object.entries(currentValues).forEach(([fieldPath, currentValue]) => {
    setByDotPath(data, fieldPath, getCurrentValuePayload(currentValue))
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
  operator: event.created_by || event.selected_by || '',
  timestamp: event.created_at || event.updated_at || '',
  confidence: event.confidence,
  note: event.note,
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

  return emptySuccess({
    data,
    updated,
    updated_count: updated.length,
  })
}
export const updatePatientEhrFolder = async () => emptySuccess(null)
export const updatePatientEhr = async (patientId, data = {}) => updatePatientEhrSchemaData(patientId, data)
export const getPatientDocuments = async (patientId = '') => {
  const response = await getDocumentList({ patient_id: patientId, page: 1, page_size: 100 })
  return emptySuccess(response.data || [])
}
export const mergeEhrData = async () => emptySuccess(null)
export const getConflictsByExtractionId = async () => emptyList()
export const resolveConflict = async () => emptySuccess(null)
export const startPatientExtraction = async () => emptyTask()
export const getExtractionTaskStatus = async () => emptyTask()
export const getEhrFieldHistory = async (patientId = '', fieldPath = '') => {
  const events = await request.get(`${PATIENTS_ENDPOINT}/${patientId}/ehr/fields/${encodeURIComponent(fieldPath)}/events`)
  return emptySuccess((Array.isArray(events) ? events : []).map(normalizeHistoryEvent))
}
export const getEhrFieldHistoryV2 = async (patientId = '', fieldPath = '') => {
  const history = await getEhrFieldHistory(patientId, fieldPath)
  return emptySuccess({ history: history.data || [] })
}
export const getEhrFieldHistoryV3 = async (patientId = '', fieldPath = '') => getEhrFieldHistoryV2(patientId, fieldPath)
export const getEhrFieldCandidatesV3 = async () => emptySuccess({
  candidates: [],
  selected_candidate_id: null,
  selected_value: null,
  has_value_conflict: false,
  distinct_value_count: 0,
})
export const selectEhrFieldCandidateV3 = async () => emptySuccess(null)
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
  updatePatientEhr,
  getPatientDocuments,
  mergeEhrData,
  getConflictsByExtractionId,
  resolveConflict,
  startPatientExtraction,
  getExtractionTaskStatus,
  getEhrFieldHistory,
  getEhrFieldHistoryV2,
  getEhrFieldHistoryV3,
  getEhrFieldCandidatesV3,
  selectEhrFieldCandidateV3,
  uploadAndExtractField,
  getFieldConflicts,
  resolveFieldConflict,
  generateAiSummary,
  getAiSummary,
}
