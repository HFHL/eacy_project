import { emptyList, emptySuccess } from './_empty'
import request from './request'
import { buildDesignerPayloadFromCsvFile } from '../utils/crfTemplateCsvImport'
import { resolveTemplateAssets } from '../utils/templateAssetResolver'

const TEMPLATE_TYPE_CRF = 'crf'

const pickActiveVersion = (template = {}) => {
  const versions = Array.isArray(template.versions) ? template.versions : []
  return versions.find((item) => item.status === 'published') || versions.find((item) => item.status === 'active') || versions[0] || null
}

const pickTemplateVersion = (template = {}, schemaVersionId = '') => {
  const versions = Array.isArray(template.versions) ? template.versions : []
  if (schemaVersionId) {
    const matched = versions.find((item) => String(item?.id) === String(schemaVersionId))
    if (matched) return matched
  }
  return pickActiveVersion(template)
}

const normalizeVersion = (version = {}) => {
  const schemaJson = version.schema_json || version.schema || {}
  const layoutConfig = schemaJson?.layout_config && typeof schemaJson.layout_config === 'object'
    ? schemaJson.layout_config
    : {}
  return {
    ...version,
    schema_json: schemaJson,
    schema: schemaJson,
    designer: version.designer || schemaJson?.designer || layoutConfig.designer || null,
    field_groups: version.field_groups || schemaJson?.fieldGroups || layoutConfig.fieldGroups || [],
  }
}

const normalizeTemplate = (template = {}) => {
  const versions = (Array.isArray(template.versions) ? template.versions : []).map(normalizeVersion)
  const activeVersion = pickActiveVersion({ versions })
  const schemaJson = template.schema_json || activeVersion?.schema_json || {}
  const layoutConfig = schemaJson?.layout_config && typeof schemaJson.layout_config === 'object'
    ? schemaJson.layout_config
    : {}
  const designer = template.designer || schemaJson?.designer || layoutConfig.designer || activeVersion?.designer || null
  const fieldGroups = template.field_groups || schemaJson?.fieldGroups || layoutConfig.fieldGroups || activeVersion?.field_groups || []
  return {
    ...template,
    versions,
    name: template.template_name || template.name || '',
    title: template.template_name || template.title || '',
    type: template.template_type || template.type || '',
    is_published: template.status === 'published' || template.status === 'active' || Boolean(activeVersion?.status === 'published'),
    schema_json: schemaJson,
    schema: schemaJson,
    designer,
    field_groups: fieldGroups,
    active_version: activeVersion,
    active_version_id: activeVersion?.id || null,
    version: activeVersion?.version_no || versions[0]?.version_no || 1,
  }
}

const wrapTemplateList = (payload = {}) => {
  const items = (Array.isArray(payload.items) ? payload.items : [])
    .filter((item) => item?.status !== 'archived')
    .map(normalizeTemplate)
  const page = payload.page || 1
  const pageSize = payload.page_size || items.length || 20
  const total = payload.total ?? items.length
  return emptySuccess(items, {
    total,
    page,
    page_size: pageSize,
    pagination: { page, page_size: pageSize, total },
  })
}

const buildSchemaFromDesignerPayload = (payload = {}) => {
  const designer = payload.designer || {}
  const exportedSchema = payload.schema_json || payload.schema || {}
  const fieldGroups = Array.isArray(designer.fieldGroups)
    ? designer.fieldGroups
    : (Array.isArray(payload.field_groups) ? payload.field_groups : [])
  return {
    ...exportedSchema,
    title: exportedSchema.title || payload.template_name || designer?.meta?.title || 'CRF模版',
    $schema: exportedSchema.$schema || designer?.meta?.$schema || 'https://json-schema.org/draft/2020-12/schema',
    layout_config: {
      ...(exportedSchema.layout_config || {}),
      designer,
      fieldGroups,
      category: payload.category || '',
    },
    designer,
    fieldGroups,
  }
}

const nextVersionNo = (template = {}) => {
  const versions = Array.isArray(template.versions) ? template.versions : []
  const maxVersion = versions.reduce((max, item) => Math.max(max, Number(item.version_no || 0)), 0)
  return maxVersion + 1
}

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

  // 后端 /projects/{id} 响应（ResearchProjectResponse）只暴露 extra_json，
  // 模板的权威来源是 project_template_bindings。这里先看 extra_json,
  // 兜底查 /projects/{id}/template-bindings,以便从绑定关系解析模板 ID。
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

export const createCrfTemplateDesigner = async (payload = {}) => {
  const template = await request.post('/schema-templates', {
    template_code: payload.template_code || undefined,
    template_name: payload.template_name || payload.name || '未命名模板',
    template_type: TEMPLATE_TYPE_CRF,
    description: payload.description || '',
    status: 'active',
  })
  const schemaJson = buildSchemaFromDesignerPayload(payload)
  const version = await request.post(`/schema-templates/${template.id}/versions`, {
    version_no: 1,
    version_name: payload.publish ? 'v1 published' : 'v1 draft',
    schema_json: schemaJson,
    status: 'draft',
  })
  const finalVersion = payload.publish
    ? await request.post(`/schema-template-versions/${version.id}/publish`)
    : version
  return emptySuccess(normalizeTemplate({ ...template, versions: [finalVersion] }))
}

