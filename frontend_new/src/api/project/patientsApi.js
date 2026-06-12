import { emptySuccess } from '../_empty'
import request from '../request'
import {
  projectPatientToDetail,
  wrapList,
} from './adapters'
import { PROJECTS_ENDPOINT } from './constants'
import {
  fetchProjectPatientCrf,
  mergePatientProfile,
  resolveProjectPatient,
  unwrapProjectPatientList,
} from './patientData'

export const getProjectPatients = async (projectId = '', params = {}) => {
  if (!projectId) return wrapList([])
  const payload = await request.get(`${PROJECTS_ENDPOINT}/${projectId}/patients`, params)
  const list = unwrapProjectPatientList(payload)
  const enriched = list.map((patient) => projectPatientToDetail(patient, null))
  const serverPagination = payload && !Array.isArray(payload) ? payload : {}
  return wrapList(enriched, {
    page: serverPagination.page ?? params.page,
    page_size: serverPagination.page_size ?? params.page_size,
    total: typeof serverPagination.total === 'number' ? serverPagination.total : list.length,
  })
}

export const fetchProjectPatientsCrfGroupFields = async (
  projectId = '',
  { groupId = '', projectPatientIds = [] } = {},
) => {
  if (!projectId || !groupId) return emptySuccess({ items: [] })
  const ids = Array.from(new Set((Array.isArray(projectPatientIds) ? projectPatientIds : []).filter(Boolean)))
  if (!ids.length) return emptySuccess({ items: [] })
  const payload = await request.post(`${PROJECTS_ENDPOINT}/${projectId}/patients/crf-group-fields`, {
    group_id: groupId,
    project_patient_ids: ids,
  })
  return emptySuccess(payload)
}

export const getProjectPatientDetail = async (projectId = '', patientId = '') => {
  const projectPatient = await resolveProjectPatient(projectId, patientId)
  if (!projectPatient) return emptySuccess(null)
  const crf = await fetchProjectPatientCrf(projectId, projectPatient.id)
  const enriched = await mergePatientProfile(projectPatient, crf)
  return emptySuccess(enriched)
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
