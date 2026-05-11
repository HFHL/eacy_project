import request from './request'

const wrap = (data) => ({
  success: true,
  code: 0,
  message: data?.message || 'ok',
  data,
})

export const getAdminUsers = async () => wrap(await request.get('/admin/users'))
export const getAdminProjects = async () => wrap(await request.get('/admin/projects'))
export const getAdminTemplates = async () => wrap(await request.get('/admin/templates'))
export const getAdminDocuments = async (params = {}) => wrap(await request.get('/admin/documents', params))
export const getAdminStats = async () => wrap(await request.get('/admin/stats'))
export const getAdminActiveTasks = async (params = {}) => wrap(await request.get('/admin/extraction-tasks', { ...params, status: 'running' }))
export const getProjectExtractionTasks = async (params = {}) => wrap(await request.get('/admin/extraction-tasks', { ...params, task_type: 'project_crf' }))
export const getAdminExtractionTasks = async (params = {}) => wrap(await request.get('/admin/extraction-tasks', params))
export const getAdminExtractionTaskDetail = async (taskId) => wrap(await request.get(`/admin/extraction-tasks/${encodeURIComponent(taskId)}`))
export const getAdminExtractionTaskEvents = async (taskId, params = {}) => wrap(await request.get(`/admin/extraction-tasks/${encodeURIComponent(taskId)}/events`, params))
export const resubmitAdminExtractionTask = async (taskId, payload = {}) => wrap(await request.post(`/admin/extraction-tasks/${encodeURIComponent(taskId)}/resubmit`, payload))
