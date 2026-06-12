import { emptyList, emptySuccess, emptyTask } from '../_empty'
import request from '../request'
import { getDocumentList } from '../document/documentsApi'
import { PATIENTS_ENDPOINT } from './constants'
import { normalizeEhrResponse } from './ehrDataAdapter'
import {
  collectDeletedLeafPaths,
  collectLeafValues,
  inferEhrValuePayload,
  valuesEqual,
} from './ehrFieldValue'

export const getPatientEhr = async (patientId = '') => {
  const payload = await request.get(`${PATIENTS_ENDPOINT}/${patientId}/ehr`)
  return emptySuccess(normalizeEhrResponse(payload))
}

export const getPatientEhrSchemaOnly = async (patientId = '') => {
  const payload = await request.get(`${PATIENTS_ENDPOINT}/${patientId}/ehr/schema`)
  return emptySuccess({ schema: payload?.schema ?? null })
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

export const getEhrExtractionStatusBatch = async (patientIds = []) => {
  const ids = Array.from(new Set((Array.isArray(patientIds) ? patientIds : []).filter(Boolean).map(String)))
  if (!ids.length) return emptySuccess({ items: [] })
  const payload = await request.post(`${PATIENTS_ENDPOINT}/ehr-extraction-status`, { patient_ids: ids })
  return emptySuccess({ items: payload.items || [] })
}

export const updatePatientEhrFolder = async (patientId = '', options = {}) => {
  if (!patientId) return emptySuccess({ created_jobs: 0, job_ids: [] })
  const {
    targetFormKeys = null,
    mode = 'incremental',
  } = options || {}
  const body = {
    ...(Array.isArray(targetFormKeys) && targetFormKeys.length > 0
      ? { target_form_keys: targetFormKeys.filter(Boolean) }
      : {}),
    ...(mode ? { mode } : {}),
  }
  const payload = await request.post(`${PATIENTS_ENDPOINT}/${patientId}/ehr/update-folder`, body)
  const targeted = Array.isArray(targetFormKeys) && targetFormKeys.length > 0
  return emptySuccess({
    ...payload,
    task_id: payload.batch_id || payload.job_ids?.[0] || '',
    message: targeted
      ? `已提交 ${payload.submitted_jobs || payload.created_jobs || 0} 个病历靶向抽取任务`
      : `已提交 ${payload.submitted_jobs || payload.created_jobs || 0} 个电子病历夹抽取任务，后台正在抽取`,
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

export const getPatientDocuments = async (patientId = '', options) => {
  const response = await getDocumentList({ patient_id: patientId, page: 1, page_size: 100 }, options)
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
