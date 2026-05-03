import request, { ensureFreshAccessToken } from './request'
import { emptyFileUrl, emptyList, emptySuccess, emptyTask } from './_empty'
import { createPatient } from './patient'

const DOCUMENTS_ENDPOINT = '/documents'
const DEFAULT_API_BASE_URL = '/api/v1'

const trimTrailingSlash = (value = '') => value.replace(/\/+$/, '')
const trimLeadingSlash = (value = '') => value.replace(/^\/+/, '')

const getApiBaseUrl = () => trimTrailingSlash(import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL)

const buildApiUrl = (path = '') => {
  const apiBaseUrl = getApiBaseUrl()
  const url = `${apiBaseUrl}/${trimLeadingSlash(path)}`
  if (/^https?:\/\//i.test(url)) return url
  return url
}

const TASK_STATUS_ALIAS = {
  parsing: 'ocr_pending',
  parsed: 'ocr_completed',
  parse_failed: 'failed',
  pending_confirm_new: 'uploaded',
  pending_confirm_review: 'uploaded',
  pending_confirm_uncertain: 'uploaded',
  auto_archived: 'archived',
  parse: 'uploaded',
  todo: 'uploaded',
}

const toArray = (value) => {
  if (Array.isArray(value)) return value
  if (value === undefined || value === null || value === '') return []
  return String(value).split(',').map((item) => item.trim()).filter(Boolean)
}

const getFileType = (document = {}) => (
  document.file_ext || document.mime_type || document.file_type || 'unknown'
)

const METADATA_FIELD_TO_CN = {
  identifiers: '唯一标识符',
  organizationName: '机构名称',
  patientName: '患者姓名',
  gender: '患者性别',
  age: '患者年龄',
  birthDate: '出生日期',
  phone: '联系电话',
  diagnosis: '诊断',
  department: '科室信息',
  documentType: '文档类型',
  documentSubtype: '文档子类型',
  documentTitle: '文档标题',
  effectiveDate: '文档生效日期',
}

const getMetadataResult = (metadata = {}) => (
  metadata?.result && typeof metadata.result === 'object' && !Array.isArray(metadata.result)
    ? metadata.result
    : {}
)

const firstNonEmpty = (...values) => {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value
  }
  return ''
}

const normalizeMetadataForDisplay = (metadata = {}, summary = {}) => {
  const safeMetadata = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
  const safeSummary = summary && typeof summary === 'object' && !Array.isArray(summary) ? summary : {}
  const result = getMetadataResult(safeMetadata)
  const identifiers = Array.isArray(result['唯一标识符'])
    ? result['唯一标识符']
    : (Array.isArray(safeMetadata.identifiers) ? safeMetadata.identifiers : (Array.isArray(safeSummary.identifiers) ? safeSummary.identifiers : []))

  return {
    ...safeMetadata,
    result,
    identifiers,
    organizationName: firstNonEmpty(safeMetadata.organizationName, safeMetadata.organization_name, safeSummary.organization_name, result['机构名称']),
    patientName: firstNonEmpty(safeMetadata.patientName, safeMetadata.patient_name, safeSummary.patient_name, result['患者姓名']),
    gender: firstNonEmpty(safeMetadata.gender, safeMetadata.patient_gender, safeSummary.patient_gender, result['患者性别']),
    age: firstNonEmpty(safeMetadata.age, safeMetadata.patient_age, safeSummary.patient_age, result['患者年龄']),
    birthDate: firstNonEmpty(safeMetadata.birthDate, safeMetadata.birth_date, safeSummary.birth_date, result['出生日期']),
    phone: firstNonEmpty(safeMetadata.phone, safeSummary.phone, result['联系电话']),
    diagnosis: firstNonEmpty(safeMetadata.diagnosis, safeSummary.diagnosis, result['诊断']),
    department: firstNonEmpty(safeMetadata.department, safeSummary.department, result['科室信息']),
    documentType: firstNonEmpty(safeMetadata.documentType, safeMetadata.document_type, safeSummary.document_type, result['文档类型']),
    documentSubtype: firstNonEmpty(safeMetadata.documentSubtype, safeMetadata.document_subtype, safeSummary.document_subtype, result['文档子类型']),
    documentTitle: firstNonEmpty(safeMetadata.documentTitle, safeMetadata.document_title, safeMetadata.title, safeSummary.document_title, result['文档标题']),
    effectiveDate: firstNonEmpty(safeMetadata.effectiveDate, safeMetadata.effective_at, safeMetadata.effectiveAt, safeSummary.effective_date, result['文档生效日期']),
  }
}

