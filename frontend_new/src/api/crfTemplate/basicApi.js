import { emptySuccess } from '../_empty'
import request from '../request'
import {
  normalizeTemplate,
  normalizeVersion,
  pickActiveVersion,
  pickTemplateVersion,
  TEMPLATE_TYPE_CRF,
  wrapTemplateList,
} from './normalizers'

export const getCRFTemplates = async (params = {}) => {
  const payload = await request.get('/schema-templates', {
    page: params.page || 1,
    page_size: params.page_size || params.pageSize || 100,
    template_type: params.template_type || TEMPLATE_TYPE_CRF,
    status: params.status,
  })
  return wrapTemplateList(payload)
}

export const getCRFTemplate = async (templateId = '') => {
  if (!templateId) return emptySuccess({ id: templateId, schema_json: {}, field_groups: [] })
  const template = await request.get(`/schema-templates/${templateId}`)
  return emptySuccess(normalizeTemplate(template))
}

export const updateCrfTemplateMeta = async (templateId, payload = {}) => {
  if (!templateId) return emptySuccess(payload)
  const template = await request.patch(`/schema-templates/${templateId}`, {
    template_name: payload.template_name || payload.name,
    description: payload.description || '',
    status: payload.status,
  })
  return emptySuccess(normalizeTemplate(template))
}

export const getCRFCategories = async () => emptySuccess([])
export const getCrfDocTypes = async () => emptySuccess([])

export const assignTemplateToProject = async (projectId = '', templateId = '', options = {}) => {
  if (!projectId || !templateId) return emptySuccess(null)
  const template = normalizeTemplate(await request.get(`/schema-templates/${templateId}`))
  const version = options.schema_version_id
    ? { id: options.schema_version_id }
    : template.active_version || pickActiveVersion(template)
  if (!version?.id) return emptySuccess(null)
  const binding = await request.post(`/projects/${projectId}/template-bindings`, {
    template_id: templateId,
    schema_version_id: version.id,
    binding_type: options.binding_type || 'primary_crf',
  })
  return emptySuccess(binding)
}

const fetchActiveProjectBindingForTemplate = async (projectId = '') => {
  if (!projectId) return null
  try {
    const bindings = await request.get(`/projects/${projectId}/template-bindings`)
    const list = Array.isArray(bindings) ? bindings : []
    const primary = list.find(
      (b) => b?.status === 'active' && b?.binding_type === 'primary_crf',
    )
    if (primary) return primary
    return list.find((b) => b?.status === 'active') || null
  } catch (error) {
    console.warn('[crfTemplate] 获取项目模板绑定失败:', error)
    return null
  }
}

export const getProjectTemplate = async (projectId = '') => {
  if (!projectId) return emptySuccess(null)
  const project = await request.get(`/projects/${projectId}`)
  const templateInfo = project?.template_info || project?.extra_json?.template_info || null
  const hasInlineSchema = Boolean(templateInfo?.schema_json || templateInfo?.schema)
  if (templateInfo && hasInlineSchema) return emptySuccess(templateInfo)

  const scopeConfig = project?.template_scope_config || project?.extra_json?.template_scope_config || {}
  let binding = null
  let templateId = (
    templateInfo?.template_id
    || project?.crf_template_id
    || project?.extra_json?.crf_template_id
    || scopeConfig?.template_id
    || null
  )
  if (!templateId) {
    binding = await fetchActiveProjectBindingForTemplate(projectId)
    if (binding?.template_id) templateId = binding.template_id
  }
  if (!templateId) return emptySuccess(null)
  const schemaVersionId = templateInfo?.schema_version_id || scopeConfig?.schema_version_id || binding?.schema_version_id || ''
  const template = await request.get(`/schema-templates/${templateId}`)
  const normalizedTemplate = normalizeTemplate(template)
  const boundVersion = pickTemplateVersion(normalizedTemplate, schemaVersionId)
  const normalizedVersion = boundVersion ? normalizeVersion(boundVersion) : null
  return emptySuccess({
    ...normalizedTemplate,
    ...(templateInfo || {}),
    template_id: normalizedTemplate.id || templateId,
    template_name: templateInfo?.template_name || normalizedTemplate.template_name || normalizedTemplate.name || '',
    schema_version_id: normalizedVersion?.id || schemaVersionId || normalizedTemplate.active_version_id || null,
    schema_json: normalizedVersion?.schema_json || normalizedTemplate.schema_json || {},
    schema: normalizedVersion?.schema || normalizedVersion?.schema_json || normalizedTemplate.schema || normalizedTemplate.schema_json || {},
    designer: normalizedVersion?.designer || normalizedTemplate.designer || null,
    field_groups: normalizedVersion?.field_groups || normalizedTemplate.field_groups || [],
  })
}
