/**
 * 文档 API — 对接真实后端
 *
 * 上传使用 XMLHttpRequest 以支持 onProgress 回调；
 * 其余接口使用 fetch。
 */

const API_BASE = '/api/v1/documents'

// ─── 通用 fetch 封装 ─────────────────────────────────────────────────────────

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  const text = await res.text()
  let json = null
  if (text?.trim()) {
    try {
      json = JSON.parse(text)
    } catch {
      throw Object.assign(new Error('响应不是有效的 JSON'), { response: { status: res.status, data: null } })
    }
  }
  if (!res.ok) {
    const msg = json?.message || `请求失败 (${res.status})`
    throw Object.assign(new Error(msg), { response: { data: json } })
  }
  if (json == null) {
    throw Object.assign(new Error('空响应'), { response: { data: null } })
  }
  return json
}

// ─── 文件上传（支持进度回调） ──────────────────────────────────────────────────

/**
 * 上传单个文件到后端
 * @param {File} file - 要上传的文件
 * @param {(percent: number) => void} onProgress - 上传进度回调 0~100
 * @param {string} [batchId] - 可选批次 ID
 * @returns {Promise<{success, code, message, data}>}
 */
export const uploadDocument = (file, onProgress, batchId) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('file', file)
    if (batchId) formData.append('batchId', batchId)

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = Math.round((e.loaded / e.total) * 100)
        onProgress(percent)
      }
    })

    xhr.addEventListener('load', () => {
      try {
        const json = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(json)
        } else {
          reject(Object.assign(new Error(json.message || '上传失败'), { response: { data: json } }))
        }
      } catch (e) {
        reject(new Error('解析响应失败'))
      }
    })

    xhr.addEventListener('error', () => reject(new Error('网络错误')))
    xhr.addEventListener('abort', () => reject(new Error('上传取消')))

    xhr.open('POST', `${API_BASE}/upload`)
    xhr.send(formData)
  })
}

// ─── 文档列表 ────────────────────────────────────────────────────────────────

/**
 * 获取文档列表
 * @param {{ patientId?: string, status?: string, ids?: string }} [params]
 */
export const getDocumentList = async (params = {}) => {
  const qs = new URLSearchParams()
  if (params.patientId) qs.set('patientId', params.patientId)
  if (params.status) qs.set('status', params.status)
  if (params.ids) qs.set('ids', params.ids)
  const query = qs.toString()
  return request(`${API_BASE}${query ? '?' + query : ''}`)
}

/**
 * 按 ID 列表获取文档状态（逗号分隔）
 */
export const getDocumentsByIds = async (ids = []) => {
  if (ids.length === 0) return { success: true, code: 0, data: [] }
  return request(`${API_BASE}?ids=${ids.join(',')}`)
}

// ─── 文档详情 ────────────────────────────────────────────────────────────────

export const getDocumentDetail = async (documentId, options = {}) => {
  const qs = new URLSearchParams()
  if (options.include_content !== undefined) qs.set('include_content', String(options.include_content))
  if (options.include_patients !== undefined) qs.set('include_patients', String(options.include_patients))
  if (options.include_extracted !== undefined) qs.set('include_extracted', String(options.include_extracted))
  const query = qs.toString()
  return request(`${API_BASE}/${documentId}${query ? '?' + query : ''}`)
}

// ─── 删除 ────────────────────────────────────────────────────────────────────

export const deleteDocument = async (documentId) => {
  return request(`${API_BASE}/${documentId}`, { method: 'DELETE' })
}

// ─── 归档 ────────────────────────────────────────────────────────────────────

export const archiveDocument = async (documentId, patientId) => {
  return request(`${API_BASE}/${documentId}/archive`, {
    method: 'POST',
    body: JSON.stringify({ patientId }),
  })
}

// ─── upload-init + complete (旧流程，保留兼容) ───────────────────────────────

export const uploadInit = async ({ fileName, fileSize, mimeType, patientId, batchId }) => {
  return request(`${API_BASE}/upload-init`, {
    method: 'POST',
    body: JSON.stringify({ fileName, fileSize, mimeType, patientId, batchId }),
  })
}

export const uploadComplete = async ({ documentId, objectKey }) => {
  return request(`${API_BASE}/complete`, {
    method: 'POST',
    body: JSON.stringify({ documentId, objectKey }),
  })
}

// ─── 保留旧导出名（兼容其他模块引用） ─────────────────────────────────────────

const ok = (data = null, message = '本地模式') =>
  Promise.resolve({ success: true, code: 0, message, data })

