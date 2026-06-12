export const cloneJsonValue = (value) => {
  if (value === undefined) return undefined
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return value
  }
}

export const normalizeSchemaPath = (rawPath) => String(rawPath || '')
  .replace(/\[\*\]/g, '')
  .split('/')
  .map((part) => part.trim())
  .filter(Boolean)

export const normalizeFieldPathSegments = (rawPath) => String(rawPath || '')
  .replace(/\[\*\]/g, '')
  .replace(/\[(\d+)\]/g, '/$1')
  .split(/[/.]/)
  .map((part) => part.trim())
  .filter(Boolean)

export const normalizeFieldPathToDot = (rawPath) => normalizeFieldPathSegments(rawPath).join('.')

export const getValueAtDotPath = (data, dotPath) => {
  const parts = String(dotPath || '').split('.').filter(Boolean)
  let cursor = data
  for (const part of parts) {
    if (cursor === null || cursor === undefined) return undefined
    if (Array.isArray(cursor) && /^\d+$/.test(part)) {
      cursor = cursor[Number(part)]
      continue
    }
    if (typeof cursor !== 'object') return undefined
    cursor = cursor[part]
  }
  return cursor
}

export function getSchemaNodeByParts(schemaRoot, parts) {
  let current = schemaRoot
  for (const part of parts) {
    if (!current || typeof current !== 'object') return null
    if (current.type === 'object' && current.properties?.[part]) {
      current = current.properties[part]
      continue
    }
    if (current.type === 'array' && current.items) {
      current = current.items
      if (current.type === 'object' && current.properties?.[part]) {
        current = current.properties[part]
        continue
      }
    }
    return null
  }
  return current && typeof current === 'object' ? current : null
}

export function readValueBySchema(data, schemaNode, parts) {
  if (!schemaNode || typeof schemaNode !== 'object') return undefined
  if (parts.length === 0) return data

  if (schemaNode.type === 'array' && schemaNode.items) {
    if (!Array.isArray(data)) return undefined
    return data.map((item) => readValueBySchema(item, schemaNode.items, parts))
  }

  if (schemaNode.type === 'object' && schemaNode.properties) {
    const [head, ...rest] = parts
    const childSchema = schemaNode.properties?.[head]
    if (!childSchema) return undefined
    return readValueBySchema(data?.[head], childSchema, rest)
  }

  return data
}

export function readValueByLoosePath(data, parts) {
  if (!Array.isArray(parts) || parts.length === 0) return data
  let cursor = data
  for (const part of parts) {
    if (cursor === null || cursor === undefined) return undefined
    if (Array.isArray(cursor) && /^\d+$/.test(part)) {
      cursor = cursor[Number(part)]
      continue
    }
    if (typeof cursor !== 'object') return undefined
    cursor = cursor[part]
  }
  return cursor
}

export function hasEffectiveValue(value) {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value !== ''
  if (Array.isArray(value)) {
    if (value.length === 0) return false
    return value.some((item) => hasEffectiveValue(item))
  }
  if (typeof value === 'object') {
    const entries = Object.values(value)
    if (entries.length === 0) return false
    return entries.some((item) => hasEffectiveValue(item))
  }
  return true
}
