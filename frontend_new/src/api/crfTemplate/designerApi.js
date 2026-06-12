import { emptySuccess } from '../_empty'
import request from '../request'
import { buildDesignerPayloadFromCsvFile } from '../../utils/crfTemplateCsvImport'
import { resolveTemplateAssets } from '../../utils/templateAssetResolver'
import {
  buildSchemaFromDesignerPayload,
  normalizeTemplate,
  pickActiveVersion,
  pickTemplateCategory,
  TEMPLATE_TYPE_CRF,
} from './normalizers'

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
  const version = await request.post(`/schema-templates/${templateId}/versions`, {
    version_name: payload.publish ? 'published' : 'draft',
    schema_json: schemaJson,
    status: 'draft',
  })
  const finalVersion = payload.publish
    ? await request.post(`/schema-template-versions/${version.id}/publish`)
    : version
  const refreshed = payload.publish
    ? await request.get(`/schema-templates/${templateId}`)
    : { ...detail, ...updatedTemplate, versions: [finalVersion, ...(detail.versions || [])] }
  return emptySuccess(normalizeTemplate(refreshed))
}

export const publishCrfTemplate = async (templateId = '') => {
  if (!templateId) return emptySuccess(null)
  const template = normalizeTemplate(await request.get(`/schema-templates/${templateId}`))
  const version = template.active_version || pickActiveVersion(template)
  if (!version?.id) return emptySuccess(null)
  await request.post(`/schema-template-versions/${version.id}/publish`)
  const refreshed = await request.get(`/schema-templates/${templateId}`)
  return emptySuccess(normalizeTemplate(refreshed))
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