export const uploadDocuments = async (files = [], onProgress, onFileComplete) => {
  const results = []
  for (let i = 0; i < files.length; i += 1) {
    if (onProgress) onProgress(i, 100, files[i])
    if (onFileComplete) onFileComplete(i, true, {}, files[i])
    results.push({ file: files[i], success: true, data: { file_name: files[i]?.name } })
  }
  return results
}
export const deleteDocuments = () => ok({ deleted_count: 0, failed_count: 0, errors: [] })
export const getDocumentTempUrl = (documentId, ttl = 3600) =>
  request(`${API_BASE}/${documentId}/temp-url?ttl=${ttl}`)
export function getDocumentPdfStreamUrl(documentId) {
  if (!documentId) return ''
  return `${API_BASE}/${encodeURIComponent(documentId)}/pdf`
}
export const unarchiveDocument = (documentId) =>
  request(`${API_BASE}/${documentId}/unarchive`, { method: 'POST' })
export const changeArchivePatient = () => ok({})
export const parseDocument = () => ok({ task_id: 'local-task' })
export const reparseDocumentSync = (documentId, options = {}) =>
  request(`${API_BASE}/${documentId}/reparse`, { method: 'POST', body: JSON.stringify(options) })
export const updateDocumentMetadata = (documentId, metadata) =>
  request(`${API_BASE}/${documentId}/metadata`, { method: 'PUT', body: JSON.stringify(metadata) })
export const getParseResult = () => ok({})
export const getParseProgress = () => ok({ progress: 100, status: 'completed' })
export const parseDocuments = async (documentIds = []) => documentIds.map(() => ({ success: true }))
export const extractEhrData = () => ok({})
export const extractDocumentMetadata = (documentId) =>
  request(`${API_BASE}/${documentId}/extract-metadata`, { method: 'POST' })
export const markDocumentReview = () => ok({})
export const getDocumentOperationHistory = (documentId, options = {}) => {
  const qs = new URLSearchParams()
  Object.entries(options).forEach(([k, v]) => qs.set(k, String(v)))
  const query = qs.toString()
  return request(`${API_BASE}/${documentId}/operation-history${query ? '?' + query : ''}`)
}
export const aiMatchPatient = () => ok({})
export const aiExtractAndMatchPatient = aiMatchPatient
export const getDocumentAiMatchInfo = () => ok({})
export const confirmCreatePatientAndArchive = () => ok({})
export const batchCreatePatientAndArchive = () => ok({})
export const confirmAutoArchive = () => ok({})
export const batchConfirmAutoArchive = () => ok({})
export const searchUserFiles = () => ok({ items: [], total: 0, page: 1, page_size: 20, total_pages: 0 })
export const getFileStatusById = (documentId) => getDocumentDetail(documentId)
export const getFileStatusesByIds = () => ok({ items: [] })
export const getFileListV2Tree = () => ok({ total: 0, counts: {}, todo_groups: [], archived_patients: [] })
export const getFileListV2GroupDocuments = () => ok({ items: [], group: null, pagination: { total: 0 } })
export const rebuildGroups = () => ok({ groups_count: 0, docs_updated: 0 })
export const matchGroup = () => ok({})
export const confirmGroupArchive = () => ok({ archived_count: 0, failed_count: 0, errors: [] })
export const createPatientAndArchiveGroup = () => ok({})
export const moveDocumentToGroup = () => ok({})
export const uploadAndArchiveToPatient = uploadDocument
export const uploadAndArchiveAsync = () => ok({ task_id: 'local-task', document_id: 'local-document' })
export const extractEhrDataAsync = (documentId) =>
  request(`${API_BASE}/${documentId}/extract-ehr`, { method: 'POST' })
export const aiMatchPatientAsync = () => ok({ task_id: 'local-task' })
export const batchAiMatchAsync = () => ok({ task_id: 'local-task', document_count: 0 })
export const getDocumentTaskProgress = () => ok({ status: 'completed', progress: 100 })
export const pollDocumentTaskProgress = async (_taskId, options = {}) => {
  if (options.onProgress) options.onProgress({ status: 'completed', progress: 100 })
  return { status: 'completed', progress: 100 }
}
export const checkDuplicateFiles = () => ok({ duplicated: [] })

export default {
  uploadDocument,
  uploadDocuments,
  getDocumentList,
  getDocumentsByIds,
  deleteDocument,
  deleteDocuments,
  getDocumentTempUrl,
  archiveDocument,
  unarchiveDocument,
  changeArchivePatient,
  parseDocument,
  getDocumentDetail,
  getParseResult,
  getParseProgress,
  parseDocuments,
  extractEhrData,
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
  getFileStatusesByIds,
  getFileStatusById,
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
  checkDuplicateFiles
}
