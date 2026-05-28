import request from './request'

const wrap = (data) => ({
  success: true,
  code: 0,
  message: data?.message || 'ok',
  data,
})

export const getAdminUsers = async () => wrap(await request.get('/admin/users'))
export const updateAdminUserStatus = async (userId, isActive) =>
  wrap(await request.patch(`/admin/users/${encodeURIComponent(userId)}/status`, { is_active: isActive }))
export const updateAdminUserRole = async (userId, role) =>
  wrap(await request.patch(`/admin/users/${encodeURIComponent(userId)}/role`, { role }))
export const getAdminProjects = async () => wrap(await request.get('/admin/projects'))
export const getAdminTemplates = async () => wrap(await request.get('/admin/templates'))
export const updateAdminTemplateVisibility = async (templateId, isSystem) =>
  wrap(await request.patch(`/admin/templates/${encodeURIComponent(templateId)}/visibility`, { is_system: isSystem }))
export const getAdminDocuments = async (params = {}) => wrap(await request.get('/admin/documents', params))
export const getAdminStats = async () => wrap(await request.get('/admin/stats'))
export const getAdminExtractionTasks = async (params = {}) => wrap(await request.get('/admin/extraction-tasks', params))
export const getAdminExtractionTaskDetail = async (taskId) => wrap(await request.get(`/admin/extraction-tasks/${encodeURIComponent(taskId)}`))
export const getAdminExtractionTaskTrace = async (taskId, params = {}) =>
  wrap(await request.get(`/admin/extraction-tasks/${encodeURIComponent(taskId)}/trace`, params))
export const getAdminExtractionTaskEvents = async (taskId, params = {}) => wrap(await request.get(`/admin/extraction-tasks/${encodeURIComponent(taskId)}/events`, params))
export const getAdminLlmCallDetail = async (callId) => wrap(await request.get(`/admin/llm-calls/${encodeURIComponent(callId)}`))
