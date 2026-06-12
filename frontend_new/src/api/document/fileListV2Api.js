import { emptySuccess } from '../_empty'
import request from '../request'
import { DOCUMENTS_ENDPOINT } from './constants'
import {
  getDocumentDetail,
  getDocumentList,
  uploadDocument,
} from './documentsApi'
import { normalizeDocument } from './normalizers'

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

export const getFileListV2Counts = async (params = {}) => {
  const payload = await request.get(`${DOCUMENTS_ENDPOINT}/v2/counts`, params)
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

export const uploadAndArchiveToPatient = async (file, patientId, _options = {}, onProgress) => {
  // 后端 POST /documents 带 patient_id 时已自动归档并入队，无需再调 archive 接口。
  return uploadDocument(file, patientId, onProgress)
}

export const uploadAndArchiveAsync = uploadAndArchiveToPatient
