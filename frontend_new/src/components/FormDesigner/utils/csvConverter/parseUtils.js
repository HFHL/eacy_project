import { DISPLAY_TYPES } from '../../core/constants.js'

export const parseDisplayType = (value) => {
  const normalized = String(value || '').trim()
  const typeMap = {
    text: DISPLAY_TYPES.TEXT,
    textarea: DISPLAY_TYPES.TEXTAREA,
    number: DISPLAY_TYPES.NUMBER,
    date: DISPLAY_TYPES.DATE,
    datetime: DISPLAY_TYPES.DATETIME,
    radio: DISPLAY_TYPES.RADIO,
    checkbox: DISPLAY_TYPES.CHECKBOX,
    select: DISPLAY_TYPES.SELECT,
    multiselect: DISPLAY_TYPES.MULTISELECT,
    file: DISPLAY_TYPES.FILE,
    group: DISPLAY_TYPES.GROUP,
    table: DISPLAY_TYPES.TABLE,
    文本: DISPLAY_TYPES.TEXT,
    多行文本: DISPLAY_TYPES.TEXTAREA,
    数字: DISPLAY_TYPES.NUMBER,
    日期: DISPLAY_TYPES.DATE,
    日期时间: DISPLAY_TYPES.DATETIME,
    单选: DISPLAY_TYPES.RADIO,
    多选: DISPLAY_TYPES.CHECKBOX,
    下拉单选: DISPLAY_TYPES.SELECT,
    下拉多选: DISPLAY_TYPES.MULTISELECT,
    文件: DISPLAY_TYPES.FILE,
    分组: DISPLAY_TYPES.GROUP,
    表格: DISPLAY_TYPES.TABLE,
  }
  return typeMap[normalized] || normalized || DISPLAY_TYPES.TEXT
}

export const parseDataType = (value, displayType, options = []) => {
  const normalized = String(value || '').trim()
  const dataTypeMap = {
    文本: 'string',
    数字: 'number',
    日期: 'string',
    日期时间: 'string',
    布尔: 'boolean',
    布尔值: 'boolean',
    数组: 'array',
    boolean: 'boolean',
    string: 'string',
    number: 'number',
    array: 'array',
  }
  if (dataTypeMap[normalized]) return dataTypeMap[normalized]
  if (displayType === DISPLAY_TYPES.NUMBER) return 'number'
  if (displayType === DISPLAY_TYPES.MULTISELECT) return 'array'
  if (displayType === DISPLAY_TYPES.CHECKBOX) {
    return Array.isArray(options) && options.length > 0 ? 'array' : 'boolean'
  }
  return 'string'
}

export const parseRepeatable = (value) => {
  if (!value) return null
  if (value === '可重复') return true
  if (value === '不可重复') return false
  return parseBoolean(value)
}

export const parseTableRows = (value) => (value === '单行' ? 'singleRow' : 'multiRow')

export const parseNullable = (value) => value !== '否'

export const parseEditable = (value) => value !== '否'

export const parseBoolean = (value) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return null
  if (['是', 'true', '1', 'yes', 'y'].includes(normalized)) return true
  if (['否', 'false', '0', 'no', 'n'].includes(normalized)) return false
  return null
}

export const parseList = (value) => {
  if (!value) return []
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export const parseJsonConfig = (value) => {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (_error) {
    return null
  }
}

export const makeId = (prefix) => (
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
)
