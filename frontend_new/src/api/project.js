import { emptyList, emptySuccess, emptyTask } from './_empty'

export const getProjects = async () => emptySuccess({ list: [], items: [], total: 0 })
export const getProject = async (projectId = '') => emptySuccess({ id: projectId })
export const createProject = async (data = {}) => emptySuccess({ id: '', ...data })
export const updateProject = async (projectId = '', data = {}) => emptySuccess({ id: projectId, ...data })
export const deleteProject = async () => emptySuccess(null)
export const toggleProjectStatus = async () => emptySuccess(null)
export const getProjectMembers = async () => emptyList()
export const addProjectMember = async () => emptySuccess(null)
export const removeProjectMember = async () => emptySuccess(null)
export const getProjectPatients = async () => emptySuccess({ list: [], items: [], total: 0 })
export const getProjectPatientDetail = async (_projectId = '', patientId = '') => emptySuccess({ id: patientId })
export const updateProjectPatientCrfFields = async (_projectId, _patientId, data = {}) => emptySuccess(data)
export const getProjectPatientCrfConflicts = async () => emptyList()
export const resolveProjectPatientCrfConflict = async () => emptySuccess(null)
export const resolveAllProjectPatientCrfConflicts = async () => emptySuccess(null)
export const getProjectCrfFieldHistory = async () => emptySuccess([])
export const getProjectCrfFieldCandidates = async () => emptySuccess([])
export const selectProjectCrfFieldCandidate = async () => emptySuccess(null)
export const enrollPatient = async () => emptySuccess(null)
export const removeProjectPatient = async () => emptySuccess(null)
export const startCrfExtraction = async () => emptyTask()
export const getCrfExtractionProgress = async () => emptyTask()
export const getProjectTemplateDesigner = async () => emptySuccess(null)
export const saveProjectTemplateDesigner = async (_projectId, data = {}) => emptySuccess(data)
export const getProjectExtractionTasks = async () => emptyList()
export const getActiveExtractionTask = async () => emptySuccess(null)
export const cancelCrfExtraction = async () => emptySuccess(null)
export const resetCrfExtraction = async () => emptySuccess(null)
export const applyTemplateVersion = async () => emptySuccess(null)
export const exportProjectCrfFile = async () => emptySuccess(null)

export default {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  toggleProjectStatus,
  getProjectMembers,
  addProjectMember,
  removeProjectMember,
  getProjectPatients,
  getProjectPatientDetail,
  updateProjectPatientCrfFields,
  getProjectPatientCrfConflicts,
  resolveProjectPatientCrfConflict,
  resolveAllProjectPatientCrfConflicts,
  getProjectCrfFieldHistory,
  getProjectCrfFieldCandidates,
  selectProjectCrfFieldCandidate,
  enrollPatient,
  removeProjectPatient,
  startCrfExtraction,
  getCrfExtractionProgress,
  getProjectTemplateDesigner,
  saveProjectTemplateDesigner,
  getProjectExtractionTasks,
  getActiveExtractionTask,
  cancelCrfExtraction,
  resetCrfExtraction,
  applyTemplateVersion,
  exportProjectCrfFile,
}
