import { DISPLAY_TYPES } from '../../../core/constants'
import { getFieldTypeLabel } from '../../../utils/schemaHelpers'
import {
  TABLE_MULTI_ROW_DISPLAY_TYPE,
  TABLE_SINGLE_ROW_DISPLAY_TYPE,
} from '../../../utils/fieldContract'

export const SHOW_FIELD_REUSE_SECTION = false
export const SHOW_FORMAT_FIELD = false
export const SHOW_PATTERN_FIELD = false
export const SHOW_PRIMARY_FIELD = false
export const SHOW_CONFIG_NOTICE = false
export const SHOW_FIELD_INFO = false
export const SHOW_FIELD_ID = false
export const SHOW_DISPLAY_NAME = false
export const SHOW_DATA_TYPE = false

export function inferDataTypeByDisplayType(displayType, options = []) {
  if (displayType === DISPLAY_TYPES.NUMBER) return 'number'
  if (displayType === DISPLAY_TYPES.DATETIME) return 'string'
  if (displayType === TABLE_SINGLE_ROW_DISPLAY_TYPE || displayType === TABLE_MULTI_ROW_DISPLAY_TYPE) return 'array'
  if (displayType === DISPLAY_TYPES.MULTISELECT) return 'array'
  if (displayType === DISPLAY_TYPES.CHECKBOX) {
    return Array.isArray(options) && options.length > 0 ? 'array' : 'boolean'
  }
  return 'string'
}

export function getDisplayTypeOptions() {
  const baseOptions = Object.entries(DISPLAY_TYPES).map(([_key, value]) => ({
    label: getFieldTypeLabel(value),
    value,
  }))
  const optionsWithoutTable = baseOptions.filter((item) => item.value !== DISPLAY_TYPES.TABLE)
  return [
    ...optionsWithoutTable,
    { label: '单行表格', value: TABLE_SINGLE_ROW_DISPLAY_TYPE },
    { label: '多行表格', value: TABLE_MULTI_ROW_DISPLAY_TYPE },
  ]
}
