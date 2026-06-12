import { allSchemas } from './schemaRegistry'

export function getDisplayColumns(fieldKey, records) {
  const schema = allSchemas[fieldKey]
  if (!schema) {
    // 未知的字段类型，返回通用列配置
    return records.length > 0
      ? Object.keys(records[0])
          .filter(k => !k.startsWith('_'))
          .map(k => ({ key: k, label: k, type: 'text' }))
      : []
  }

  // 收集记录中实际存在的字段
  const existingFields = new Set()
  records.forEach(record => {
    Object.keys(record).forEach(key => {
      if (!key.startsWith('_') && record[key] !== null && record[key] !== undefined && record[key] !== '') {
        existingFields.add(key)
      }
    })
  })

  // 过滤出有数据的列
  return schema.columns.filter(col => existingFields.has(col.key))
}

/**
 * 检查记录是否有有效内容（不只是条件字段）
 * @param {string} fieldKey - 字段键名
 * @param {Object} record - 单条记录
 * @returns {boolean} 是否有有效内容
 */
export function hasValidContent(fieldKey, record) {
  const schema = allSchemas[fieldKey]
  if (!schema) return true // 未知 schema，保守起见认为有内容

  const { conditionalDisplay, primaryDisplayFields } = schema

  // 如果有条件展示配置
  if (conditionalDisplay) {
    const condValue = record[conditionalDisplay.conditionalField]
    const shouldShowDetails = conditionalDisplay.showWhen.includes(condValue)

    if (!shouldShowDetails) {
      // 条件字段值表示"无"，但这也是有效信息
      return true
    }

    // 检查详情字段是否有值
    return conditionalDisplay.fieldsToShow.some(field => {
      const value = record[field]
      return value !== null && value !== undefined && value !== ''
    })
  }

  // 如果有主要展示字段，检查是否有值
  if (primaryDisplayFields && primaryDisplayFields.length > 0) {
    return primaryDisplayFields.some(field => {
      const value = record[field]
      return value !== null && value !== undefined && value !== ''
    })
  }

  return true
}

/**
 * 获取记录的摘要展示文本
 * @param {string} fieldKey - 字段键名
 * @param {Object} record - 单条记录
 * @returns {string} 摘要文本
 */
export function getRecordSummary(fieldKey, record) {
  const schema = allSchemas[fieldKey]
  if (!schema) {
    // 未知 schema，返回第一个非空值
    for (const [key, value] of Object.entries(record)) {
      if (!key.startsWith('_') && value) {
        return String(value)
      }
    }
    return '（无详情）'
  }

  const { conditionalDisplay, primaryDisplayFields } = schema

  // 如果有条件展示配置
  if (conditionalDisplay) {
    const condValue = record[conditionalDisplay.conditionalField]
    const shouldShowDetails = conditionalDisplay.showWhen.includes(condValue)

    if (!shouldShowDetails) {
      // 返回条件字段的值
      return condValue || '无'
    }
  }

  // 使用主要展示字段构建摘要
  if (primaryDisplayFields && primaryDisplayFields.length > 0) {
    const parts = []
    for (const field of primaryDisplayFields) {
      const value = record[field]
      if (value !== null && value !== undefined && value !== '') {
        if (Array.isArray(value)) {
          parts.push(`${value.length}项`)
        } else {
          parts.push(String(value))
        }
      }
    }
    if (parts.length > 0) {
      return parts.join(' / ')
    }
  }

  return '（无详情）'
}
