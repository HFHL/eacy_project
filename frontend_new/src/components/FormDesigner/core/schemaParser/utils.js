import { DISPLAY_TYPES } from '../constants.js'

export const orderedPropertyEntries = (properties, parentNode) => {
  if (!properties || typeof properties !== 'object') return []
  const order = parentNode && parentNode['x-property-order']
  if (!Array.isArray(order) || order.length === 0) {
    return Object.entries(properties)
  }

  const seen = new Set()
  const out = []
  for (const key of order) {
    if (Object.prototype.hasOwnProperty.call(properties, key) && !seen.has(key)) {
      out.push([key, properties[key]])
      seen.add(key)
    }
  }
  for (const key of Object.keys(properties)) {
    if (!seen.has(key)) {
      out.push([key, properties[key]])
      seen.add(key)
    }
  }
  return out
}

export const generateId = (prefix) => (
  `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
)

export const inferOptionsId = (schema) => {
  const ref = schema?.allOf?.[0]?.$ref
  if (typeof ref === 'string') {
    const match = ref.match(/^#\/\$defs\/(.+)$/)
    if (match && match[1]) return match[1]
  }
  const itemRef = schema?.items?.allOf?.[0]?.$ref
  if (typeof itemRef === 'string') {
    const match = itemRef.match(/^#\/\$defs\/(.+)$/)
    if (match && match[1]) return match[1]
  }
  return null
}

export const inferDisplayType = (schema) => {
  if (schema.enum) return DISPLAY_TYPES.SELECT
  if (schema.allOf && schema.allOf[0]?.$ref) return DISPLAY_TYPES.SELECT
  if (schema.format === 'date-time') return DISPLAY_TYPES.DATETIME
  if (schema.format === 'date') return DISPLAY_TYPES.DATE
  if (schema.type === 'number') return DISPLAY_TYPES.NUMBER
  if (schema.type === 'array') return DISPLAY_TYPES.CHECKBOX
  if (schema['x-display']) return schema['x-display']
  return DISPLAY_TYPES.TEXT
}

export const inferDataType = (displayType) => {
  const typeMap = {
    [DISPLAY_TYPES.NUMBER]: 'number',
    [DISPLAY_TYPES.CHECKBOX]: 'boolean',
    [DISPLAY_TYPES.MULTISELECT]: 'array',
    [DISPLAY_TYPES.DATE]: 'string',
    [DISPLAY_TYPES.DATETIME]: 'string',
  }
  return typeMap[displayType] || 'string'
}

const getEnumValuesFromRef = (ref, enums) => {
  if (typeof ref !== 'string') return null
  const match = ref.match(/^#\/\$defs\/(.+)$/)
  const enumId = match && match[1] ? match[1] : null
  if (enumId && enums?.[enumId] && Array.isArray(enums[enumId].values)) {
    return [...enums[enumId].values]
  }
  return null
}

export const parseOptions = (schema, enums = {}) => {
  if (schema.enum) return [...schema.enum]
  if (schema.type === 'array' && schema.items?.enum) return [...schema.items.enum]
  if (schema.allOf && schema.allOf[0]?.$ref) {
    return getEnumValuesFromRef(schema.allOf[0].$ref, enums)
  }
  if (schema.type === 'array' && schema.items?.allOf?.[0]?.$ref) {
    return getEnumValuesFromRef(schema.items.allOf[0].$ref, enums)
  }
  return null
}

export const parseEnums = (schema) => {
  const enums = {}
  if (schema.$defs) {
    for (const [enumId, enumDef] of Object.entries(schema.$defs)) {
      if (enumDef.enum) {
        enums[enumId] = {
          id: enumId,
          type: enumDef.type || 'string',
          values: [...enumDef.enum],
        }
      }
    }
  }
  return enums
}

export const parseExtendedConfig = (schema) => {
  if (!schema['x-extended-config']) return null
  try {
    return typeof schema['x-extended-config'] === 'string'
      ? JSON.parse(schema['x-extended-config'])
      : schema['x-extended-config']
  } catch (error) {
    console.error('Failed to parse extended config:', error)
    return null
  }
}

export const parseTableRows = (schema) => {
  const config = parseExtendedConfig(schema)
  if (config?.tableRows) return config.tableRows
  if (schema?.['x-row-constraint'] === 'multi_row') return 'multiRow'
  if (schema?.['x-row-constraint'] === 'single_row') return 'singleRow'
  if (schema?.['x-table-config']?.multiRow === true) return 'multiRow'
  if (schema?.['x-table-config']?.multiRow === false) return 'singleRow'
  if (schema.type === 'array') return 'multiRow'
  return 'singleRow'
}

export const parseExtractionUnit = (schemaNode) => {
  if (typeof schemaNode?.['x-is-extraction-unit'] === 'boolean') {
    return schemaNode['x-is-extraction-unit']
  }
  const primary = schemaNode?.['x-sources']?.primary
  const secondary = schemaNode?.['x-sources']?.secondary
  return (Array.isArray(primary) && primary.length > 0) ||
    (Array.isArray(secondary) && secondary.length > 0)
}
