import { DISPLAY_TYPES } from '../constants.js'
import { parseField, parseFields } from './fieldParser.js'
import {
  generateId,
  orderedPropertyEntries,
  parseEnums,
  parseExtractionUnit,
  parseTableRows,
} from './utils.js'

export const parseMeta = (schema) => ({
  $id: schema.$id || 'untitled.schema.json',
  $schema: schema.$schema,
  version: schema['x-schema-meta']?.version || '1.0.0',
  projectId: schema['x-schema-meta']?.projectId || '',
  created: schema['x-schema-meta']?.created || null,
  modified: schema['x-schema-meta']?.modified || null,
  author: schema['x-schema-meta']?.author || '',
  description: schema['x-schema-meta']?.description || '',
})

export const parseGroupType = (schema) => {
  if (schema['x-display']) return schema['x-display']
  if (schema.type === 'array') return DISPLAY_TYPES.GROUP
  return DISPLAY_TYPES.GROUP
}

export const parseGroup = (name, schema, folderName, enums) => {
  const isRepeatable = schema.type === 'array' && !!schema.items
  const isLeafField = !isRepeatable &&
    !(schema.type === 'object' && schema.properties) &&
    !(schema.type === 'array' && schema.items?.properties)

  if (isLeafField) {
    const field = parseField(name, schema, false, enums)
    return {
      id: generateId('group'),
      uid: null,
      name,
      displayName: name,
      type: DISPLAY_TYPES.GROUP,
      repeatable: false,
      isExtractionUnit: false,
      mergeBinding: null,
      sources: null,
      formTemplate: null,
      fields: [field],
      config: { tableRows: 'singleRow' },
      required: [],
    }
  }

  const target = isRepeatable ? schema.items : schema
  const required = isRepeatable ? (schema.items?.required || []) : (schema?.required || [])
  return {
    id: generateId('group'),
    uid: target['x-group-uid'] || null,
    name,
    displayName: name,
    type: parseGroupType(schema),
    repeatable: isRepeatable,
    isExtractionUnit: parseExtractionUnit(target),
    mergeBinding: target['x-merge-binding'] || null,
    sources: target['x-sources'] || null,
    description: target.description || target['x-extraction-prompt'] || '',
    formTemplate: target['x-form-template'] || null,
    fields: parseFields(target, required, folderName, name, enums),
    config: {
      tableRows: parseTableRows(schema),
    },
    required: required || [],
    minItems: isRepeatable ? schema.minItems : undefined,
    maxItems: isRepeatable ? schema.maxItems : undefined,
  }
}

export const parseFolders = (schema, enums) => {
  const folders = []
  if (!schema.properties) return folders

  for (const [folderName, folderSchema] of orderedPropertyEntries(schema.properties, schema)) {
    const folder = {
      id: generateId('folder'),
      name: folderName,
      groups: [],
    }
    for (const [groupName, groupSchema] of orderedPropertyEntries(folderSchema.properties || {}, folderSchema)) {
      folder.groups.push(parseGroup(groupName, groupSchema, folderName, enums))
    }
    folders.push(folder)
  }
  return folders
}

export const parseSchema = (schema) => {
  const enums = parseEnums(schema)
  const designModel = {
    meta: parseMeta(schema),
    folders: parseFolders(schema, enums),
    enums,
    selectedFolderId: null,
    selectedGroupId: null,
    selectedFieldId: null,
    expandedFolderIds: [],
    expandedGroupIds: [],
  }

  if (designModel.folders.length > 0) {
    designModel.expandedFolderIds.push(designModel.folders[0].id)
    if (designModel.folders[0].groups.length > 0) {
      designModel.expandedGroupIds.push(designModel.folders[0].groups[0].id)
    }
  }
  return designModel
}
