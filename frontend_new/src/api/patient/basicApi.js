import { emptySuccess } from '../_empty'
import request from '../request'
import { PATIENT_DEPARTMENT_OPTIONS } from '../../constants/patientDepartments'
import { PATIENTS_ENDPOINT } from './constants'
import {
  normalizeListParams,
  normalizeListPayload,
  normalizePatient,
  normalizePatientPayload,
} from './normalizers'

export const getPatientList = async (params = {}) => {
  const payload = await request.get(PATIENTS_ENDPOINT, normalizeListParams(params))
  return normalizeListPayload(payload)
}

export const createPatient = async (data = {}) => {
  const payload = await request.post(PATIENTS_ENDPOINT, normalizePatientPayload(data))
  return emptySuccess(normalizePatient(payload))
}

export const getPatientDetail = async (patientId = '', options) => {
  const payload = await request.get(`${PATIENTS_ENDPOINT}/${patientId}`, undefined, options)
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
