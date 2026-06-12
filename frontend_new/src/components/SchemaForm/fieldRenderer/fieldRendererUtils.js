// 选项数量阈值：超过此数量时自动使用下拉菜单
export const RADIO_OPTIONS_THRESHOLD = 15

/**
 * 从Schema定义中获取显示类型
 */
export function getDisplayType(fieldSchema, optionsCount = 0) {
  if (fieldSchema['x-display']) {
    const display = fieldSchema['x-display']
    if (display === 'radio' && optionsCount > RADIO_OPTIONS_THRESHOLD) {
      return 'select'
    }
    return display
  }

  if (fieldSchema.format === 'date-time') return 'datetime'
  if (fieldSchema.format === 'date') return 'date'
  if (fieldSchema.type === 'number' || fieldSchema.type === 'integer') return 'number'
  if (fieldSchema.type === 'boolean') return 'checkbox'
  if (fieldSchema.allOf || fieldSchema.enum) return 'select'

  return 'text'
}

/**
 * 从枚举引用中获取选项
 */
export function getOptionsFromSchema(fieldSchema, enums) {
  if (fieldSchema.enum) {
    return fieldSchema.enum.map((value) => ({ label: value, value }))
  }

  if (fieldSchema['x-options-id'] && enums) {
    const enumDef = enums[fieldSchema['x-options-id']]
    if (enumDef?.values) {
      return enumDef.values.map((value) => ({ label: value, value }))
    }
  }

  if (fieldSchema.allOf?.[0]?.$ref) {
    const refId = fieldSchema.allOf[0].$ref.replace('#/$defs/', '')
    if (enums && enums[refId]?.values) {
      return enums[refId].values.map((value) => ({ label: value, value }))
    }
  }

  return []
}