export const saveCrfTemplateDesigner = async (templateId, payload = {}) => {
  if (!templateId) return createCrfTemplateDesigner(payload)
  const updatedTemplate = await request.patch(`/schema-templates/${templateId}`, {
    template_name: payload.template_name || payload.name,
    description: payload.description || '',
    status: 'active',
  })
  const detail = await request.get(`/schema-templates/${templateId}`)
  const schemaJson = buildSchemaFromDesignerPayload(payload)
  const versionNo = nextVersionNo(detail)
  const version = await request.post(`/schema-templates/${templateId}/versions`, {
    version_no: versionNo,
    version_name: payload.publish ? `v${versionNo} published` : `v${versionNo} draft`,
    schema_json: schemaJson,
    status: 'draft',
  })
  const finalVersion = payload.publish
    ? await request.post(`/schema-template-versions/${version.id}/publish`)
    : version
  return emptySuccess(normalizeTemplate({ ...detail, ...updatedTemplate, versions: [finalVersion, ...(detail.versions || [])] }))
}

export const publishCrfTemplate = async (templateId = '') => {
  if (!templateId) return emptySuccess(null)
  const template = normalizeTemplate(await request.get(`/schema-templates/${templateId}`))
  const version = template.active_version || pickActiveVersion(template)
  if (!version?.id) return emptySuccess(null)
  const published = await request.post(`/schema-template-versions/${version.id}/publish`)
  return emptySuccess(normalizeVersion(published))
}

export const getCrfTemplateProjectUsage = async (templateId = '') => {
  if (!templateId) {
    return emptySuccess({ items: [], total: 0 })
  }
  const payload = await request.get(`/schema-templates/${templateId}/project-usage`)
  const items = Array.isArray(payload?.items) ? payload.items : []
  return emptySuccess({
    items,
    total: payload?.total ?? items.length,
  })
}

export const deleteCrfTemplate = async (templateId = '') => {
  if (!templateId) return emptySuccess(null)
  const template = await request.delete(`/schema-templates/${templateId}`)
  return emptySuccess(normalizeTemplate(template))
}

const pickTemplateCategory = (source = {}, schema = {}, designer = {}) => {
  const layoutConfig = schema?.layout_config && typeof schema.layout_config === 'object'
    ? schema.layout_config
    : {}
  return (
    source.category
    || layoutConfig.category
    || designer?.meta?.category
    || ''
  )
}

export const cloneCrfTemplate = async (templateId, payload = {}) => {
  const raw = await request.get(`/schema-templates/${templateId}`)
  const source = normalizeTemplate(raw)
  const { designer, schema } = resolveTemplateAssets(source)
  const fieldGroups = (
    Array.isArray(source.field_groups) && source.field_groups.length
      ? source.field_groups
      : (Array.isArray(designer?.fieldGroups) ? designer.fieldGroups : (schema?.fieldGroups || []))
  )
  const mergedDesigner = {
    ...(designer && typeof designer === 'object' ? designer : {}),
    ...(source.designer && typeof source.designer === 'object' ? source.designer : {}),
  }
  if (fieldGroups.length) {
    mergedDesigner.fieldGroups = fieldGroups
  }
  const schemaJson = schema && Object.keys(schema).length ? schema : (source.schema_json || {})
  const baseName = source.template_name || source.name || '模板'
  return createCrfTemplateDesigner({
    template_name: payload.template_name || `${baseName} 副本`,
    description: payload.description ?? source.description ?? '',
    category: payload.category ?? pickTemplateCategory(source, schemaJson, mergedDesigner),
    designer: mergedDesigner,
    schema_json: schemaJson,
    field_groups: fieldGroups,
    publish: Boolean(payload.publish),
  })
}

export const listCrfTemplateVersions = async (templateId = '') => {
  if (!templateId) return emptyList()
  const template = normalizeTemplate(await request.get(`/schema-templates/${templateId}`))
  return emptySuccess(template.versions || [])
}

export const getCrfTemplateVersion = async (templateId = '', versionId = '') => {
  if (!templateId || !versionId) return emptySuccess(null)
  const versions = (await listCrfTemplateVersions(templateId)).data || []
  return emptySuccess(versions.find((item) => String(item.id) === String(versionId)) || null)
}

export const activateCrfTemplateVersion = async (_templateId = '', versionId = '') => {
  if (!versionId) return emptySuccess(null)
  const version = await request.post(`/schema-template-versions/${versionId}/publish`)
  return emptySuccess(normalizeVersion(version))
}

export const convertTemplate = async () => emptySuccess(null)

/**
 * 从 CSV 导入并创建 CRF 模板（解析规则与 CRF 设计器「导入 CSV」一致）。
 * @param {Object} payload
 * @param {File} payload.file CSV 文件
 * @param {string} payload.template_name 模板名称
 * @param {string} [payload.category]
 * @param {string} [payload.description]
 * @param {boolean} [payload.publish]
 */
export const importCrfTemplateFromCsv = async (payload = {}) => {
  try {
    const importPayload = await buildDesignerPayloadFromCsvFile(payload.file, payload)
    const result = await createCrfTemplateDesigner(importPayload)
    if (!result?.success) {
      return result
    }
    const stats = importPayload.import_stats || {}
    return {
      ...result,
      message: `导入成功：${stats.folders || 0} 个访视、${stats.groups || 0} 个表单、${stats.fields || 0} 个字段`,
    }
  } catch (error) {
    return {
      success: false,
      code: -1,
      message: error?.message || 'CSV 导入失败',
      data: null,
    }
  }
}

export default {
  getCRFTemplates,
  getCRFTemplate,
  updateCrfTemplateMeta,
  getCRFCategories,
  getCrfDocTypes,
  assignTemplateToProject,
  getProjectTemplate,
  convertTemplate,
  importCrfTemplateFromCsv,
  publishCrfTemplate,
  saveCrfTemplateDesigner,
  createCrfTemplateDesigner,
  cloneCrfTemplate,
  getCrfTemplateProjectUsage,
  deleteCrfTemplate,
  listCrfTemplateVersions,
  getCrfTemplateVersion,
  activateCrfTemplateVersion,
}
