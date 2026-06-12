import { DISPLAY_TYPES } from '../constants'
import { normalizeSchemaForDesigner } from './normalize'

export const validateSchemaFormat = (schema) => {
  try {
    const normalizedSchema = normalizeSchemaForDesigner(schema)
    if (!normalizedSchema.$schema) {
      return {
        valid: false,
        errors: [{ message: '缺少$schema声明', path: '$' }],
      }
    }

    if (!normalizedSchema.properties || Object.keys(normalizedSchema.properties).length === 0) {
      return {
        valid: false,
        errors: [{ message: 'Schema必须包含至少一个文件夹', path: 'properties' }],
      }
    }

    const folderErrors = validateFolders(normalizedSchema.properties)
    if (folderErrors.length > 0) {
      return { valid: false, errors: folderErrors }
    }
    return { valid: true, errors: [] }
  } catch (error) {
    return {
      valid: false,
      errors: [{ message: `Schema解析失败: ${error.message}`, path: 'root' }],
    }
  }
}

export const validateFolders = (properties) => {
  const errors = []
  for (const [folderName, folderSchema] of Object.entries(properties)) {
    if (folderSchema.type !== 'object' && !(folderSchema.type === undefined && folderSchema.properties)) {
      errors.push({
        message: `文件夹"${folderName}"必须是object类型`,
        path: `properties.${folderName}.type`,
      })
      continue
    }

    if (!folderSchema.properties) continue
    errors.push(...validateGroups(folderSchema.properties, folderName))
  }
  return errors
}

export const validateGroups = (properties, folderName) => {
  const errors = []
  for (const [groupName, groupSchema] of Object.entries(properties)) {
    const isLeafField = groupSchema.type && !['object', 'array'].includes(groupSchema.type)
    if (isLeafField) continue

    if (groupSchema.type === 'array') {
      if (!groupSchema.items) {
        errors.push({
          message: `字段组"${folderName}.${groupName}"是array类型但缺少items定义`,
          path: `properties.${folderName}.properties.${groupName}.items`,
        })
        continue
      }
      if (groupSchema.items.type !== 'object') {
        errors.push({
          message: `字段组"${folderName}.${groupName}"的items必须是object类型`,
          path: `properties.${folderName}.properties.${groupName}.items.type`,
        })
      }
    } else if (groupSchema.type !== 'object') {
      errors.push({
        message: `字段组"${folderName}.${groupName}"必须是object或array类型`,
        path: `properties.${folderName}.properties.${groupName}.type`,
      })
    }

    const target = groupSchema.type === 'array' ? groupSchema.items : groupSchema
    if (target['x-sources'] && !Array.isArray(target['x-sources'].primary)) {
      errors.push({
        message: `字段组"${folderName}.${groupName}"的x-sources.primary必须是数组`,
        path: `properties.${folderName}.properties.${groupName}['x-sources'].primary`,
      })
    }

    if (target.properties) {
      errors.push(...validateFields(target.properties, folderName, groupName))
    }
  }
  return errors
}

export const validateFields = (properties, folderName, groupName) => {
  const errors = []
  for (const [fieldName, fieldSchema] of Object.entries(properties)) {
    if (fieldSchema.type === 'object' ||
        (fieldSchema.type === 'array' && fieldSchema.items?.type === 'object')) {
      continue
    }

    const hasRefLikeType = (
      typeof fieldSchema.$ref === 'string' ||
      Array.isArray(fieldSchema.allOf) ||
      Array.isArray(fieldSchema.oneOf) ||
      Array.isArray(fieldSchema.anyOf) ||
      Array.isArray(fieldSchema.enum) ||
      Object.prototype.hasOwnProperty.call(fieldSchema, 'const') ||
      typeof fieldSchema['x-display'] === 'string'
    )

    const validTypes = ['string', 'number', 'boolean', 'array']
    if (!hasRefLikeType && !validTypes.includes(fieldSchema.type)) {
      errors.push({
        message: `字段"${folderName}.${groupName}.${fieldName}"的类型无效`,
        path: `properties.${folderName}.properties.${groupName}.properties.${fieldName}.type`,
      })
    }

    if (fieldSchema['x-field-uid'] && !/^f_[a-z0-9]{8}$/i.test(fieldSchema['x-field-uid'])) {
      errors.push({
        message: `字段"${fieldName}"的x-field-uid格式错误，应为f_xxxxxxxx格式`,
        path: `properties.${folderName}.properties.${groupName}.properties.${fieldName}['x-field-uid']`,
      })
    }

    const displayType = fieldSchema['x-display']
    if (displayType && !Object.values(DISPLAY_TYPES).includes(displayType)) {
      errors.push({
        message: `字段"${fieldName}"的x-display值无效: ${displayType}`,
        path: `properties.${folderName}.properties.${groupName}.properties.${fieldName}['x-display']`,
      })
    }
  }
  return errors
}
