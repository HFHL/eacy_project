const API_BASE = '/api/v1/projects'

async function parseJsonResponse(response) {
  const text = await response.text()
  if (!text?.trim()) {
    return {
      success: false,
      code: response.status || 500,
      message: response.status >= 500 ? '服务器错误（空响应）' : `请求失败 (${response.status})`,
      data: null,
    }
  }
  try {
    return JSON.parse(text)
  } catch {
    return {
      success: false,
      code: response.status || 500,
      message: '响应不是有效的 JSON',
      data: null,
    }
  }
}

/**
 * @param {{ page?: number, page_size?: number, status?: string, search?: string }} [params]
 */
export const getProjects = async (params = {}) => {
  try {
    const qs = new URLSearchParams()
    if (params.page != null) qs.set('page', String(params.page))
    if (params.page_size != null) qs.set('page_size', String(params.page_size))
    if (params.status) qs.set('status', params.status)
    if (params.search) qs.set('search', params.search)
    const query = qs.toString()
    const response = await fetch(`${API_BASE}${query ? `?${query}` : ''}`)
    return await parseJsonResponse(response)
  } catch (error) {
    console.error('getProjects:', error)
    return { success: false, code: 500, message: error.message, data: [] }
  }
}

/**
 * 新建科研项目 → POST /api/v1/projects
 */
export const createProject = async (data) => {
  try {
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {}),
    })
    return await parseJsonResponse(response)
  } catch (error) {
    console.error('createProject:', error)
    return { success: false, code: 500, message: error.message, data: null }
  }
}

export const getProject = async (projectId) => {
  if (!projectId) return { success: false, code: 400, message: '缺少项目 id', data: null }
  try {
    const response = await fetch(`${API_BASE}/${encodeURIComponent(projectId)}`)
    return await parseJsonResponse(response)
  } catch (e) {
    console.error('getProject:', e)
    return { success: false, code: 500, message: e.message, data: null }
  }
}

/**
 * @param {string} projectId
 * @param {{ page?: number, page_size?: number }} [params]
 */
export const getProjectPatients = async (projectId, params = {}) => {
  if (!projectId) return { success: false, code: 400, message: '缺少项目 id', data: [], pagination: {} }
  try {
    const qs = new URLSearchParams()
    if (params.page != null) qs.set('page', String(params.page))
    if (params.page_size != null) qs.set('page_size', String(params.page_size))
    const q = qs.toString()
    const response = await fetch(`${API_BASE}/${encodeURIComponent(projectId)}/patients${q ? `?${q}` : ''}`)
    const json = await parseJsonResponse(response)
    if (!response.ok) {
      return {
        success: false,
        code: json.code || response.status,
        message: json.message || '加载失败',
        data: [],
        pagination: json.pagination || {},
      }
    }
    if (!Array.isArray(json.data)) {
      json.data = []
    }
    return json
  } catch (e) {
    console.error('getProjectPatients:', e)
    return { success: false, code: 500, message: e.message, data: [], pagination: {} }
  }
}

/**
 * 入组：POST /api/v1/projects/:id/patients
 * @param {string} projectId
 * @param {{ patient_id?: string, patient_ids?: string[] }} body
 */
export const enrollPatient = async (projectId, body = {}) => {
  if (!projectId) return { success: false, code: 400, message: '缺少项目 id', data: null }
  try {
    const payload = {}
    if (Array.isArray(body.patient_ids) && body.patient_ids.length) {
      payload.patient_ids = body.patient_ids
    } else if (body.patient_id) {
      payload.patient_ids = [String(body.patient_id)]
    } else {
      return { success: false, code: 400, message: '缺少 patient_id 或 patient_ids', data: null }
    }
    const response = await fetch(`${API_BASE}/${encodeURIComponent(projectId)}/patients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return await parseJsonResponse(response)
  } catch (e) {
    console.error('enrollPatient:', e)
    return { success: false, code: 500, message: e.message, data: null }
  }
}

export const removeProjectPatient = async (projectId, patientId) => {
  if (!projectId || !patientId) return { success: false, code: 400, message: '缺少参数', data: null }
  try {
    const response = await fetch(
      `${API_BASE}/${encodeURIComponent(projectId)}/patients/${encodeURIComponent(patientId)}`,
      { method: 'DELETE' }
    )
    return await parseJsonResponse(response)
  } catch (e) {
    console.error('removeProjectPatient:', e)
    return { success: false, code: 500, message: e.message, data: null }
  }
}

const ok = (data = null, message = '本地模式') =>
  Promise.resolve({ success: true, code: 0, message, data })

export const updateProject = (projectId, data) => ok({ id: projectId, ...(data || {}) })
export const deleteProject = () => ok({})
export const toggleProjectStatus = () => ok({})
export const getProjectMembers = () => ok([])
export const addProjectMember = () => ok({})
export const removeProjectMember = () => ok({})
export const getProjectPatientDetail = (projectId, patientId) => ok({ project_id: projectId, patient_id: patientId })
export const updateProjectPatientCrfFields = () => ok({})
export const getProjectPatientCrfConflicts = () => ok([])
export const resolveProjectPatientCrfConflict = () => ok({})
export const resolveAllProjectPatientCrfConflicts = () => ok({})
export const getProjectCrfFieldHistory = () => ok([])
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