const getDocumentType = (document = {}) => (
  document.doc_type || document.document_type || normalizeMetadataForDisplay(document.metadata_json, document.document_metadata_summary).documentType || ''
)

const getDocumentSubtype = (document = {}) => (
  document.doc_subtype || document.document_sub_type || normalizeMetadataForDisplay(document.metadata_json, document.document_metadata_summary).documentSubtype || ''
)

const normalizeTaskStatus = (document = {}) => {
  const status = document.status || document.task_status || 'uploaded'
  const archivedAt = document.archived_at || document.archivedAt
  if (status === 'archived' || archivedAt) return 'archived'
  if (status === 'failed') return 'parse_failed'
  if (status === 'ocr_pending') return 'parsing'

  const ocrStatus = document.ocr_status || document.ocrStatus
  const metaStatus = document.meta_status || document.metaStatus
  if ((status === 'ocr_completed' || ocrStatus === 'completed') && metaStatus === 'completed') {
    return 'pending_confirm_uncertain'
  }
  if (status === 'ocr_completed') return 'parsed'
  if (['queued', 'running'].includes(ocrStatus)) return 'parsing'
  if (ocrStatus === 'completed') return 'parsed'
  if (ocrStatus === 'failed') return 'parse_failed'

  return status
}

export const normalizeDocument = (document = {}) => {
  const metadata = document.metadata_json && typeof document.metadata_json === 'object'
    ? document.metadata_json
    : {}
  const displayMetadata = normalizeMetadataForDisplay(metadata, document.document_metadata_summary)
  const fileName = document.original_filename || document.file_name || document.fileName || ''
  const documentType = getDocumentType(document)
  const documentSubtype = getDocumentSubtype(document)
  const taskStatus = normalizeTaskStatus(document)
  const createdAt = document.created_at || document.upload_time || document.uploadTime || ''
  const effectiveAt = document.effective_at || displayMetadata.effectiveDate || ''
  const patientId = document.patient_id || document.patientId || document.patient_info?.patient_id || null
  const documentMetadataSummary = document.document_metadata_summary || {
    name: displayMetadata.patientName,
    gender: displayMetadata.gender,
    age: displayMetadata.age,
  }

  return {
    ...document,
    id: document.id,
    document_id: document.id,
    documentId: document.id,
    original_filename: fileName,
    file_name: fileName,
    fileName,
    name: fileName,
    file_ext: document.file_ext || '',
    file_type: getFileType(document),
    fileType: getFileType(document),
    mime_type: document.mime_type || '',
    file_size: document.file_size || 0,
    fileSize: document.file_size || 0,
    file_url: document.file_url || '',
    fileUrl: document.file_url || '',
    storage_path: document.storage_path || '',
    status: document.status || taskStatus,
    task_status: taskStatus,
    taskStatus,
    upload_time: createdAt,
    uploadTime: createdAt,
    created_at: createdAt,
    createdAt,
    updated_at: document.updated_at || '',
    archived_at: document.archived_at || '',
    patient_id: patientId,
    patientId,
    patient_info: {
      ...(document.patient_info || {}),
      patient_id: patientId,
    },
    bound_patient_summary: patientId ? { patient_id: patientId } : null,
    document_type: documentType,
    documentType,
    document_sub_type: documentSubtype,
    documentSubtype,
    doc_type: document.doc_type || documentType,
    doc_subtype: document.doc_subtype || documentSubtype,
    doc_title: document.doc_title || displayMetadata.documentTitle || fileName,
    metadata_json: metadata,
    metadata: {
      ...displayMetadata,
      documentType,
      documentSubtype,
      effectiveDate: effectiveAt,
      effective_at: effectiveAt,
    },
    document_metadata_summary: documentMetadataSummary,
    effective_at: effectiveAt || null,
    is_parsed: ['parsed', 'extracted', 'ai_matching', 'archived'].includes(taskStatus) || !!document.ocr_text,
    isParsed: ['parsed', 'extracted', 'ai_matching', 'archived'].includes(taskStatus) || !!document.ocr_text,
    category: documentSubtype || documentType || '未分类',
  }
}

