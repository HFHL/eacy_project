export const getCurrentValuePayload = (currentValue = {}) => {
  if (currentValue.value_json !== undefined && currentValue.value_json !== null) return currentValue.value_json
  if (currentValue.value_number !== undefined && currentValue.value_number !== null) return Number(currentValue.value_number)
  if (currentValue.value_date !== undefined && currentValue.value_date !== null) return currentValue.value_date
  if (currentValue.value_datetime !== undefined && currentValue.value_datetime !== null) return currentValue.value_datetime
  if (currentValue.value_text !== undefined && currentValue.value_text !== null) return currentValue.value_text
  return ''
}

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
    // 行级 value：path 定位到某一行但没有继续给出叶子键时，value 通常是 value_json 整行对象。
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

const setByDotPath = (target, path, value, schema = null) => {
  const parts = String(path || '').split('.').filter(Boolean)
  if (!parts.length) return
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

const setRowRecordInstanceByDotPath = (target, path, recordInstanceId, schema = null) => {
  const parts = String(path || '').split('.').filter(Boolean)
  if (!parts.length) return
  setRowRecordInstanceBySchemaPath(target, schema, parts, recordInstanceId)
}

export const normalizeEhrResponse = (payload = {}) => {
  const currentValues = payload.current_values && typeof payload.current_values === 'object'
    ? payload.current_values
    : {}
  const data = {}

  Object.entries(currentValues).forEach(([fieldPath, currentValue]) => {
    setByDotPath(data, fieldPath, getCurrentValuePayload(currentValue), payload.schema)
    setRowRecordInstanceByDotPath(data, fieldPath, currentValue?.record_instance_id, payload.schema)
  })

  return {
    context: payload.context || null,
    schema: payload.schema || null,
    records: Array.isArray(payload.records) ? payload.records : [],
    current_values: currentValues,
    data,
  }
}
