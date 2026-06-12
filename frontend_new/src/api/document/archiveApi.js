import { emptyList, emptySuccess } from '../_empty'
import request from '../request'
import { DOCUMENTS_ENDPOINT } from './constants'
import { normalizeDocument } from './normalizers'

const createPatientFromApi = async (patientData) => {
  const { createPatient } = await import('../patient')
  return createPatient(patientData)
}

export const archiveDocument = async (documentId = '', patientId = '', createExtractionJob = true) => {
  const payload = await request.post(`${DOCUMENTS_ENDPOINT}/${documentId}/archive`, {
    patient_id: patientId,
    create_extraction_job: createExtractionJob,
  })
  return emptySuccess(normalizeDocument(payload))
}

export const pickRecommendedPatientId = (matchInfo = {}) => {
  if (!matchInfo || typeof matchInfo !== 'object') return ''
  const candidates = Array.isArray(matchInfo.candidates) ? matchInfo.candidates : []
  const top = candidates[0] || {}
  const topId = top.id || top.patient_id || top.patientId || ''
  return matchInfo.matched_patient_id || matchInfo.ai_recommendation || topId || ''
}

export const getDocumentAiMatchInfo = async (documentId = '') => {
  if (!documentId) return emptySuccess(null)
  const payload = await request.get(`${DOCUMENTS_ENDPOINT}/${encodeURIComponent(documentId)}/match-info`)
  return emptySuccess(payload)
}

export const refreshDocumentMatchInfo = async (documentId = '') => {
  if (!documentId) return emptySuccess(null)
  const payload = await request.post(`${DOCUMENTS_ENDPOINT}/${encodeURIComponent(documentId)}/match-info/refresh`)
  return emptySuccess(payload)
}

export const resolveDocumentRecommendedPatientId = async (documentId, options = {}) => {
  const {
    groupId = '',
    groupMatchInfo = null,
    treeGroups = [],
    fetchGroupMatchInfo,
  } = options

  if (groupMatchInfo) {
    const cachedId = pickRecommendedPatientId(groupMatchInfo)
    if (cachedId) return { patientId: cachedId, matchInfo: groupMatchInfo, source: 'group_cache' }
  }

  if (groupId && typeof fetchGroupMatchInfo === 'function') {
    const groupRes = await fetchGroupMatchInfo(groupId)
    const fetchedInfo = groupRes?.data?.match_info || groupRes?.data || null
    const fetchedId = pickRecommendedPatientId(fetchedInfo)
    if (fetchedId) return { patientId: fetchedId, matchInfo: fetchedInfo, source: 'group_fetch' }
  }

  if (documentId && Array.isArray(treeGroups) && treeGroups.length) {
    const treeGroup = treeGroups.find(
      (group) => Array.isArray(group.document_ids) && group.document_ids.includes(documentId)
    )
    if (treeGroup?.matched_patient_id) {
      return { patientId: treeGroup.matched_patient_id, matchInfo: null, source: 'tree' }
    }
  }

  const matchRes = await getDocumentAiMatchInfo(documentId)
  const matchInfo = matchRes?.data || null
  const patientId = pickRecommendedPatientId(matchInfo)
  return { patientId, matchInfo, source: patientId ? 'document' : 'none' }
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

export const changeArchivePatient = async (documentId = '', patientId = '', options = true) => {
  let createExtractionJob = true
  if (typeof options === 'boolean') {
    createExtractionJob = options
  } else if (options && typeof options === 'object') {
    createExtractionJob = options.createExtractionJob ?? options.autoMergeEhr ?? true
  }
  return archiveDocument(documentId, patientId, createExtractionJob)
}

export const aiMatchPatient = refreshDocumentMatchInfo
export const aiExtractAndMatchPatient = refreshDocumentMatchInfo

export const confirmCreatePatientAndArchive = async (documentId = '', patientData = {}) => {
  if (!documentId) return emptySuccess(null, { message: '缺少文档 ID' })
  const patientRes = await createPatientFromApi(patientData)
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
  const patientRes = await createPatientFromApi(patientData)
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
export const getDocumentOperationHistory = async () => emptyList()
