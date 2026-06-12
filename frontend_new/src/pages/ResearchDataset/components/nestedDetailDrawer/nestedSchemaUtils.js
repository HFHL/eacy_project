import { normalizeRepeatableTableSchema } from '../../../../components/SchemaForm/schemaRenderKernel'
import {
  isEmptyAlignedValue,
  isPlainObject,
  normalizeSlashPath,
  unwrapFieldValue,
} from './nestedValueUtils'

export const normalizeDetailSchemaNode = (schemaNode) => {
  return schemaNode && typeof schemaNode === 'object'
    ? normalizeRepeatableTableSchema(schemaNode)
    : null
}

export const getSchemaPropertyEntries = (schemaNode) => {
  const normalizedNode = normalizeDetailSchemaNode(schemaNode)
  const properties = normalizedNode?.properties && typeof normalizedNode.properties === 'object'
    ? normalizedNode.properties
    : null
  if (!properties) return []
  const order = normalizedNode?.['x-property-order']
  if (!Array.isArray(order) || order.length === 0) return Object.entries(properties)

  const seen = new Set()
  const sorted = []
  order.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(properties, key) && !seen.has(key)) {
      sorted.push([key, properties[key]])
      seen.add(key)
    }
  })
  Object.entries(properties).forEach(([key, value]) => {
    if (seen.has(key)) return
    sorted.push([key, value])
    seen.add(key)
  })
  return sorted
}

const isScalarSchemaNode = (schemaNode) => {
  const normalizedNode = normalizeDetailSchemaNode(schemaNode)
  if (!normalizedNode) return true
  const type = normalizedNode?.type
  return type === 'string'
    || type === 'number'
    || type === 'integer'
    || type === 'boolean'
    || type === 'null'
}

export const inferSchemaKind = (schemaNode) => {
  const normalizedNode = normalizeDetailSchemaNode(schemaNode)
  if (!normalizedNode) return 'unknown'
  if (normalizedNode.type === 'object') return 'object'
  if (normalizedNode.type === 'array') return 'array'
  if (isScalarSchemaNode(normalizedNode)) return 'scalar'
  return 'unknown'
}

export const alignObjectBySchema = (schemaNode, rawObject) => {
  const aligned = {}
  getSchemaPropertyEntries(schemaNode).forEach(([fieldKey]) => {
    if (!isPlainObject(rawObject)) {
      aligned[fieldKey] = undefined
      return
    }

    const normalizedFieldKey = normalizeSlashPath(fieldKey)
    const entries = Object.entries(rawObject)
    const exactEntry = entries.find(([rawKey]) => normalizeSlashPath(rawKey) === normalizedFieldKey)
    const suffixCandidates = entries.filter(([rawKey]) => {
      return normalizeSlashPath(rawKey).endsWith(`/${normalizedFieldKey}`)
    })
    suffixCandidates.sort((a, b) => String(b[0]).length - String(a[0]).length)

    const directValue = rawObject?.[fieldKey]
    const preferredSuffixEntry = suffixCandidates.find((entry) => !isEmptyAlignedValue(unwrapFieldValue(entry[1])))
      || suffixCandidates[0]
    const candidateQueue = [
      exactEntry ? unwrapFieldValue(exactEntry[1]) : undefined,
      preferredSuffixEntry ? unwrapFieldValue(preferredSuffixEntry[1]) : undefined,
      directValue === undefined ? undefined : unwrapFieldValue(directValue),
    ]
    const preferred = candidateQueue.find((value) => value !== undefined && !isEmptyAlignedValue(value))
    aligned[fieldKey] = preferred !== undefined
      ? preferred
      : candidateQueue.find((value) => value !== undefined)
  })
  return aligned
}
