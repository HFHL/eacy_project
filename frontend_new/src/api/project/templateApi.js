import { emptySuccess } from '../_empty'
import request, { ensureFreshAccessToken } from '../request'
import { PROJECTS_ENDPOINT } from './constants'
import { isPlainObject } from './crfValue'

const fetchActiveProjectBinding = async (projectId = '') => {
  if (!projectId) return null
  try {
    const bindings = await request.get(`${PROJECTS_ENDPOINT}/${projectId}/template-bindings`)
    const list = Array.isArray(bindings) ? bindings : []
    // 优先取激活的 primary_crf。
    const primary = list.find(
      (b) => b?.status === 'active' && b?.binding_type === 'primary_crf',
    )
    if (primary) return primary
    return list.find((b) => b?.status === 'active') || null
  } catch (error) {
    console.warn('[project] 获取模板绑定失败:', error)
    return null
  }
}

const ensureProjectScopedBinding = async (projectId = '', binding = null) => {
  if (!projectId || !binding?.template_id || !binding?.schema_version_id) return binding
  try {
    return await request.post(`${PROJECTS_ENDPOINT}/${projectId}/template-bindings`, {
      template_id: binding.template_id,
      schema_version_id: binding.schema_version_id,
      binding_type: binding.binding_type || 'primary_crf',
    })
  } catch (error) {
    console.warn('[project] 确保项目 CRF 副本失败:', error)
    return binding
  }
}

const pickSchemaVersionFromTemplate = (template = {}, schemaVersionId = '') => {
  const versions = Array.isArray(template?.versions) ? template.versions : []
  if (schemaVersionId) {
    const matched = versions.find((v) => String(v?.id) === String(schemaVersionId))
    if (matched) return matched
  }
  return (
    versions.find((v) => v?.status === 'published')
    || versions.find((v) => v?.status === 'active')
    || versions[0]
    || null
  )
}

export const getProjectTemplateDesigner = async (projectId = '') => {
  if (!projectId) return emptySuccess(null)
  const binding = await fetchActiveProjectBinding(projectId)
  let templateRef = binding
  if (!templateRef?.template_id) {
    try {
      const project = await request.get(`${PROJECTS_ENDPOINT}/${projectId}`)
      const extra = isPlainObject(project?.extra_json) ? project.extra_json : {}
      const scopeConfig = isPlainObject(project?.template_scope_config)
        ? project.template_scope_config
        : (isPlainObject(extra.template_scope_config) ? extra.template_scope_config : {})
      const templateInfo = isPlainObject(project?.template_info)
        ? project.template_info
        : (isPlainObject(extra.template_info) ? extra.template_info : {})
      const templateId = (
        templateInfo.template_id
        || scopeConfig.template_id
        || project?.crf_template_id
        || extra.crf_template_id
      )
      templateRef = templateId
        ? {
          template_id: templateId,
          schema_version_id: templateInfo.schema_version_id || scopeConfig.schema_version_id || null,
          binding_type: 'primary_crf',
          id: null,
        }
        : null
    } catch (error) {
      console.warn('[project] 解析项目模板兜底信息失败:', error)
    }
  }
  if (!templateRef?.template_id) {
    return emptySuccess(null, { message: '项目尚未关联 CRF 模板' })
  }
  try {
    const template = await request.get(`/schema-templates/${templateRef.template_id}`)
    const versions = Array.isArray(template?.versions) ? template.versions : []
    const version = pickSchemaVersionFromTemplate(template, templateRef.schema_version_id)
    const schemaJson = version?.schema_json || version?.schema || template?.schema_json || {}
    const layoutConfig = (schemaJson && typeof schemaJson === 'object' && schemaJson.layout_config) || {}
    const designer = schemaJson?.designer || layoutConfig.designer || null
    const fieldGroups = schemaJson?.fieldGroups || layoutConfig.fieldGroups || version?.field_groups || []
    return emptySuccess({
      template_id: template?.id || templateRef.template_id,
      template_name: template?.template_name || template?.name || '项目模板',
      schema_version: version?.version_no ? `v${version.version_no}` : (version?.version_name || ''),
      schema_version_id: version?.id || templateRef.schema_version_id,
      binding_id: templateRef.id || null,
      schema_json: schemaJson,
      schema: schemaJson,
      designer,
      field_groups: fieldGroups,
      versions,
    })
  } catch (error) {
    console.error('[project] 加载项目模板失败:', error)
    return { success: false, message: error?.message || '加载项目模板失败', data: null }
  }
}

