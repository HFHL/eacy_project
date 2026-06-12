import { emptyList, emptySuccess } from '../_empty'
import { normalizeFieldEvidence } from '../_evidence'
import request from '../request'
import {
  crfFieldUrl,
  inferCrfValuePayload,
  recordInstanceParams,
} from './crfValue'
import { PROJECTS_ENDPOINT } from './constants'

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

export const getProjectCrfFieldHistory = async (projectId = '', projectPatientId = '', fieldPath = '', options = {}) => {
  if (!projectId || !projectPatientId || !fieldPath) return emptySuccess({ history: [] })
  const events = await request.get(
    crfFieldUrl(projectId, projectPatientId, fieldPath, '/events'),
    recordInstanceParams(options)
  )
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

export const getCrfFieldEvidence = async (projectId = '', projectPatientId = '', fieldPath = '', options = {}) => {
  if (!projectId || !projectPatientId || !fieldPath) return emptySuccess([])
  const evidences = await request.get(
    crfFieldUrl(projectId, projectPatientId, fieldPath, '/evidence'),
    recordInstanceParams(options)
  )
  return emptySuccess((Array.isArray(evidences) ? evidences : []).map(normalizeFieldEvidence))
}

export const getProjectCrfFieldCandidates = async (projectId = '', projectPatientId = '', fieldPath = '', options = {}) => {
  if (!projectId || !projectPatientId || !fieldPath) return emptySuccess({
    candidates: [],
    selected_candidate_id: null,
    selected_value: null,
    has_value_conflict: false,
    distinct_value_count: 0,
  })
  const payload = await request.get(
    crfFieldUrl(projectId, projectPatientId, fieldPath, '/candidates'),
    recordInstanceParams(options)
  )
  return emptySuccess(payload)
}

export const saveProjectCrfFieldValue = async (projectId = '', projectPatientId = '', fieldPath = '', value, options = {}) => {
  if (!projectId || !projectPatientId || !fieldPath) return emptySuccess(null)
  const payload = {
    ...inferCrfValuePayload(fieldPath, value),
    ...recordInstanceParams(options),
    ...(options.note ? { note: options.note } : {}),
  }
  const current = await request.patch(crfFieldUrl(projectId, projectPatientId, fieldPath), payload)
  return emptySuccess(current)
}

export const deleteProjectCrfFieldValue = async (projectId = '', projectPatientId = '', fieldPath = '', options = {}) => {
  if (!projectId || !projectPatientId || !fieldPath) return emptySuccess(null)
  await request.delete(
    crfFieldUrl(projectId, projectPatientId, fieldPath),
    recordInstanceParams(options)
  )
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

export const selectProjectCrfFieldCandidate = async (
  projectId = '',
  projectPatientId = '',
  fieldPath = '',
  candidateId = '',
  selectedValue,
  options = {},
) => {
  if (!projectId || !projectPatientId || !fieldPath) return emptySuccess(null)
  if (!candidateId) return saveProjectCrfFieldValue(projectId, projectPatientId, fieldPath, selectedValue, options)
  const payload = await request.post(
    crfFieldUrl(projectId, projectPatientId, fieldPath, '/select-candidate'),
    {
      candidate_id: candidateId,
      ...recordInstanceParams(options),
    }
  )
  return emptySuccess(payload)
}
