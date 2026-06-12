import {
  extractCurrentValue,
  normalizeFieldPath,
} from './crfValue'

const isIndexedPathPart = (part) => /^\d+$/.test(String(part || ''))

const isSchemaArrayRecord = (schemaNode) => (
  schemaNode?.type === 'array' &&
  schemaNode.items?.properties &&
  typeof schemaNode.items.properties === 'object'
)

const isSchemaObject = (schemaNode) => (
  schemaNode?.properties &&
  typeof schemaNode.properties === 'object'
)

const setBySchemaPath = (target, schemaNode, parts, value) => {
  if (!parts.length) return

  if (isSchemaArrayRecord(schemaNode)) {
    const [firstPart, ...restParts] = parts
    const hasExplicitIndex = isIndexedPathPart(firstPart)
    const rowIndex = hasExplicitIndex ? Number(firstPart) : 0
    const nextParts = hasExplicitIndex ? restParts : parts

    while (target.length <= rowIndex) target.push({})
    if (target[rowIndex] == null || typeof target[rowIndex] !== 'object' || Array.isArray(target[rowIndex])) {
      target[rowIndex] = {}
    }
    // 行级 value：当 path 已经定位到某一行（如 `medications.0`），
    // 但没有继续给出叶子键时，value 通常是 value_json 整行对象。
    if (nextParts.length === 0) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(target[rowIndex], value)
      } else if (value !== undefined && value !== null) {
        target[rowIndex] = value
      }
      return
    }
    setBySchemaPath(target[rowIndex], schemaNode.items, nextParts, value)
    return
  }

  const [part, ...restParts] = parts
  const isLast = restParts.length === 0
  const childSchema = isSchemaObject(schemaNode) ? schemaNode.properties[part] : null

  if (isLast) {
    // 当 schema 期望可重复数组（array record），但后端把整组数据存成
    // value_json 的单个对象时，需要包一层数组，否则前端 SchemaForm 无法按行渲染。
    if (isSchemaArrayRecord(childSchema)) {
      if (Array.isArray(value)) {
        target[part] = value
      } else if (value && typeof value === 'object') {
        target[part] = [value]
      } else if (value === undefined || value === null) {
        target[part] = []
      } else {
        target[part] = value
      }
      return
    }
    target[part] = value
    return
  }

  if (isSchemaArrayRecord(childSchema)) {
    if (!Array.isArray(target[part])) target[part] = []
    setBySchemaPath(target[part], childSchema, restParts, value)
    return
  }

  if (target[part] == null || typeof target[part] !== 'object' || Array.isArray(target[part])) {
    target[part] = {}
  }
  setBySchemaPath(target[part], childSchema, restParts, value)
}

const setNestedValue = (target, path, value, schema = null) => {
  const parts = normalizeFieldPath(path).split('.').filter(Boolean)
  if (parts.length === 0) return
  setBySchemaPath(target, schema, parts, value)
}

const setRowRecordInstanceBySchemaPath = (target, schemaNode, parts, recordInstanceId) => {
  if (!recordInstanceId || !parts.length) return

  if (isSchemaArrayRecord(schemaNode)) {
    const [firstPart, ...restParts] = parts
    const hasExplicitIndex = isIndexedPathPart(firstPart)
    const rowIndex = hasExplicitIndex ? Number(firstPart) : 0
    const nextParts = hasExplicitIndex ? restParts : parts
    while (target.length <= rowIndex) target.push({})
    if (target[rowIndex] == null || typeof target[rowIndex] !== 'object' || Array.isArray(target[rowIndex])) {
      target[rowIndex] = {}
    }
    target[rowIndex]._record_instance_id = recordInstanceId
    target[rowIndex]._row_uid = target[rowIndex]._row_uid || recordInstanceId
    if (nextParts.length > 0) {
      setRowRecordInstanceBySchemaPath(target[rowIndex], schemaNode.items, nextParts, recordInstanceId)
    }
    return
  }

  const [part, ...restParts] = parts
  const childSchema = isSchemaObject(schemaNode) ? schemaNode.properties[part] : null
  if (isSchemaArrayRecord(childSchema)) {
    if (!Array.isArray(target[part])) target[part] = []
    setRowRecordInstanceBySchemaPath(target[part], childSchema, restParts, recordInstanceId)
    return
  }
  if (restParts.length === 0) return
  if (target[part] == null || typeof target[part] !== 'object' || Array.isArray(target[part])) {
    target[part] = {}
  }
  setRowRecordInstanceBySchemaPath(target[part], childSchema, restParts, recordInstanceId)
}

const setRowRecordInstanceByPath = (target, path, recordInstanceId, schema = null) => {
  const parts = normalizeFieldPath(path).split('.').filter(Boolean)
  if (parts.length === 0) return
  setRowRecordInstanceBySchemaPath(target, schema, parts, recordInstanceId)
}

export const currentValuesToData = (currentValues = {}, schema = null) => {
  const data = {}
  Object.entries(currentValues || {}).forEach(([fieldPath, current]) => {
    setNestedValue(data, fieldPath, extractCurrentValue(current), schema)
    setRowRecordInstanceByPath(data, fieldPath, current?.record_instance_id, schema)
  })
  return data
}

