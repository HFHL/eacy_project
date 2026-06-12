import { CSV_COLUMNS, DISPLAY_TYPES } from '../../core/constants.js'
import { LEVEL_HEADERS } from './constants.js'
import {
  buildHeaderIndex,
  extractHeaderAndRows,
  getValue,
  validateCSVHeaders,
} from './headerUtils.js'
import {
  makeId,
  parseBoolean,
  parseDataType,
  parseDisplayType,
  parseEditable,
  parseJsonConfig,
  parseList,
  parseNullable,
  parseRepeatable,
  parseTableRows,
} from './parseUtils.js'

export const ensureFolder = (folderMap, folderName) => {
  if (!folderMap.has(folderName)) {
    folderMap.set(folderName, {
      id: makeId('folder'),
      name: folderName,
      groups: [],
    })
  }
  return folderMap.get(folderName)
}

export const ensureGroup = (folder, groupName) => {
  let group = folder.groups.find((item) => item.name === groupName)
  if (!group) {
    group = {
      id: makeId('group'),
      name: groupName,
      displayName: groupName,
      description: '',
      type: DISPLAY_TYPES.GROUP,
      repeatable: false,
      multiRow: false,
      isExtractionUnit: false,
      mergeBinding: '',
      sources: null,
      config: {},
      fields: [],
      required: [],
    }
    folder.groups.push(group)
  }
  return group
}

export const mergeGroupMeta = (group, row, headerIndex, displayType) => {
  const repeatable = parseRepeatable(getValue(row, headerIndex, CSV_COLUMNS.GROUP_REPEATABLE))
  const extractionUnit = parseBoolean(getValue(row, headerIndex, CSV_COLUMNS.IS_EXTRACTION_UNIT))
  const primarySources = parseList(getValue(row, headerIndex, CSV_COLUMNS.PRIMARY_SOURCES))
  const secondarySources = parseList(getValue(row, headerIndex, CSV_COLUMNS.SECONDARY_SOURCES))
  const mergeBinding = getValue(row, headerIndex, CSV_COLUMNS.TIME_BINDING)
  const groupPrompt = getValue(row, headerIndex, CSV_COLUMNS.EXTRACTION_PROMPT)

  if (repeatable !== null) group.repeatable = repeatable
  if (extractionUnit !== null) group.isExtractionUnit = extractionUnit
  if (primarySources.length > 0 || secondarySources.length > 0) {
    group.sources = { primary: primarySources, secondary: secondarySources }
    group.primarySources = primarySources
    group.secondarySources = secondarySources
    group.isExtractionUnit = extractionUnit !== null ? extractionUnit : true
  } else if (extractionUnit !== null) {
    group.isExtractionUnit = extractionUnit
    group.sources = null
  }
  if (mergeBinding) group.mergeBinding = mergeBinding
  if (displayType === DISPLAY_TYPES.GROUP && groupPrompt && !group.description) {
    group.description = groupPrompt
  }
}

export const ensureTableField = (group, tableName, row, headerIndex, options = {}) => {
  const { applyTableRows = true } = options
  const childList = Array.isArray(group.fields) ? group.fields : group.children
  if (!Array.isArray(childList)) return null

  let field = childList.find((item) => item.name === tableName && item.isTable)
  if (!field) {
    field = {
      id: makeId('field'),
      name: tableName,
      displayName: tableName,
      displayType: DISPLAY_TYPES.TABLE,
      dataType: 'array',
      repeatable: true,
      multiRow: true,
      isTable: true,
      nullable: true,
      sensitive: false,
      primary: false,
      editable: true,
      description: '',
      required: false,
      children: [],
      config: { tableRows: 'multiRow' },
    }
    childList.push(field)
  }

  if (applyTableRows) {
    const tableRows = parseTableRows(getValue(row, headerIndex, CSV_COLUMNS.TABLE_MULTI_ROW))
    field.repeatable = tableRows === 'multiRow'
    field.multiRow = tableRows === 'multiRow'
    field.config = { ...(field.config || {}), tableRows }
  }
  return field
}

export const ensureTablePath = (group, tableLevels, row, headerIndex, options = {}) => {
  const { applyTableRowsOnLeaf = true } = options
  if (!Array.isArray(tableLevels) || tableLevels.length === 0) return null

  let currentContainer = group
  tableLevels.forEach((tableName, index) => {
    currentContainer = ensureTableField(currentContainer, tableName, row, headerIndex, {
      applyTableRows: applyTableRowsOnLeaf && index === tableLevels.length - 1,
    })
  })
  return currentContainer
}

