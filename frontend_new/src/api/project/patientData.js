import { emptySuccess } from '../_empty'
import { getDocumentList } from '../document/documentsApi'
import request from '../request'
import { documentListToMap, projectPatientToDetail } from './adapters'
import { PROJECTS_ENDPOINT } from './constants'

export const unwrapProjectPatientList = (payload) => {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.items)) return payload.items
  return []
}

export const fetchPatientDocuments = async (patientId = '') => {
  if (!patientId) return []
  try {
    const pageSize = 100
    let page = 1
    let allDocuments = []
    let total = null

    do {
      const response = await getDocumentList({ patient_id: patientId, page, page_size: pageSize })
      const pageItems = Array.isArray(response?.data) ? response.data : []
      allDocuments = allDocuments.concat(pageItems)
      total = Number(response?.pagination?.total ?? response?.total ?? total ?? allDocuments.length)
      if (pageItems.length < pageSize) break
      page += 1
    } while (allDocuments.length < total)

    return allDocuments
  } catch (error) {
    console.warn('[project] 获取项目患者文档失败:', error)
    return []
  }
}

export const fetchProjectPatientCrf = async (projectId = '', projectPatientId = '') => {
  if (!projectId || !projectPatientId) return null
  try {
    return await request.get(`${PROJECTS_ENDPOINT}/${projectId}/patients/${projectPatientId}/crf`)
  } catch (error) {
    console.warn('[project] 获取项目患者 CRF 失败:', error)
    return null
  }
}

export const getProjectPatientCrf = async (projectId = '', projectPatientId = '') => {
  if (!projectId || !projectPatientId) return emptySuccess(null)
  const payload = await request.get(`${PROJECTS_ENDPOINT}/${projectId}/patients/${projectPatientId}/crf`)
  return emptySuccess(payload)
}

export const mergePatientProfile = async (projectPatient = {}, crf = null) => {
  if (!projectPatient?.patient_id) return projectPatientToDetail(projectPatient, crf)
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
    }, crf)
  } catch {
    return projectPatientToDetail({
      ...projectPatient,
      documents,
      _documents: documentListToMap(documents),
      document_count: projectPatient.document_count ?? documents.length,
    }, crf)
  }
}

export const resolveProjectPatient = async (projectId = '', patientOrProjectPatientId = '') => {
  if (!projectId || !patientOrProjectPatientId) return null
  const payload = await request.get(`${PROJECTS_ENDPOINT}/${projectId}/patients`)
  const patients = unwrapProjectPatientList(payload)
  return patients.find((item) => (
    String(item.id) === String(patientOrProjectPatientId) ||
    String(item.patient_id) === String(patientOrProjectPatientId) ||
    String(item.enroll_no || '') === String(patientOrProjectPatientId)
  )) || null
}
