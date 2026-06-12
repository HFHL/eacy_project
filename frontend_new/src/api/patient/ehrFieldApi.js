import { emptyList, emptySuccess, emptyTask } from '../_empty'
import { normalizeFieldEvidence } from '../_evidence'
import request from '../request'
import { PATIENTS_ENDPOINT } from './constants'
import {
  inferEhrValuePayload,
  normalizeHistoryEvent,
  recordInstanceParams,
} from './ehrFieldValue'

export function synthesizeCandidatesFromHistory() { return [] }

export const getEhrFieldHistory = async (patientId = '', fieldPath = '', options = {}) => {
  const events = await request.get(
    `${PATIENTS_ENDPOINT}/${patientId}/ehr/fields/${encodeURIComponent(fieldPath)}/events`,
    recordInstanceParams(options)
  )
  return emptySuccess((Array.isArray(events) ? events : []).map(normalizeHistoryEvent))
}

export const getEhrFieldEvidence = async (patientId = '', fieldPath = '', options = {}) => {
  const evidences = await request.get(
    `${PATIENTS_ENDPOINT}/${patientId}/ehr/fields/${encodeURIComponent(fieldPath)}/evidence`,
    recordInstanceParams(options)
  )
  return emptySuccess((Array.isArray(evidences) ? evidences : []).map(normalizeFieldEvidence))
}

export const getEhrFieldHistoryV2 = async (patientId = '', fieldPath = '', options = {}) => {
  const history = await getEhrFieldHistory(patientId, fieldPath, options)
  return emptySuccess({ history: history.data || [] })
}

export const getEhrFieldHistoryV3 = async (patientId = '', fieldPath = '', options = {}) => getEhrFieldHistoryV2(patientId, fieldPath, options)

export const getEhrFieldCandidatesV3 = async (patientId = '', fieldPath = '', options = {}) => {
  if (!patientId || !fieldPath) return emptySuccess({
    candidates: [],
    selected_candidate_id: null,
    selected_value: null,
    has_value_conflict: false,
    distinct_value_count: 0,
  })
  const payload = await request.get(
    `${PATIENTS_ENDPOINT}/${patientId}/ehr/fields/${encodeURIComponent(fieldPath)}/candidates`,
    recordInstanceParams(options)
  )
  return emptySuccess(payload)
}

export const saveEhrFieldValueV3 = async (patientId = '', fieldPath = '', value, options = {}) => {
  if (!patientId || !fieldPath) return emptySuccess(null)
  const payload = {
    ...inferEhrValuePayload(fieldPath, value),
    ...recordInstanceParams(options),
    ...(options.note ? { note: options.note } : {}),
  }
  const current = await request.patch(
    `${PATIENTS_ENDPOINT}/${patientId}/ehr/fields/${encodeURIComponent(fieldPath)}`,
    payload
  )
  return emptySuccess(current)
}

export const deleteEhrFieldValueV3 = async (patientId = '', fieldPath = '', options = {}) => {
  if (!patientId || !fieldPath) return emptySuccess(null)
  await request.delete(
    `${PATIENTS_ENDPOINT}/${patientId}/ehr/fields/${encodeURIComponent(fieldPath)}`,
    recordInstanceParams(options)
  )
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

export const selectEhrFieldCandidateV3 = async (patientId = '', fieldPath = '', candidateId = '', selectedValue, options = {}) => {
  if (!patientId || !fieldPath) return emptySuccess(null)
  if (!candidateId) return saveEhrFieldValueV3(patientId, fieldPath, selectedValue, options)
  const payload = await request.post(
    `${PATIENTS_ENDPOINT}/${patientId}/ehr/fields/${encodeURIComponent(fieldPath)}/select-candidate`,
    {
      candidate_id: candidateId,
      ...recordInstanceParams(options),
    }
  )
  return emptySuccess(payload)
}

export const uploadAndExtractField = async () => emptyTask()
export const getFieldConflicts = async () => emptyList()
export const resolveFieldConflict = async () => emptySuccess(null)