export const buildField = (fieldName, row, headerIndex, displayType) => {
  const parsedOptions = parseList(getValue(row, headerIndex, CSV_COLUMNS.OPTIONS))
  const nullable = parseNullable(getValue(row, headerIndex, CSV_COLUMNS.IS_NULLABLE))
  const editable = parseEditable(getValue(row, headerIndex, CSV_COLUMNS.IS_EDITABLE))
  const config = parseJsonConfig(getValue(row, headerIndex, CSV_COLUMNS.EXTENDED_CONFIG))
  const minimum = typeof config?.minimum === 'number' ? config.minimum : undefined
  const maximum = typeof config?.maximum === 'number' ? config.maximum : undefined
  const pattern = typeof config?.pattern === 'string' ? config.pattern : undefined
  const normalizedConfig = config ? { ...config } : undefined
  if (normalizedConfig) {
    delete normalizedConfig.minimum
    delete normalizedConfig.maximum
    delete normalizedConfig.pattern
  }

  return {
    id: makeId('field'),
    uid: getValue(row, headerIndex, CSV_COLUMNS.FIELD_UID) || undefined,
    name: fieldName,
    displayName: fieldName,
    displayType,
    dataType: parseDataType(getValue(row, headerIndex, CSV_COLUMNS.DATA_TYPE), displayType, parsedOptions),
    unit: getValue(row, headerIndex, CSV_COLUMNS.DATA_UNIT) || '',
    options: parsedOptions,
    nullable,
    sensitive: parseBoolean(getValue(row, headerIndex, CSV_COLUMNS.IS_SENSITIVE)) === true,
    primary: parseBoolean(getValue(row, headerIndex, CSV_COLUMNS.IS_PRIMARY)) === true,
    editable,
    description: getValue(row, headerIndex, CSV_COLUMNS.FIELD_DESC) || '',
    extractionPrompt: getValue(row, headerIndex, CSV_COLUMNS.EXTRACTION_PROMPT) || '',
    required: !nullable,
    minimum,
    maximum,
    pattern,
    config: normalizedConfig && Object.keys(normalizedConfig).length > 0 ? normalizedConfig : undefined,
  }
}

export const csvToDesignModel = (csvData) => {
  if (!Array.isArray(csvData) || csvData.length < 2) {
    throw new Error('CSV数据为空或格式不正确')
  }

  const { headers, rows } = extractHeaderAndRows(csvData)
  const headerIndex = buildHeaderIndex(headers)
  validateCSVHeaders(headerIndex)
  const folderMap = new Map()

  rows.forEach((row) => {
    if (!Array.isArray(row) || !row.some((cell) => String(cell || '').trim())) return

    const folderName = getValue(row, headerIndex, CSV_COLUMNS.FOLDER)
    const levelValues = LEVEL_HEADERS.map((header) => getValue(row, headerIndex, header))
    const groupName = levelValues[0]
    const nestedLevels = levelValues.slice(1).filter(Boolean)
    const displayType = parseDisplayType(getValue(row, headerIndex, CSV_COLUMNS.DISPLAY_TYPE))

    if (!folderName || !groupName || !displayType) return

    const folder = ensureFolder(folderMap, folderName)
    const group = ensureGroup(folder, groupName)
    mergeGroupMeta(group, row, headerIndex, displayType)

    if (displayType === DISPLAY_TYPES.GROUP) return
    if (displayType === DISPLAY_TYPES.TABLE) {
      if (nestedLevels.length === 0) {
        const tableRows = parseTableRows(getValue(row, headerIndex, CSV_COLUMNS.TABLE_MULTI_ROW))
        const isMultiRow = tableRows === 'multiRow'
        group.type = DISPLAY_TYPES.TABLE
        group.repeatable = isMultiRow
        group.multiRow = isMultiRow
        group.config = { ...(group.config || {}), tableRows }
        return
      }
      ensureTablePath(group, nestedLevels, row, headerIndex, { applyTableRowsOnLeaf: true })
      return
    }

    if (nestedLevels.length === 0) return
    if (nestedLevels.length === 1) {
      group.fields.push(buildField(nestedLevels[0], row, headerIndex, displayType))
      return
    }

    const tableField = ensureTablePath(group, nestedLevels.slice(0, -1), row, headerIndex, {
      applyTableRowsOnLeaf: false,
    })
    if (!tableField) return
    tableField.children.push(buildField(nestedLevels[nestedLevels.length - 1], row, headerIndex, displayType))
  })

  return {
    meta: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'generated-from-csv',
      title: '从CSV导入的Schema',
      version: '1.0.0',
      projectId: 'csv-import',
      createdAt: new Date().toISOString(),
    },
    folders: Array.from(folderMap.values()),
    enums: {},
  }
}
