import { DISPLAY_TYPES } from '../constants.js'
import {
  generateDefs,
  generateField,
  generateTableField,
} from './fieldSchema.js'

export const generateProperties = (folders) => {
  const properties = {}
  for (const folder of folders) {
    const groupOrder = folder.groups.map((group) => group.name)
    const groupProps = {}
    for (const group of folder.groups) {
      groupProps[group.name] = generateGroup(group)
    }
    properties[folder.name] = {
      type: 'object',
      properties: groupProps,
      unevaluatedProperties: false,
      'x-property-order': groupOrder,
    }
  }
  return properties
}

export const generateGroup = (group) => {
  const isRepeatable = group.repeatable
  const schema = {
    type: isRepeatable ? 'array' : 'object',
    ...(isRepeatable ? {
      items: {
        type: 'object',
        properties: {},
        unevaluatedProperties: false,
        required: [],
      },
    } : {
      properties: {},
      unevaluatedProperties: false,
      required: [],
    }),
  }
  const target = isRepeatable ? schema.items : schema
  const requiredFields = []
  const fieldOrder = []

  for (const field of group.fields) {
    fieldOrder.push(field.name)
    target.properties[field.name] = field.isTable && field.children
      ? generateTableField(field)
      : generateField(field)
    if (!field.isTable && field.required) {
      requiredFields.push(field.name)
    }
  }

  if (requiredFields.length > 0) target.required = requiredFields
  if (fieldOrder.length > 0) target['x-property-order'] = fieldOrder
  if (group.mergeBinding) target['x-merge-binding'] = group.mergeBinding

  const hasPrimarySources = Array.isArray(group.sources?.primary) && group.sources.primary.length > 0
  const hasSecondarySources = Array.isArray(group.sources?.secondary) && group.sources.secondary.length > 0
  if (hasPrimarySources || hasSecondarySources) target['x-sources'] = group.sources
  if (group.isExtractionUnit !== undefined) target['x-is-extraction-unit'] = !!group.isExtractionUnit
  if (group.formTemplate) target['x-form-template'] = group.formTemplate
  if (group.description) {
    target.description = group.description
    target['x-extraction-prompt'] = group.description
  }
  if (group.uid) target['x-group-uid'] = group.uid
  if (group.config?.tableRows) {
    const extConfig = {}
    extConfig.tableRows = group.config.tableRows === 'singleRow' ? 'singleRow' : 'multiRow'
    target['x-extended-config'] = extConfig
  }
  if (group.type) target['x-display'] = group.type
  if (isRepeatable) {
    if (typeof group.minItems === 'number') schema.minItems = group.minItems
    if (typeof group.maxItems === 'number') schema.maxItems = group.maxItems
  }

  return schema
}

export const generateMeta = (designModel) => ({
  version: designModel.meta.version,
  created: designModel.meta.created || new Date().toISOString(),
  modified: new Date().toISOString(),
  projectId: designModel.meta.projectId,
  author: designModel.meta.author || '',
  description: designModel.meta.description || '',
})

export const generateSchema = (designModel) => {
  const properties = generateProperties(designModel.folders)
  const folderOrder = designModel.folders.map((folder) => folder.name)

  return {
    $schema: designModel.meta.$schema || 'https://json-schema.org/draft/2020-12/schema',
    $id: designModel.meta.$id || 'generated.schema.json',
    type: 'object',
    unevaluatedProperties: false,
    properties,
    'x-property-order': folderOrder,
    $defs: generateDefs(designModel.enums),
    'x-schema-meta': generateMeta(designModel),
  }
}
