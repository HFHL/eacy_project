import { emptyList, emptySuccess, emptyTask } from './_empty'

export function synthesizeCandidatesFromHistory() { return [] }

export const getPatientList = async () => emptySuccess({ list: [], items: [], total: 0, page: 1, page_size: 20 })
export const createPatient = async (data = {}) => emptySuccess({ id: '', ...data })
export const batchDeletePatients = async () => emptySuccess({ deleted: 0 })
export const batchDeleteCheck = async () => emptySuccess({ can_delete: [], blocked: [] })
export const exportPatients = async () => emptySuccess(null)
export const getDepartmentTree = async () => emptySuccess([])
export const getPatientDetail = async (patientId = '') => emptySuccess({ id: patientId })
export const updatePatient = async (patientId = '', data = {}) => emptySuccess({ id: patientId, ...data })
export const getPatientEhr = async () => emptySuccess({})
export const getPatientEhrSchemaData = async () => emptySuccess({})
export const updatePatientEhrSchemaData = async (_patientId, data = {}) => emptySuccess(data)
export const updatePatientEhrFolder = async () => emptySuccess(null)
export const updatePatientEhr = async (_patientId, data = {}) => emptySuccess(data)
export const getPatientDocuments = async () => emptyList()
export const mergeEhrData = async () => emptySuccess(null)
export const getConflictsByExtractionId = async () => emptyList()
export const resolveConflict = async () => emptySuccess(null)
export const startPatientExtraction = async () => emptyTask()
export const getExtractionTaskStatus = async () => emptyTask()
export const getEhrFieldHistory = async () => emptySuccess([])
export const getEhrFieldHistoryV2 = async () => emptySuccess([])
export const getEhrFieldHistoryV3 = async () => emptySuccess([])
export const getEhrFieldCandidatesV3 = async () => emptySuccess([])
export const selectEhrFieldCandidateV3 = async () => emptySuccess(null)
export const uploadAndExtractField = async () => emptyTask()
export const getFieldConflicts = async () => emptyList()
export const resolveFieldConflict = async () => emptySuccess(null)
export const generateAiSummary = async () => emptySuccess({ summary: '', sources: [] })
export const getAiSummary = async () => emptySuccess({ summary: '', sources: [] })

export default {
  getPatientList,
  createPatient,
  batchDeletePatients,
  batchDeleteCheck,
  exportPatients,
  getDepartmentTree,
  getPatientDetail,
  updatePatient,
  getPatientEhr,
  getPatientEhrSchemaData,
  updatePatientEhrSchemaData,
  updatePatientEhrFolder,
  updatePatientEhr,
  getPatientDocuments,
  mergeEhrData,
  getConflictsByExtractionId,
  resolveConflict,
  startPatientExtraction,
  getExtractionTaskStatus,
  getEhrFieldHistory,
  getEhrFieldHistoryV2,
  getEhrFieldHistoryV3,
  getEhrFieldCandidatesV3,
  selectEhrFieldCandidateV3,
  uploadAndExtractField,
  getFieldConflicts,
  resolveFieldConflict,
  generateAiSummary,
  getAiSummary,
}