export const saveProjectTemplateDesigner = async (projectId = '', payload = {}) => {
  if (!projectId) return emptySuccess(null)
  const designer = payload.designer || {}
  const fieldGroups = Array.isArray(designer.fieldGroups)
    ? designer.fieldGroups
    : (Array.isArray(payload.field_groups) ? payload.field_groups : [])

  let binding = await fetchActiveProjectBinding(projectId)
  if (!binding?.template_id) {
    return { success: false, message: '项目尚未关联 CRF 模板，无法保存', data: null }
  }
  binding = await ensureProjectScopedBinding(projectId, binding)
  if (!binding?.template_id) {
    return { success: false, message: '项目 CRF 副本初始化失败，无法保存', data: null }
  }

  const detail = await request.get(`/schema-templates/${binding.template_id}`)
  const exportedSchema = payload.schema_json || payload.schema || {}
  const schemaJson = {
    ...exportedSchema,
    title: exportedSchema.title
      || payload.template_name
      || detail?.template_name
      || designer?.meta?.title
      || 'CRF模版',
    $schema: exportedSchema.$schema
      || designer?.meta?.$schema
      || 'https://json-schema.org/draft/2020-12/schema',
    layout_config: {
      ...(exportedSchema.layout_config || {}),
      designer,
      fieldGroups,
      category: payload.category || '',
    },
    designer,
    fieldGroups,
  }
  const newVersion = await request.post(`/schema-templates/${binding.template_id}/versions`, {
    version_name: 'project-save',
    schema_json: schemaJson,
    status: 'draft',
  })
  const publishedVersion = await request.post(
    `/schema-template-versions/${newVersion.id}/publish`,
  )

  try {
    if (binding?.id) {
      await request.delete(`${PROJECTS_ENDPOINT}/${projectId}/template-bindings/${binding.id}`)
    }
  } catch (error) {
    console.warn('[project] 停用旧模板绑定失败:', error)
  }

  let nextBinding = null
  try {
    nextBinding = await request.post(`${PROJECTS_ENDPOINT}/${projectId}/template-bindings`, {
      template_id: binding.template_id,
      schema_version_id: publishedVersion?.id || newVersion?.id,
      binding_type: binding.binding_type || 'primary_crf',
    })
  } catch (error) {
    console.error('[project] 创建新模板绑定失败:', error)
    return { success: false, message: error?.message || '保存成功但绑定切换失败', data: null }
  }

  return emptySuccess({
    template_id: binding.template_id,
    schema_version_id: publishedVersion?.id || newVersion?.id,
    binding_id: nextBinding?.id || null,
    migrated: 0,
    skipped: 0,
  })
}

export const applyTemplateVersion = async (projectId = '', schemaVersionId = '', options = {}) => {
  if (!projectId || !schemaVersionId) return emptySuccess(null)
  const binding = await fetchActiveProjectBinding(projectId)
  if (!binding?.template_id) {
    return { success: false, message: '项目尚未关联 CRF 模板，无法切换版本', data: null }
  }
  const nextBinding = await request.post(`${PROJECTS_ENDPOINT}/${projectId}/template-bindings`, {
    template_id: binding.template_id,
    schema_version_id: schemaVersionId,
    binding_type: options.binding_type || binding.binding_type || 'primary_crf',
  })
  return emptySuccess(nextBinding)
}

export const exportProjectCrfFile = async (projectId = '', payload = {}) => {
  if (!projectId) return new Blob([])
  const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/+$/, '')
  const token = await ensureFreshAccessToken()
  const response = await fetch(`${apiBase}${PROJECTS_ENDPOINT}/${projectId}/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'same-origin',
    body: JSON.stringify(payload || {}),
  })
  const blob = await response.blob()
  if (!response.ok) return blob
  return blob
}
