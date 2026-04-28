import request from './request'
import { emptyFileUrl, emptyList, emptySuccess, emptyTask } from './_empty'

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

const getDocumentType = (document = {}) => (
  document.doc_type || document.document_type || document.metadata_json?.documentType || document.metadata_json?.document_type || ''
)

const getDocumentSubtype = (document = {}) => (
  document.doc_subtype || document.document_sub_type || document.metadata_json?.documentSubtype || document.metadata_json?.document_subtype || ''
)

const normalizeTaskStatus = (document = {}) => {
  const status = document.status || document.task_status || 'uploaded'
  if (status === 'archived') return 'archived'
  if (status === 'failed') return 'parse_failed'
  if (status === 'ocr_pending') return 'parsing'
  if (status === 'ocr_completed') return 'parsed'

  const ocrStatus = document.ocr_status || document.ocrStatus
  if (['queued', 'running'].includes(ocrStatus)) return 'parsing'
  if (ocrStatus === 'completed') return 'parsed'
  if (ocrStatus === 'failed') return 'parse_failed'

  return status
}

export const normalizeDocument = (document = {}) => {
  const metadata = document.metadata_json && typeof document.metadata_json === 'object'
    ? document.metadata_json
    : {}
  const fileName = document.original_filename || document.file_name || document.fileName || ''
  const documentType = getDocumentType(document)
  const documentSubtype = getDocumentSubtype(document)
  const taskStatus = normalizeTaskStatus(document)
  const createdAt = document.created_at || document.upload_time || document.uploadTime || ''
  const effectiveAt = document.effective_at || metadata.effectiveAt || metadata.effective_at || metadata.effectiveDate || ''
  const patientId = document.patient_id || document.patientId || document.patient_info?.patient_id || null

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
    doc_title: document.doc_title || metadata.documentTitle || metadata.title || fileName,
    metadata_json: metadata,
    metadata: {
      ...metadata,
      documentType,
      documentSubtype,
      effectiveDate: effectiveAt,
      effective_at: effectiveAt,
      organizationName: metadata.organizationName || metadata.organization_name || '',
    },
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
  if (uniqueStatuses.length === 1) next.status = uniqueStatuses[0]

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
    }
  })

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
  return buildApiUrl(`${DOCUMENTS_ENDPOINT}/${documentId}/stream`)
}

export const archiveDocument = async (documentId = '', patientId = '', createExtractionJob = true) => {
  const payload = await request.post(`${DOCUMENTS_ENDPOINT}/${documentId}/archive`, {
    patient_id: patientId,
    create_extraction_job: createExtractionJob,
  })
  return emptySuccess(normalizeDocument(payload))
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
export const extractEhrData = async () => emptyTask()
export const extractEhrDataTargeted = async () => emptyTask()
export const extractDocumentMetadata = async () => emptyTask()
export const markDocumentReview = async () => emptySuccess(null)
export const getDocumentOperationHistory = async () => emptyList()
export const aiMatchPatient = async () => emptySuccess(null)
export const aiExtractAndMatchPatient = aiMatchPatient
export const getDocumentAiMatchInfo = async () => emptySuccess(null)
export const confirmCreatePatientAndArchive = async () => emptySuccess(null)
export const batchCreatePatientAndArchive = async () => emptySuccess(null)
export const confirmAutoArchive = async () => emptySuccess(null)
export const batchConfirmAutoArchive = async () => emptySuccess(null)

export const searchUserFiles = async (params = {}) => getDocumentList(params)
export const getFileStatusById = async (documentId = '') => getDocumentDetail(documentId)
export const getFileStatusesByIds = async (documentIds = []) => {
  const statuses = {}
  for (const documentId of documentIds) {
    const response = await getDocumentDetail(documentId)
    if (response.success) statuses[documentId] = response.data
  }
  return emptySuccess(statuses)
}

export const getFileListV2Tree = async (params = {}) => {
  const response = await getDocumentList({ ...params, page: 1, page_size: 100 })
  const documents = response.data || []
  const groupMap = new Map()

  documents.forEach((document) => {
    const patientId = document.patient_info?.patient_id || 'unarchived'
    const groupKey = patientId === 'unarchived' ? 'virtual:unarchived' : `patient:${patientId}`
    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        id: groupKey,
        key: groupKey,
        patient_id: patientId === 'unarchived' ? null : patientId,
        patient_info: document.patient_info || null,
        documents: [],
      })
    }
    groupMap.get(groupKey).documents.push(document)
  })

  return emptySuccess({
    groups: Array.from(groupMap.values()),
    documents,
    total: response.total || documents.length,
  })
}

export const getFileListV2GroupDocuments = async (_groupId, params = {}) => getDocumentList(params)
export const rebuildGroups = async () => emptySuccess(null)
export const matchGroup = async () => emptySuccess(null)
export const confirmGroupArchive = async () => emptySuccess(null)
export const createPatientAndArchiveGroup = async () => emptySuccess(null)
export const moveDocumentToGroup = async () => emptySuccess(null)
export const uploadAndArchiveToPatient = async (file, patientId) => uploadDocument(file, patientId)
export const uploadAndArchiveAsync = async (file, patientId) => uploadDocument(file, patientId)
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
  archiveDocument,
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
