import { emptyCrfData } from './projectPatientDefaults'

export const mapTemplateInfo = (projectData) => {
  if (!projectData?.template_info) {
    return { fieldGroups: [], fieldMapping: {} }
  }
  const groups = projectData.template_info.field_groups || []
  const mapping = projectData.template_info.db_field_mapping || {}
  return {
    fieldGroups: groups.map((group, index) => ({
      key: group.group_id,
      name: group.group_name,
      status: 'pending',
      completeness: 0,
      order: group.order ?? index,
      isRepeatable: group.is_repeatable || false,
      dbFields: group.db_fields || [],
    })),
    fieldMapping: mapping.field_map || mapping || {},
  }
}

export const mapPatientInfo = (data) => ({
  id: data.id,
  patientId: data.patient_id,
  projectId: data.project_id,
  name: data.patient_name,
  gender: data.patient_gender,
  age: data.patient_age,
  birthDate: data.patient_birth_date,
  phone: data.patient_phone,
  patientCode: data.patient_code,
  diagnosis: data.patient_diagnosis || [],
  subjectId: data.subject_id,
  groupName: data.group_name,
  status: data.status,
  enrollmentDate: data.enrollment_date,
  crfCompleteness: data.crf_completeness || 0,
  documentCount: data.document_count || 0,
})

export const mapPatientDetailPayload = (data) => ({
  patientInfo: mapPatientInfo(data),
  crfData: data.crf_data || emptyCrfData,
  documents: data.documents || [],
})

export const buildCrfDebugInfo = (data) => ({
  hasCrfData: !!data.crf_data,
  crfDataKeys: data.crf_data ? Object.keys(data.crf_data) : [],
  groupsKeys: data.crf_data?.groups ? Object.keys(data.crf_data.groups) : [],
  hasData: !!data.crf_data?.data,
  dataKeys: data.crf_data?.data ? Object.keys(data.crf_data.data) : [],
  groupsSample: data.crf_data?.groups ? Object.entries(data.crf_data.groups).slice(0, 2) : [],
  dataSample: data.crf_data?.data ? JSON.stringify(data.crf_data.data).substring(0, 200) : 'null',
  crfDataString: JSON.stringify(data.crf_data || {}).substring(0, 500),
})

export const buildDocumentsDebugInfo = (documents, patientGlobalId) => ({
  count: Array.isArray(documents) ? documents.length : 'not-array',
  patientGlobalId,
  sample: Array.isArray(documents) && documents.length > 0
    ? {
      id: documents[0].id,
      name: documents[0].name,
      status: documents[0].status,
      patient_id: documents[0].patient_id,
      document_type: documents[0].document_type,
    }
    : null,
})
