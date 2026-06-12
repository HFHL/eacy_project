import { emptySuccess } from '../_empty'

export const TEMPLATE_TYPE_CRF = 'crf'

export const pickActiveVersion = (template = {}) => {
  const versions = Array.isArray(template.versions) ? template.versions : []
  return versions.find((item) => item.status === 'published') || versions.find((item) => item.status === 'active') || versions[0] || null
}

export const pickTemplateVersion = (template = {}, schemaVersionId = '') => {
  const versions = Array.isArray(template.versions) ? template.versions : []
  if (schemaVersionId) {
    const matched = versions.find((item) => String(item?.id) === String(schemaVersionId))
    if (matched) return matched
  }
  return pickActiveVersion(template)
}

export const normalizeVersion = (version = {}) => {
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

export const normalizeTemplate = (template = {}) => {
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

export const wrapTemplateList = (payload = {}) => {
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

export const buildSchemaFromDesignerPayload = (payload = {}) => {
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

export const pickTemplateCategory = (source = {}, schema = {}, designer = {}) => {
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
