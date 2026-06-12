const validateNumberValue = (value, fieldSchema) => {
  if (typeof value !== 'number' || isNaN(value)) {
    return { valid: false, error: '请输入有效的数字' }
  }
  if (fieldSchema.minimum !== undefined && value < fieldSchema.minimum) {
    return { valid: false, error: `最小值为${fieldSchema.minimum}` }
  }
  if (fieldSchema.maximum !== undefined && value > fieldSchema.maximum) {
    return { valid: false, error: `最大值为${fieldSchema.maximum}` }
  }
  if (fieldSchema.validation?.min !== undefined && value < fieldSchema.validation.min) {
    return { valid: false, error: `最小值为${fieldSchema.validation.min}` }
  }
  if (fieldSchema.validation?.max !== undefined && value > fieldSchema.validation.max) {
    return { valid: false, error: `最大值为${fieldSchema.validation.max}` }
  }
  return { valid: true }
}

const validateStringValue = (value, fieldSchema) => {
  if (typeof value !== 'string') {
    return { valid: false, error: '请输入有效的文本' }
  }
  if (fieldSchema.minimum !== undefined && value.length < fieldSchema.minimum) {
    return { valid: false, error: `最小长度为${fieldSchema.minimum}` }
  }
  if (fieldSchema.maximum !== undefined && value.length > fieldSchema.maximum) {
    return { valid: false, error: `最大长度为${fieldSchema.maximum}` }
  }
  if (fieldSchema.pattern && !new RegExp(fieldSchema.pattern).test(value)) {
    return { valid: false, error: '格式不正确' }
  }
  if (fieldSchema.validation?.minLength !== undefined &&
      value.length < fieldSchema.validation.minLength) {
    return { valid: false, error: `最小长度为${fieldSchema.validation.minLength}` }
  }
  if (fieldSchema.validation?.maxLength !== undefined &&
      value.length > fieldSchema.validation.maxLength) {
    return { valid: false, error: `最大长度为${fieldSchema.validation.maxLength}` }
  }
  if (fieldSchema.validation?.pattern && !new RegExp(fieldSchema.validation.pattern).test(value)) {
    return { valid: false, error: '格式不正确' }
  }
  return { valid: true }
}

const validateArrayValue = (value, fieldSchema) => {
  if (!Array.isArray(value)) {
    return { valid: false, error: '请选择有效的选项' }
  }
  if (fieldSchema.required && value.length === 0) {
    return { valid: false, error: '请至少选择一项' }
  }
  return { valid: true }
}

const validateOptions = (value, fieldSchema) => {
  if (!fieldSchema.options || fieldSchema.options.length === 0) return { valid: true }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!fieldSchema.options.includes(item)) {
        return { valid: false, error: `选项"${item}"不在可选值范围内` }
      }
    }
    return { valid: true }
  }
  if (!fieldSchema.options.includes(value)) {
    return { valid: false, error: `选项"${value}"不在可选值范围内` }
  }
  return { valid: true }
}

export const validateFieldValue = (value, fieldSchema) => {
  if (value === null || value === undefined || value === '') {
    if (value === null && fieldSchema.nullable) return { valid: true }
    if (fieldSchema.required) return { valid: false, error: '该字段为必填项' }
    return { valid: true }
  }

  let typeResult = { valid: true }
  switch (fieldSchema.dataType) {
    case 'number':
      typeResult = validateNumberValue(value, fieldSchema)
      break
    case 'string':
      typeResult = validateStringValue(value, fieldSchema)
      break
    case 'array':
      typeResult = validateArrayValue(value, fieldSchema)
      break
    default:
      break
  }
  if (!typeResult.valid) return typeResult
  return validateOptions(value, fieldSchema)
}
