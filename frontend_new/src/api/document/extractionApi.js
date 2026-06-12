import { emptySuccess, emptyTask } from '../_empty'
import request from '../request'
import { DOCUMENTS_ENDPOINT } from './constants'
import { getDocumentDetail } from './documentsApi'
import { normalizeDocument } from './normalizers'

export const extractEhrData = async (documentId = '', patientId = '') => {
  if (!documentId) return emptyTask()
  const detail = await getDocumentDetail(documentId)
  const resolvedPatientId = patientId || detail.data?.patient_id
  const payload = await request.post('/extraction-jobs', {
    job_type: 'patient_ehr',
    patient_id: resolvedPatientId,
    document_id: documentId,
    input_json: { source: 'document_reextract', enqueue_async: true },
  })
  return emptySuccess({
    ...payload,
    task_id: payload.id,
    fields_count: 0,
  })
}

export const extractEhrDataTargeted = async (
  documentOrOptions = {},
  legacyPatientId = '',
  legacyTargetFormKey = '',
  legacyOptions = {},
) => {
  const options = typeof documentOrOptions === 'object' && documentOrOptions !== null
    ? documentOrOptions
    : {
        ...legacyOptions,
        documentId: documentOrOptions,
        patientId: legacyPatientId,
        targetFormKey: legacyTargetFormKey,
      }
  const {
    documentId = '',
    patientId = '',
    contextId = '',
    schemaVersionId = '',
    targetFormKey = '',
    waitForDocumentReady = false,
    jobType = options.instanceType === 'project_crf' ? 'project_crf' : 'patient_ehr',
    projectId = '',
    projectPatientId = '',
  } = options
  if (!documentId || !targetFormKey) return emptyTask()
  const payload = await request.post('/extraction-jobs', {
    job_type: jobType,
    patient_id: patientId || undefined,
    document_id: documentId,
    project_id: projectId || undefined,
    project_patient_id: projectPatientId || undefined,
    context_id: contextId || undefined,
    schema_version_id: schemaVersionId || undefined,
    target_form_key: targetFormKey,
    input_json: {
      source: 'form_targeted_extract',
      form_keys: [targetFormKey],
      wait_for_document_ready: !!waitForDocumentReady,
      enqueue_async: true,
    },
  })
  return emptySuccess({ ...payload, task_id: payload.id })
}

export const extractDocumentMetadata = async (documentId = '') => {
  if (!documentId) return emptyTask()
  const payload = await request.post(`${DOCUMENTS_ENDPOINT}/${documentId}/metadata`)
  return emptySuccess(normalizeDocument(payload))
}

export const extractEhrDataAsync = async (documentId = '', options = {}) => {
  if (!documentId) return emptyTask()
  const { patientId: patientIdOption = '', source = 'document_detail_manual' } = options
  let resolvedPatientId = patientIdOption
  if (!resolvedPatientId) {
    const detail = await getDocumentDetail(documentId)
    resolvedPatientId = detail.data?.patient_id || detail.data?.patientId || ''
  }
  if (!resolvedPatientId) {
    return {
      success: false,
      code: 1,
      message: '文档尚未绑定患者，请先归档或选择患者',
      data: null,
    }
  }
  const payload = await request.post('/extraction-jobs', {
    job_type: 'patient_ehr',
    patient_id: resolvedPatientId,
    document_id: documentId,
    input_json: {
      source,
      enqueue_async: true,
    },
  })
  return emptySuccess({
    ...payload,
    task_id: payload.id,
  })
}

export const getExtractionJob = async (jobId = '') => {
  if (!jobId) return emptyTask()
  const payload = await request.get(`/extraction-jobs/${jobId}`)
  return emptySuccess(payload)
}

export const aiMatchPatientAsync = async (documentId = '') => {
  if (!documentId) return emptyTask()
  const payload = await request.post(`${DOCUMENTS_ENDPOINT}/${encodeURIComponent(documentId)}/match-info/refresh`)
  return emptySuccess({
    ...payload,
    task_id: documentId,
    status: 'completed',
  })
}

export const batchAiMatchAsync = async () => emptyTask()
export const getDocumentTaskProgress = async () => emptyTask()
export const pollDocumentTaskProgress = async () => emptyTask()
export const checkDuplicateFiles = async () => emptySuccess([])
