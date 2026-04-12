const ok = (data = null, message = '本地模式') =>
  Promise.resolve({ success: true, code: 0, message, data })

export const getProjects = () => ok({ items: [], total: 0 })
export const getProject = (projectId) => ok({ id: projectId })
export const createProject = (data) => ok(data || {})
export const updateProject = (projectId, data) => ok({ id: projectId, ...(data || {}) })
export const deleteProject = () => ok({})
export const toggleProjectStatus = () => ok({})
export const getProjectMembers = () => ok([])
export const addProjectMember = () => ok({})
export const removeProjectMember = () => ok({})
export const getProjectPatients = () => ok({ items: [], total: 0 })
export const getProjectPatientDetail = (projectId, patientId) => ok({ project_id: projectId, patient_id: patientId })
export const updateProjectPatientCrfFields = () => ok({})
export const getProjectPatientCrfConflicts = () => ok([])
export const resolveProjectPatientCrfConflict = () => ok({})
export const resolveAllProjectPatientCrfConflicts = () => ok({})
export const getProjectCrfFieldHistory = () => ok([])
export const enrollPatient = () => ok({})
export const removeProjectPatient = () => ok({})
export const startCrfExtraction = () => ok({ task_id: 'local-task' })
export const getCrfExtractionProgress = () => ok({ status: 'completed', progress: 100 })
export const getProjectTemplateDesigner = () => ok({ designer: {} })
export const saveProjectTemplateDesigner = () => ok({})
export const getProjectExtractionTasks = () => ok([])
export const getActiveExtractionTask = () => ok(null)
export const cancelCrfExtraction = () => ok({})
export const resetCrfExtraction = () => ok({})
export const applyTemplateVersion = () => ok({})
export const exportProjectCrfFile = () => ok(new Blob(['local export'], { type: 'text/plain' }))

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
  exportProjectCrfFile,
  applyTemplateVersion
}
