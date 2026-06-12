import {
  DEFAULT_CONFIG,
  DISPLAY_TYPES,
  FIELD_CATEGORIES,
} from '../constants'
import {
  generateFieldUid,
  generateId,
  inferDataType,
} from './helpers'

export const createFolder = (folderData = {}) => ({
  id: generateId('folder'),
  name: folderData.name || '新文件夹',
  groups: [],
  ...folderData,
})

export const createGroup = (groupData = {}) => ({
  id: generateId('group'),
  uid: null,
  name: groupData.name || '新字段组',
  type: DISPLAY_TYPES.GROUP,
  displayName: groupData.name || '新字段组',
  repeatable: DEFAULT_CONFIG.group.repeatable,
  isExtractionUnit: DEFAULT_CONFIG.group.isExtractionUnit,
  mergeBinding: null,
  sources: null,
  fields: [],
  config: {},
  ...groupData,
})

export const createField = (fieldData = {}, order = 0) => {
  const uid = fieldData.uid || fieldData.fieldUid || generateFieldUid()
  const field = {
    id: generateId('field'),
    uid,
    fieldId: fieldData.fieldId || uid,
    name: fieldData.name || '新字段',
    displayName: fieldData.name || '新字段',
    displayType: fieldData.displayType || DISPLAY_TYPES.TEXT,
    dataType: inferDataType(fieldData.displayType),
    options: fieldData.options || null,
    optionsId: fieldData.optionsId || null,
    unit: fieldData.unit || null,
    nullable: DEFAULT_CONFIG.field.nullable,
    sensitive: DEFAULT_CONFIG.field.sensitive,
    primary: DEFAULT_CONFIG.field.primary,
    editable: DEFAULT_CONFIG.field.editable,
    description: fieldData.description || '',
    extractionPrompt: fieldData.extractionPrompt || '',
    skipExtraction: !!fieldData.skipExtraction,
    required: false,
    format: fieldData.format || null,
    defaultValue: null,
    children: null,
    config: fieldData.config || null,
    formTemplate: fieldData.formTemplate || null,
    fileType: fieldData.fileType || null,
    category: fieldData.category || FIELD_CATEGORIES.SINGLE,
    ...fieldData,
  }

  if (field.displayType === DISPLAY_TYPES.TABLE) {
    const tableRows = field.config?.tableRows || (field.multiRow ? 'multiRow' : 'singleRow')
    field.isTable = true
    field.dataType = 'array'
    field.multiRow = tableRows === 'multiRow'
    field.config = {
      ...(field.config || {}),
      tableRows,
    }
    if (!Array.isArray(field.children)) {
      field.children = []
    }
  }

  field.order = order
  return field
}

export const createChildField = (childFieldData = {}) => ({
  id: generateId('child'),
  uid: childFieldData.uid || null,
  name: childFieldData.name || '新子字段',
  displayName: childFieldData.name || '新子字段',
  displayType: childFieldData.displayType || DISPLAY_TYPES.TEXT,
  dataType: inferDataType(childFieldData.displayType),
  options: childFieldData.options || null,
  unit: childFieldData.unit || null,
  nullable: DEFAULT_CONFIG.field.nullable,
  required: false,
  description: childFieldData.description || '',
  ...childFieldData,
})