const normalizeListParams = (params = {}) => {
  const next = {
    page: params.page || params.current || 1,
    page_size: params.page_size || params.pageSize || 20,
  }

  const patientId = params.patient_id ?? params.patientId
  if (patientId) next.patient_id = patientId

  const statuses = toArray(params.status ?? params.task_status ?? params.taskStatus)
    .map((status) => TASK_STATUS_ALIAS[status] || status)
    .filter(Boolean)
  const uniqueStatuses = Array.from(new Set(statuses))
  if (uniqueStatuses.length) next.status = uniqueStatuses.join(',')

  return next
}

const applyClientFilters = (items = [], params = {}) => {
  let result = items
  const keyword = (params.keyword ?? params.search ?? '').toString().trim().toLowerCase()
  if (keyword) {
    result = result.filter((item) => (
      item.file_name?.toLowerCase().includes(keyword) ||
      item.document_type?.toLowerCase().includes(keyword) ||
      item.document_sub_type?.toLowerCase().includes(keyword)
    ))
  }

  const wantedStatuses = toArray(params.status ?? params.task_status ?? params.taskStatus)
  if (wantedStatuses.length > 1) {
    const statusSet = new Set(wantedStatuses.map((status) => TASK_STATUS_ALIAS[status] || status))
    result = result.filter((item) => statusSet.has(item.task_status))
  }

  const documentTypes = toArray(params.document_types ?? params.document_type)
  if (documentTypes.length) {
    const typeSet = new Set(documentTypes)
    result = result.filter((item) => typeSet.has(item.document_sub_type || item.document_type || '未分类'))
  }

  return result
}

export const normalizeDocumentListResponse = (payload = {}, params = {}) => {
  const page = Number(payload.page || params.page || 1)
  const pageSize = Number(payload.page_size || params.page_size || params.pageSize || 20)
  const items = applyClientFilters(
    (Array.isArray(payload.items) ? payload.items : []).map(normalizeDocument),
    params
  )
  const total = Number(payload.total ?? items.length)

  items.items = items
  items.list = items
  items.total = total
  items.page = page
  items.page_size = pageSize

  return emptySuccess(items, {
    list: items,
    items,
    total,
    page,
    page_size: pageSize,
    pagination: { total, page, page_size: pageSize },
  })
}

const normalizeUpdatePayload = (metadata = {}) => {
  const payload = {}
  const nextMetadata = { ...(metadata.metadata_json || metadata.metadata || {}) }
  const result = {
    ...(nextMetadata.result && typeof nextMetadata.result === 'object' && !Array.isArray(nextMetadata.result)
      ? nextMetadata.result
      : {}),
  }

  const docType = metadata.doc_type ?? metadata.document_type ?? metadata.documentType
  if (docType !== undefined) payload.doc_type = docType

  const docSubtype = metadata.doc_subtype ?? metadata.document_sub_type ?? metadata.documentSubtype
  if (docSubtype !== undefined) payload.doc_subtype = docSubtype

  const docTitle = metadata.doc_title ?? metadata.document_title ?? metadata.documentTitle ?? metadata.title
  if (docTitle !== undefined) payload.doc_title = docTitle

  const effectiveAt = metadata.effective_at ?? metadata.effectiveAt ?? metadata.effectiveDate
  if (effectiveAt !== undefined) payload.effective_at = effectiveAt || null

  ;['meta_status', 'ocr_status', 'ocr_text', 'ocr_payload_json'].forEach((key) => {
    if (metadata[key] !== undefined) payload[key] = metadata[key]
  })

  Object.entries(metadata).forEach(([key, value]) => {
    if (payload[key] === undefined && !['metadata', 'metadata_json'].includes(key)) {
      nextMetadata[key] = value
      const cnKey = METADATA_FIELD_TO_CN[key]
      if (cnKey) result[cnKey] = value
    }
  })

  if (Object.keys(result).length) nextMetadata.result = result
  if (Object.keys(nextMetadata).length) payload.metadata_json = nextMetadata
  return payload
}