const collectSchemaLeafPaths = (schemaNode, pathSegments = []) => {
  if (!schemaNode || typeof schemaNode !== 'object') return []
  const target = isSchemaArrayRecord(schemaNode) ? schemaNode.items : schemaNode
  const props = target?.properties
  if (!props || typeof props !== 'object' || Array.isArray(props)) {
    return pathSegments.length > 0 ? [pathSegments.join('.')] : []
  }
  return Object.entries(props).flatMap(([key, child]) => (
    collectSchemaLeafPaths(child, [...pathSegments, key])
  ))
}

const canonicalDotPath = (dotPath) => (
  String(dotPath || '')
    .split('.')
    .filter((part) => part && !/^\d+$/.test(part))
    .join('.')
)

export const hasMeaningfulValue = (value) => {
  if (Array.isArray(value)) return value.length > 0
  if (value && typeof value === 'object') return Object.keys(value).length > 0
  return value !== null && value !== undefined && value !== ''
}

export const buildCrfGroupsFromSchema = (schema, currentValues = {}) => {
  if (!schema || typeof schema !== 'object') return {}
  const rootProps = schema.properties
  if (!rootProps || typeof rootProps !== 'object' || Array.isArray(rootProps)) return {}

  const filledByCanonical = {}
  const filledByPath = {}
  Object.entries(currentValues || {}).forEach(([fieldPath, current]) => {
    const normalizedPath = normalizeFieldPath(fieldPath)
    const canonical = canonicalDotPath(normalizedPath)
    if (!canonical) return
    const value = extractCurrentValue(current || {})
    filledByPath[normalizedPath] = value
    if (filledByCanonical[canonical] === undefined || hasMeaningfulValue(value)) {
      filledByCanonical[canonical] = value
    }
  })

  const buildRepeatableRecords = (pathSegments, leafDotPaths) => {
    const prefix = pathSegments.join('.')
    const leafSet = new Set(leafDotPaths.map((dotPath) => canonicalDotPath(dotPath)))
    const rows = {}

    Object.entries(filledByPath).forEach(([dotPath, value]) => {
      const parts = dotPath.split('.').filter(Boolean)
      if (parts.slice(0, pathSegments.length).join('.') !== prefix) return
      const restParts = parts.slice(pathSegments.length)
      const indexPart = restParts.find((part) => isIndexedPathPart(part))
      const rowIndex = indexPart == null ? 0 : Number(indexPart)
      const canonical = canonicalDotPath(dotPath)
      if (!leafSet.has(canonical)) return

      const row = rows[rowIndex] || {
        id: `${prefix}.${rowIndex}`,
        repeat_index: rowIndex,
        fields: {},
      }
      row.fields[canonical.split('.').filter(Boolean).join('/')] = { value }
      rows[rowIndex] = row
    })

    return Object.keys(rows)
      .map((index) => rows[index])
      .sort((a, b) => Number(a.repeat_index || 0) - Number(b.repeat_index || 0))
  }

  const buildGroupEntry = (groupSchema, groupId, groupName, pathSegments) => {
    const leafDotPaths = collectSchemaLeafPaths(groupSchema, pathSegments)
    const fields = {}
    leafDotPaths.forEach((dotPath) => {
      const canonical = canonicalDotPath(dotPath)
      const slashKey = dotPath.split('.').filter(Boolean).join('/')
      const value = filledByCanonical[canonical]
      fields[slashKey] = { value: value === undefined ? null : value }
    })
    return {
      group_id: groupId,
      group_name: groupName,
      is_repeatable: groupSchema?.type === 'array',
      fields,
      records: groupSchema?.type === 'array' ? buildRepeatableRecords(pathSegments, leafDotPaths) : [],
    }
  }

  const groups = {}
  Object.entries(rootProps).forEach(([folderKey, folderSchema]) => {
    if (!folderSchema || typeof folderSchema !== 'object' || Array.isArray(folderSchema)) return
    const folderInner = isSchemaArrayRecord(folderSchema) ? folderSchema.items : folderSchema
    const folderChildren = folderInner?.properties
    if (folderChildren && typeof folderChildren === 'object' && !Array.isArray(folderChildren)) {
      const hasNestedGroups = Object.values(folderChildren).some((child) => (
        (child?.properties && typeof child.properties === 'object')
        || (child?.type === 'array' && child?.items?.properties)
      ))
      if (hasNestedGroups) {
        Object.entries(folderChildren).forEach(([groupKey, groupSchema]) => {
          if (!groupSchema || typeof groupSchema !== 'object' || Array.isArray(groupSchema)) return
          const groupId = `${folderKey}/${groupKey}`
          const groupName = `${folderSchema.title || folderKey} / ${groupSchema.title || groupKey}`
          groups[groupId] = buildGroupEntry(groupSchema, groupId, groupName, [folderKey, groupKey])
        })
        return
      }
    }
    groups[folderKey] = buildGroupEntry(folderSchema, folderKey, folderSchema.title || folderKey, [folderKey])
  })

  return groups
}

export const computeOverallCompletenessFromGroups = (groups) => {
  let totalFields = 0
  let filledFields = 0
  Object.values(groups || {}).forEach((group) => {
    const fields = group?.fields && typeof group.fields === 'object' ? group.fields : {}
    Object.values(fields).forEach((field) => {
      totalFields += 1
      if (hasMeaningfulValue(field?.value)) filledFields += 1
    })
  })
  return totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0
}
