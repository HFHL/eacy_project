import { emptyFileUrl, emptyList, emptySuccess, emptyTask } from './_empty'

export const uploadDocument = async () => emptySuccess({ id: '', status: 'empty' })
export const uploadDocuments = async () => []
export const getDocumentList = async () => emptyList()
export const deleteDocument = async () => emptySuccess(null)
export const deleteDocuments = async () => emptySuccess({ deleted: 0 })
export const getDocumentTempUrl = async () => emptyFileUrl()
export function getDocumentPdfStreamUrl() { return '' }
export const archiveDocument = async () => emptySuccess(null)
export const unarchiveDocument = async () => emptySuccess(null)
export const changeArchivePatient = async () => emptySuccess(null)
export const parseDocument = async () => emptyTask()
export const reparseDocumentSync = async () => emptyTask()
export const getDocumentDetail = async (documentId = '') => emptySuccess({ id: documentId })
export const updateDocumentMetadata = async (_documentId, metadata = {}) => emptySuccess(metadata)
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
export const searchUserFiles = async () => emptySuccess({ list: [], items: [], total: 0, page: 1, page_size: 20 })
export const getFileStatusById = async () => emptySuccess(null)
export const getFileStatusesByIds = async () => emptySuccess({})
export const getFileListV2Tree = async () => emptySuccess({ groups: [], documents: [], total: 0 })
export const getFileListV2GroupDocuments = async () => emptyList()
export const rebuildGroups = async () => emptySuccess(null)
export const matchGroup = async () => emptySuccess(null)
export const confirmGroupArchive = async () => emptySuccess(null)
export const createPatientAndArchiveGroup = async () => emptySuccess(null)
export const moveDocumentToGroup = async () => emptySuccess(null)
export const uploadAndArchiveToPatient = async () => emptyTask()
export const uploadAndArchiveAsync = async () => emptyTask()
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