export const uploadDocument = async (file, patientIdOrProgress, progressOrSignal, maybeSignal) => {
  const patientId = typeof patientIdOrProgress === 'string' ? patientIdOrProgress : null
  const onProgress = typeof patientIdOrProgress === 'function' ? patientIdOrProgress : progressOrSignal
  const signal = maybeSignal || (progressOrSignal instanceof AbortSignal ? progressOrSignal : undefined)

  const formData = new FormData()
  formData.append('file', file)
  if (patientId) formData.append('patient_id', patientId)

  if (typeof onProgress === 'function') onProgress(5)
  const payload = await request.post(DOCUMENTS_ENDPOINT, formData, { signal })
  if (typeof onProgress === 'function') onProgress(100)

  const document = normalizeDocument(payload)
  return emptySuccess({
    ...document,
    document_id: document.id,
  })
}

export const uploadDocuments = async (files = [], patientId = null) => {
  const results = []
  for (const file of files) {
    const response = await uploadDocument(file, patientId)
    results.push(response.data)
  }
  return results
}

export const getDocumentList = async (params = {}) => {
  const payload = await request.get(DOCUMENTS_ENDPOINT, normalizeListParams(params))
  return normalizeDocumentListResponse(payload, params)
}

export const deleteDocument = async (documentId = '') => {
  await request.delete(`${DOCUMENTS_ENDPOINT}/${documentId}`)
  return emptySuccess(null)
}

export const deleteDocuments = async (documentIds = []) => {
  const ids = Array.isArray(documentIds) ? documentIds : (documentIds?.document_ids || [])
  let deleted = 0
  for (const documentId of ids) {
    await deleteDocument(documentId)
    deleted += 1
  }
  return emptySuccess({ deleted, success_count: deleted, failed_count: 0 })
}

export const getDocumentTempUrl = async (documentId = '', expiresIn = 3600) => {
  if (!documentId) return emptyFileUrl({ document_id: documentId })
  const payload = await request.get(`${DOCUMENTS_ENDPOINT}/${documentId}/preview-url`, {
    expires_in: expiresIn,
  })
  const tempUrl = payload.temp_url || payload.preview_url || payload.url || ''
  return emptySuccess({
    ...payload,
    document_id: payload.document_id || documentId,
    url: payload.url || tempUrl,
    temp_url: tempUrl,
    preview_url: payload.preview_url || tempUrl,
  })
}

export function getDocumentPdfStreamUrl(documentId = '') {
  if (!documentId) return ''
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : ''
  const path = buildApiUrl(`${DOCUMENTS_ENDPOINT}/${encodeURIComponent(documentId)}/stream`)
  return token ? `${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}` : path
}

export async function getFreshDocumentPdfStreamUrl(documentId = '') {
  if (!documentId) return ''
  const token = typeof localStorage !== 'undefined' ? await ensureFreshAccessToken() : ''
  const path = buildApiUrl(`${DOCUMENTS_ENDPOINT}/${encodeURIComponent(documentId)}/stream`)
  return token ? `${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}` : path
}

export const archiveDocument = async (documentId = '', patientId = '', createExtractionJob = true) => {
  const payload = await request.post(`${DOCUMENTS_ENDPOINT}/${documentId}/archive`, {
    patient_id: patientId,
    create_extraction_job: createExtractionJob,
  })
  return emptySuccess(normalizeDocument(payload))
}

export const batchArchiveDocuments = async (documentIds = [], patientId = '', createExtractionJob = true) => {
  const ids = Array.isArray(documentIds) ? documentIds.filter(Boolean) : []
  if (!ids.length || !patientId) return emptySuccess({ items: [], total: 0 })
  const payload = await request.post(`${DOCUMENTS_ENDPOINT}/batch-archive`, {
    document_ids: ids,
    patient_id: patientId,
    create_extraction_job: createExtractionJob,
  })
  const items = Array.isArray(payload.items) ? payload.items.map(normalizeDocument) : []
  return emptySuccess({ ...payload, items, total: payload.total ?? items.length })
}

export const unarchiveDocument = async (documentId = '') => {
  const payload = await request.post(`${DOCUMENTS_ENDPOINT}/${documentId}/unarchive`)
  return emptySuccess(normalizeDocument(payload))
}

