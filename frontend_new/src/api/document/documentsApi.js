import { emptySuccess, emptyTask } from '../_empty'
import request from '../request'
import { DOCUMENTS_ENDPOINT } from './constants'
import {
  normalizeDocument,
  normalizeDocumentListResponse,
  normalizeListParams,
} from './normalizers'
import { normalizeUpdatePayload } from './updatePayload'

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

export const getDocumentList = async (params = {}, options) => {
  const payload = await request.get(DOCUMENTS_ENDPOINT, normalizeListParams(params), options)
  return normalizeDocumentListResponse(payload, params)
}

export const deleteDocument = async (documentId = '') => {
  await request.delete(`${DOCUMENTS_ENDPOINT}/${documentId}`)
  return emptySuccess(null)
}

export const getDocumentEvidenceImpact = async (documentId = '') => {
  if (!documentId) return emptySuccess({ document_id: '', evidence_count: 0, fields: [] })
  const payload = await request.get(`${DOCUMENTS_ENDPOINT}/${documentId}/evidence-impact`)
  return emptySuccess({
    document_id: payload?.document_id || documentId,
    evidence_count: Number(payload?.evidence_count) || 0,
    fields: Array.isArray(payload?.fields) ? payload.fields : [],
  })
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

export const markDocumentReview = async (documentId = '', requiresReview = false) => {
  if (!documentId) return emptySuccess(null, { message: '缺少文档 ID' })
  const detail = await getDocumentDetail(documentId)
  if (!detail?.success) return detail
  const metadata = {
    ...(detail.data?.metadata_json && typeof detail.data.metadata_json === 'object'
      ? detail.data.metadata_json
      : {}),
    requires_review: !!requiresReview,
  }
  const payload = await request.patch(`${DOCUMENTS_ENDPOINT}/${documentId}`, { metadata_json: metadata })
  return emptySuccess(normalizeDocument(payload))
}
