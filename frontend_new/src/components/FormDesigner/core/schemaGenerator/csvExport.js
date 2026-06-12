import { DISPLAY_TYPES } from '../constants.js'

export const CSV_HEADERS = [
  '文件（访视层）',
  '层级1（表单层）',
  '层级2', '层级3', '层级4', '层级5', '层级6', '层级7', '层级8', '层级9', '层级10',
  '展示类型',
  '可选项值',
  '数据类型',
  '数据单位',
  'group是否可重复',
  'table是否多行',
  '是否为抽取单位组',
  '主要来源',
  '次要来源',
  '时间属性字段组绑定',
  '是否为敏感字段',
  '是否为主键级字段',
  '字段是否可编辑',
  '字段可否为空（nullable）',
  '提示词-字段说明',
  '抽取提示词（示例）',
  '字段冲突处理规则',
  '扩展配置',
  '字段UID',
]

export const buildLevelColumns = (levels) => (
  Array.from({ length: 9 }, (_unused, index) => levels[index] || '')
)

export const mapDataTypeToCSV = (dataType, displayType) => {
  if (displayType === DISPLAY_TYPES.DATE) return '日期'
  if (displayType === DISPLAY_TYPES.DATETIME) return '日期时间'
  if (displayType === DISPLAY_TYPES.FILE) return '文件'
  if (dataType === 'number') return '数字'
  if (dataType === 'boolean') return '布尔值'
  if (dataType === 'array') return '数组'
  return '文本'
}

export const generateGroupCSVRow = (folder, group) => {
  const isGroupTable = group.type === DISPLAY_TYPES.TABLE
  const groupTableRows = group.config?.tableRows || (group.repeatable ? 'multiRow' : 'singleRow')
  return [
    folder.name,
    group.name,
    ...buildLevelColumns([]),
    group.type || DISPLAY_TYPES.GROUP,
    '',
    '',
    '',
    group.repeatable ? '可重复' : '不可重复',
    isGroupTable ? (groupTableRows === 'multiRow' ? '多行' : '单行') : '',
    group.isExtractionUnit ? '是' : '',
    group.sources?.primary?.join(',') || '',
    group.sources?.secondary?.join(',') || '',
    group.mergeBinding || '',
    '',
    '',
    '',
    '',
    '',
    group.description || '',
    '',
    '',
    '',
  ]
}

export const generateTableCSVRow = (folder, group, field) => {
  const tableRows = field.config?.tableRows || 'multiRow'
  return [
    folder.name,
    group.name,
    ...buildLevelColumns([field.name]),
    DISPLAY_TYPES.TABLE,
    '',
    '',
    '',
    '',
    tableRows === 'multiRow' ? '多行' : '单行',
    '', '', '', '', '', '', '', '', '', '', '', '', '',
  ]
}

export const generateNestedTableCSVRow = (folder, group, parentTables, field) => {
  const tableRows = field.config?.tableRows || 'multiRow'
  return [
    folder.name,
    group.name,
    ...buildLevelColumns([...parentTables, field.name]),
    DISPLAY_TYPES.TABLE,
    '',
    '',
    '',
    '',
    tableRows === 'multiRow' ? '多行' : '单行',
    '', '', '', '', '', '', '', '', '', '', '', '', '',
  ]
}

export const generateFieldCSVRow = (folder, group, parentTables, field) => {
  let primarySources = ''
  let secondarySources = ''
  if (group.sources) {
    primarySources = group.sources.primary?.join(',') || ''
    secondarySources = group.sources.secondary?.join(',') || ''
  }

  let extendedConfig = ''
  const mergedConfig = { ...(field.config || {}) }
  if (typeof field.minimum === 'number') mergedConfig.minimum = field.minimum
  if (typeof field.maximum === 'number') mergedConfig.maximum = field.maximum
  if (field.pattern) mergedConfig.pattern = field.pattern
  if (Object.keys(mergedConfig).length > 0) {
    extendedConfig = JSON.stringify(mergedConfig)
  }

  return [
    folder.name,
    group.name,
    ...buildLevelColumns([...(parentTables || []), field.name]),
    field.displayType || '',
    field.options?.join(',') || '',
    mapDataTypeToCSV(field.dataType, field.displayType),
    field.unit || '',
    '',
    '',
    '',
    primarySources,
    secondarySources,
    '',
    field.sensitive ? '是' : '',
    field.primary ? '是' : '',
    field.editable ? '是' : '否',
    field.nullable ? '是' : '否',
    field.description || '',
    field.extractionPrompt || '',
    '',
    extendedConfig,
    field.uid || '',
  ]
}

export const appendFieldRows = (rows, folder, group, field, parentTables) => {
  if (field?.isTable && Array.isArray(field.children)) {
    rows.push(parentTables.length === 0
      ? generateTableCSVRow(folder, group, field)
      : generateNestedTableCSVRow(folder, group, parentTables, field))
    for (const childField of field.children) {
      appendFieldRows(rows, folder, group, childField, [...parentTables, field.name])
    }
    return
  }
  rows.push(generateFieldCSVRow(folder, group, parentTables, field))
}

export const generateCSV = (designModel) => {
  const rows = []
  for (const folder of designModel.folders) {
    for (const group of folder.groups) {
      rows.push(generateGroupCSVRow(folder, group))
      for (const field of group.fields) {
        appendFieldRows(rows, folder, group, field, [])
      }
    }
  }
  return { headers: CSV_HEADERS, rows }
}
