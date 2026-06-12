import { emptyList, emptySuccess } from '../_empty'
import request from '../request'
import {
  normalizeProjectPayload,
  withProjectAliases,
  wrapPaged,
} from './adapters'
import { PROJECTS_ENDPOINT } from './constants'

export const getProjects = async (params = {}) => {
  const payload = await request.get(PROJECTS_ENDPOINT, params)
  return wrapPaged(payload, withProjectAliases)
}

export const getProject = async (projectId = '') => {
  if (!projectId) return emptySuccess(null)
  const project = await request.get(`${PROJECTS_ENDPOINT}/${projectId}`)
  const aliased = withProjectAliases(project)
  // 以 template-bindings 的 active 绑定为准；删除基础模板后项目会继续使用项目内 CRF 副本。
  try {
    const bindings = await request.get(`${PROJECTS_ENDPOINT}/${projectId}/template-bindings`)
    const list = Array.isArray(bindings) ? bindings : []
    const primary = list.find((b) => b?.status === 'active' && b?.binding_type === 'primary_crf')
      || list.find((b) => b?.status === 'active')
    const templateId = primary?.template_id || null
    if (templateId) {
      let templateName = ''
      try {
        const template = await request.get(`/schema-templates/${templateId}`)
        templateName = template?.template_name || template?.name || ''
      } catch (error) {
        console.warn('[project] 解析模板名称失败:', error)
      }
      aliased.crf_template_id = templateId
      aliased.template_scope_config = {
        ...(aliased.template_scope_config || {}),
        template_id: templateId,
        template_name: templateName || aliased.template_scope_config?.template_name || '',
        schema_version_id: primary?.schema_version_id,
      }
      aliased.template_info = {
        ...(aliased.template_info || {}),
        template_id: templateId,
        template_name: templateName,
        schema_version_id: primary?.schema_version_id,
      }
    } else {
      aliased.crf_template_id = null
      aliased.template_scope_config = {}
      aliased.template_info = {}
    }
  } catch (error) {
    console.warn('[project] 获取项目模板绑定失败:', error)
  }
  return emptySuccess(aliased)
}

export const createProject = async (data = {}) => {
  const project = await request.post(PROJECTS_ENDPOINT, normalizeProjectPayload(data, { create: true }))
  return emptySuccess(withProjectAliases(project))
}

export const updateProject = async (projectId = '', data = {}) => {
  if (!projectId) return emptySuccess(null)
  const project = await request.patch(`${PROJECTS_ENDPOINT}/${projectId}`, normalizeProjectPayload(data))
  return emptySuccess(withProjectAliases(project))
}

export const deleteProject = async (projectId = '') => {
  if (!projectId) return emptySuccess(null)
  const project = await request.delete(`${PROJECTS_ENDPOINT}/${projectId}`)
  return emptySuccess(withProjectAliases(project))
}

export const toggleProjectStatus = async (projectId = '', status = 'active') => {
  if (!projectId) return emptySuccess(null)
  const project = await request.patch(`${PROJECTS_ENDPOINT}/${projectId}`, { status })
  return emptySuccess(withProjectAliases(project))
}

export const getProjectMembers = async () => emptyList()
export const addProjectMember = async () => emptySuccess(null)
export const removeProjectMember = async () => emptySuccess(null)