export const changeArchivePatient = archiveDocument
export const parseDocument = async (documentId = '') => {
  if (!documentId) return emptyTask()
  const payload = await request.post(`${DOCUMENTS_ENDPOINT}/${documentId}/ocr`)
  return emptySuccess(normalizeDocument(payload))
}
export const reparseDocumentSync = parseDocument

export const getDocumentDetail = async (documentId = '') => {
  const payload = await request.get(`${DOCUMENTS_ENDPOINT}/${documentId}`)
  return emptySuccess(normalizeDocument(payload))
}

export const updateDocumentMetadata = async (documentId = '', metadata = {}) => {
  const payload = await request.patch(`${DOCUMENTS_ENDPOINT}/${documentId}`, normalizeUpdatePayload(metadata))
  return emptySuccess(normalizeDocument(payload))
}

export const getParseResult = async () => emptySuccess(null)
export const getParseProgress = async () => emptyTask()
export const parseDocuments = async () => []
export const extractEhrData = async (documentId = '', patientId = '') => {
  if (!documentId) return emptyTask()
  const detail = await getDocumentDetail(documentId)
  const resolvedPatientId = patientId || detail.data?.patient_id
  const payload = await request.post('/extraction-jobs', {
    job_type: 'patient_ehr',
    patient_id: resolvedPatientId,
    document_id: documentId,
    input_json: { source: 'document_reextract' },
  })
  let fieldsCount = 0
  if (payload?.id) {
    const runs = await request.get(`/extraction-jobs/${payload.id}/runs`)
    fieldsCount = Array.isArray(runs)
      ? runs.reduce((sum, run) => sum + (run.parsed_output_json?.fields?.length || 0), 0)
      : 0
  }
  return emptySuccess({
    ...payload,
    task_id: payload.id,
    fields_count: fieldsCount,
  })
}
export const extractEhrDataTargeted = async (documentOrOptions = {}, legacyPatientId = '', legacyTargetFormKey = '', legacyOptions = {}) => {
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
export const markDocumentReview = async () => emptySuccess(null)
export const getDocumentOperationHistory = async () => emptyList()
export const aiMatchPatient = async () => emptySuccess(null)
export const aiExtractAndMatchPatient = aiMatchPatient
export const getDocumentAiMatchInfo = async () => emptySuccess(null)
export const confirmCreatePatientAndArchive = async (documentId = '', patientData = {}) => {
  if (!documentId) return emptySuccess(null, { message: '缺少文档 ID' })
  const patientRes = await createPatient(patientData)
  if (!patientRes?.success || !patientRes?.data?.id) return patientRes

  const archiveRes = await archiveDocument(documentId, patientRes.data.id, true)
  return emptySuccess({
    patient: patientRes.data,
    patientId: patientRes.data.id,
    documentIds: [documentId],
    archived_count: archiveRes?.success ? 1 : 0,
    archived_document_ids: archiveRes?.success ? [documentId] : [],
    archive: archiveRes?.data || null,
  })
}
export const batchCreatePatientAndArchive = async (documentIds = [], patientData = {}) => {
  const ids = Array.isArray(documentIds) ? documentIds.filter(Boolean) : []
  if (!ids.length) return emptySuccess(null, { message: '缺少文档 ID' })
  const patientRes = await createPatient(patientData)
  if (!patientRes?.success || !patientRes?.data?.id) return patientRes

  const archivedIds = []
  const failed = []
  for (const documentId of ids) {
    try {
      const archiveRes = await archiveDocument(documentId, patientRes.data.id, true)
      if (archiveRes?.success) archivedIds.push(documentId)
      else failed.push({ documentId, message: archiveRes?.message || '归档失败' })
    } catch (error) {
      failed.push({ documentId, message: error?.message || '归档失败' })
    }
  }

  return emptySuccess({
    patient: patientRes.data,
    patientId: patientRes.data.id,
    documentIds: ids,
    archived_count: archivedIds.length,
    archived_document_ids: archivedIds,
    failed,
  })
}
export const confirmAutoArchive = async () => emptySuccess(null)
export const batchConfirmAutoArchive = async () => emptySuccess(null)

export const searchUserFiles = async (params = {}) => getDocumentList(params)
export const getFileStatusById = async (documentId = '') => getDocumentDetail(documentId)
export const getFileStatusesByIds = async (documentIds = []) => {
  const ids = Array.from(new Set((Array.isArray(documentIds) ? documentIds : []).filter(Boolean)))
  if (!ids.length) return emptySuccess({ items: [], list: [], total: 0 })
  const payload = await request.post(`${DOCUMENTS_ENDPOINT}/statuses`, { document_ids: ids })
  const items = (payload.items || []).map(normalizeDocument)
  return emptySuccess({ items, list: items, total: items.length })
}

export const getFileListV2Tree = async (params = {}) => {
  const payload = await request.get(`${DOCUMENTS_ENDPOINT}/v2/tree`, params)
  return emptySuccess(payload)
}

const getGroupTaskStatus = (matchInfo = {}) => {
  const result = matchInfo.match_result
  if (result === 'pending') return 'parsing'
  if (result === 'matched') return 'auto_archived'
  if (result === 'review') return 'pending_confirm_review'
  if (result === 'new') return 'pending_confirm_new'
  return 'pending_confirm_uncertain'
}

export const getFileListV2GroupDocuments = async (groupId, params = {}) => {
  const payload = await request.get(`${DOCUMENTS_ENDPOINT}/v2/groups/${groupId}/documents`, params)
  const taskStatus = getGroupTaskStatus(payload.match_info || {})
  const items = (payload.items || []).map((item) => normalizeDocument({ ...item, task_status: taskStatus }))
  return emptySuccess({ ...payload, items })
}

export const rebuildGroups = async () => getFileListV2Tree({ refresh: true })
export const matchGroup = async (groupId) => getFileListV2GroupDocuments(groupId)
export const confirmGroupArchive = async (groupId, patientId, autoMergeEhr = true) => {
  const payload = await request.post(`${DOCUMENTS_ENDPOINT}/v2/groups/${groupId}/confirm-archive`, {}, {
    params: { patient_id: patientId, auto_merge_ehr: autoMergeEhr },
  })
  return emptySuccess(payload)
}
export const createPatientAndArchiveGroup = async () => emptySuccess(null)
export const moveDocumentToGroup = async () => emptySuccess(null)
export const uploadAndArchiveToPatient = async (file, patientId) => {
  const uploadRes = await uploadDocument(file, patientId)
  const documentId = uploadRes?.data?.id || uploadRes?.data?.document_id
  if (!documentId || !patientId) return uploadRes
  return archiveDocument(documentId, patientId, false)
}
export const uploadAndArchiveAsync = uploadAndArchiveToPatient
export const extractEhrDataAsync = async () => emptyTask()
export const aiMatchPatientAsync = async () => emptyTask()
export const batchAiMatchAsync = async () => emptyTask()
export const getDocumentTaskProgress = async () => emptyTask()
export const pollDocumentTaskProgress = async () => emptyTask()
export const checkDuplicateFiles = async () => emptySuccess([])

export default {
  uploadDocument,
  uploadDocuments,
  getDocumentList,
  deleteDocument,
  deleteDocuments,
  getDocumentTempUrl,
  getDocumentPdfStreamUrl,
  getFreshDocumentPdfStreamUrl,
  archiveDocument,
  batchArchiveDocuments,
  unarchiveDocument,
  changeArchivePatient,
  parseDocument,
  reparseDocumentSync,
  getDocumentDetail,
  updateDocumentMetadata,
  getParseResult,
  getParseProgress,
  parseDocuments,
  extractEhrData,
  extractEhrDataTargeted,
  extractDocumentMetadata,
  markDocumentReview,
  getDocumentOperationHistory,
  aiMatchPatient,
  aiExtractAndMatchPatient,
  getDocumentAiMatchInfo,
  confirmCreatePatientAndArchive,
  batchCreatePatientAndArchive,
  confirmAutoArchive,
  batchConfirmAutoArchive,
  searchUserFiles,
  getFileStatusById,
  getFileStatusesByIds,
  getFileListV2Tree,
  getFileListV2GroupDocuments,
  rebuildGroups,
  matchGroup,
  confirmGroupArchive,
  createPatientAndArchiveGroup,
  moveDocumentToGroup,
  uploadAndArchiveToPatient,
  uploadAndArchiveAsync,
  extractEhrDataAsync,
  aiMatchPatientAsync,
  batchAiMatchAsync,
  getDocumentTaskProgress,
  pollDocumentTaskProgress,
  checkDuplicateFiles,
}
