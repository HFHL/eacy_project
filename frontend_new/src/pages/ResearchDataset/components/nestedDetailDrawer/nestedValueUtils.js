export const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

export const isScalar = (value) => value === null || value === undefined || typeof value !== 'object'

export const unwrapFieldValue = (value) => {
  if (!value || typeof value !== 'object') return value
  if (Object.prototype.hasOwnProperty.call(value, 'value')) return value.value
  return value
}

const isObjectArray = (value) => Array.isArray(value) && value.every((item) => isPlainObject(unwrapFieldValue(item)))

export const normalizeSlashPath = (rawPath) => {
  return String(rawPath || '')
    .normalize('NFKC')
    .replace(/\s*\/\s*/g, '/')
    .trim()
}

export const formatScalarText = (value) => {
  const normalizedValue = unwrapFieldValue(value)
  if (normalizedValue === null || normalizedValue === undefined || normalizedValue === '') return '--'
  if (typeof normalizedValue === 'boolean') return normalizedValue ? '是' : '否'
  return String(normalizedValue)
}

export const isEmptyAlignedValue = (value) => {
  if (value === null || value === undefined || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (isPlainObject(value)) return Object.keys(value).length === 0
  return false
}

export const safeStringify = (value) => {
  try {
    return JSON.stringify(value, null, 2)
  } catch (error) {
    return `[序列化失败] ${String(error?.message || error)}`
  }
}

export const inferValueKind = (value) => {
  const normalizedValue = unwrapFieldValue(value)
  if (isScalar(normalizedValue)) return 'scalar'
  if (Array.isArray(normalizedValue)) {
    if (normalizedValue.length === 0) return 'arrayScalar'
    if (isObjectArray(normalizedValue)) return 'arrayObject'
    const allScalar = normalizedValue.every((item) => isScalar(unwrapFieldValue(item)))
    return allScalar ? 'arrayScalar' : 'arrayMixed'
  }
  return 'object'
}

export const buildTypeLabel = (value) => {
  const kind = inferValueKind(value)
  if (kind === 'scalar') return '标量'
  if (kind === 'object') return '对象'
  if (kind === 'arrayObject') return '对象数组'
  if (kind === 'arrayMixed') return '混合数组'
  return '数组'
}

export const buildCountLabel = (value) => {
  const normalizedValue = unwrapFieldValue(value)
  if (Array.isArray(normalizedValue)) return `${normalizedValue.length} 条`
  if (isPlainObject(normalizedValue)) return `${Object.keys(normalizedValue).length} 字段`
  return '1 条'
}

export const extractComplexObjectPayload = (objectValue) => {
  if (!isPlainObject(objectValue)) return {}
  return Object.entries(objectValue).reduce((payload, [fieldKey, fieldValue]) => {
    const normalizedFieldValue = unwrapFieldValue(fieldValue)
    if (isScalar(normalizedFieldValue)) return payload
    payload[fieldKey] = normalizedFieldValue
    return payload
  }, {})
}
