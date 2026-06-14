import { emptySuccess, emptyTask } from '../_empty'
import { extractEhrDataTargeted } from '../document/extractionApi'
import request from '../request'
import { PROJECTS_ENDPOINT } from './constants'

export const updateProjectCrfFolder = async (projectId = '', projectPatientId = '', options = {}) => {
  if (!projectId || !projectPatientId) return emptySuccess({ created_jobs: 0, job_ids: [] })
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
  const payload = await request.post(
    `${PROJECTS_ENDPOINT}/${projectId}/patients/${projectPatientId}/crf/update-folder`,
    body,
  )
  const targeted = Array.isArray(targetFormKeys) && targetFormKeys.length > 0
  const planning = payload.planning_submitted === true
  const submittedCount = payload.submitted_jobs || payload.created_jobs || 0
  return emptySuccess({
    ...payload,
    task_id: payload.batch_id || payload.job_ids?.[0] || '',
    message: planning
      ? (targeted ? '已提交项目 CRF 靶向抽取任务，后台正在规划' : '已提交项目 CRF 抽取任务，后台正在规划')
      : (targeted
          ? `已提交 ${submittedCount} 个项目 CRF 靶向抽取任务`
          : `已提交 ${submittedCount} 个项目 CRF 抽取任务，后台正在抽取`),
  })
}

export const updateProjectCrfFolderBatch = async (projectId = '', projectPatientIds = null, options = {}) => {
  if (!projectId) return emptySuccess({ created_jobs: 0, job_ids: [] })
  const {
    targetFormKeys = null,
    mode = 'incremental',
  } = options || {}
  const body = {
    ...(Array.isArray(projectPatientIds) && projectPatientIds.length > 0
      ? { project_patient_ids: projectPatientIds.filter(Boolean) }
      : {}),
    ...(Array.isArray(targetFormKeys) && targetFormKeys.length > 0
      ? { target_form_keys: targetFormKeys.filter(Boolean) }
      : {}),
    ...(mode ? { mode } : {}),
  }
  const payload = await request.post(`${PROJECTS_ENDPOINT}/${projectId}/crf/update-folder`, body)
  const targeted = Array.isArray(targetFormKeys) && targetFormKeys.length > 0
  const planning = payload.planning_submitted === true
  const submittedCount = payload.submitted_jobs || payload.created_jobs || 0
  return emptySuccess({
    ...payload,
    task_id: payload.batch_id || payload.job_ids?.[0] || '',
    message: planning
      ? (targeted ? '已提交项目 CRF 靶向抽取任务，后台正在规划' : '已提交项目 CRF 抽取任务，后台正在规划')
      : (targeted
          ? `已提交 ${submittedCount} 个项目 CRF 靶向抽取任务`
          : `已提交 ${submittedCount} 个项目 CRF 抽取任务，后台正在抽取`),
  })
}

export const startCrfExtraction = async ({
  projectId = '',
  projectPatientId = '',
  patientId = '',
  documentId = '',
  contextId = '',
  schemaVersionId = '',
  targetFormKey = '',
  waitForDocumentReady = false,
} = {}) => extractEhrDataTargeted({
  jobType: 'project_crf',
  projectId,
  projectPatientId,
  patientId,
  documentId,
  contextId,
  schemaVersionId,
  targetFormKey,
  waitForDocumentReady,
})

export const getCrfExtractionProgress = async (_projectId = '', taskId = '') => {
  if (!taskId) return emptyTask()
  try {
    const batch = await request.get(`/task-batches/${taskId}`)
    const failedItems = Array.isArray(batch.items) ? batch.items.filter(item => ['failed', 'timeout'].includes(item.status)) : []
    const normalizedStatus = batch.status === 'succeeded' ? 'completed' : batch.status
    return emptySuccess({
      ...batch,
      status: normalizedStatus,
      task_id: batch.batch_id || batch.id,
      total_patients: batch.total_items || 0,
      processed_patients: (batch.succeeded_items || 0) + (batch.failed_items || 0) + (batch.cancelled_items || 0),
      success_count: batch.succeeded_items || 0,
      error_count: batch.failed_items || 0,
      current_step: batch.message || batch.items?.find(item => item.status === 'running')?.stage_label || '',
      errors: failedItems.map(item => ({
        patient_id: item.patient_id || item.project_patient_id || '',
        error: item.error_message || item.message || '抽取失败',
      })),
    })
  } catch (error) {
    if (error?.status && error.status !== 404) throw error
  }
  try {
    const job = await request.get(`/extraction-jobs/${taskId}`)
    return emptySuccess({
      ...job,
      task_id: job.id,
      progress: job.progress ?? 0,
      success_count: job.status === 'completed' ? 1 : 0,
      error_count: ['failed', 'timeout'].includes(job.status) ? 1 : 0,
    })
  } catch (error) {
    if (error?.status === 404) {
      return emptySuccess(null, { notFound: true })
    }
    throw error
  }
}

export const listProjectActiveExtractionBatches = async (projectId = '') => {
  if (!projectId) return emptySuccess([])
  const batches = await request.get(`${PROJECTS_ENDPOINT}/${projectId}/crf/extraction-batches/active`)
  return emptySuccess(Array.isArray(batches) ? batches : [])
}
