import { DISPLAY_TYPES } from '../constants'

export const createEmptyModel = () => ({
  meta: {
    $id: 'untitled.schema.json',
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    version: '1.0.0',
    projectId: '',
    created: null,
    modified: new Date().toISOString(),
    author: '',
    description: '',
  },
  folders: [],
  enums: {},
  selectedFolderId: null,
  selectedGroupId: null,
  selectedFieldId: null,
  expandedFolderIds: [],
  expandedGroupIds: [],
})

export const generateFieldUid = () => (
  `f_${Math.random().toString(36).slice(2, 10)}`
)

export const generateId = (prefix) => (
  `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
)

export const inferDataType = (displayType) => {
  const typeMap = {
    [DISPLAY_TYPES.NUMBER]: 'number',
    [DISPLAY_TYPES.CHECKBOX]: 'boolean',
    [DISPLAY_TYPES.MULTISELECT]: 'array',
    [DISPLAY_TYPES.DATE]: 'string',
    [DISPLAY_TYPES.DATETIME]: 'string',
  }
  return typeMap[displayType] || 'string'
}

export const normalizeTableFieldUpdates = (currentField, updates = {}) => {
  if (!updates || updates.displayType !== DISPLAY_TYPES.TABLE) {
    return updates
  }
  const nextConfig = {
    ...(currentField?.config || {}),
    ...(updates.config || {}),
  }
  const nextTableRows = nextConfig.tableRows
    || (updates.multiRow === true ? 'multiRow' : updates.multiRow === false ? 'singleRow' : null)
    || (currentField?.config?.tableRows)
    || (currentField?.multiRow ? 'multiRow' : 'singleRow')
  nextConfig.tableRows = nextTableRows

  return {
    ...updates,
    dataType: 'array',
    isTable: true,
    config: nextConfig,
    multiRow: nextTableRows === 'multiRow',
    children: Array.isArray(updates.children)
      ? updates.children
      : (Array.isArray(currentField?.children) ? currentField.children : []),
  }
}

export const syncOrder = (items = []) => {
  items.forEach((item, index) => {
    item.order = index
  })
}
