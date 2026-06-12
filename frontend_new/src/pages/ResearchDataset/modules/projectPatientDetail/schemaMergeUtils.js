import {
  cloneJsonValue,
  getSchemaNodeByParts,
  hasEffectiveValue,
  normalizeSchemaPath,
  readValueBySchema,
} from './crfPathUtils'

export function buildValueBySchema(existingValue, schemaNode, parts, value) {
  if (!schemaNode || typeof schemaNode !== 'object') return cloneJsonValue(value)
  if (parts.length === 0) return cloneJsonValue(value)

  if (schemaNode.type === 'array' && schemaNode.items) {
    const currentArray = Array.isArray(existingValue) ? [...existingValue] : []
    if (Array.isArray(value)) {
      value.forEach((itemValue, index) => {
        currentArray[index] = buildValueBySchema(currentArray[index], schemaNode.items, parts, itemValue)
      })
      return currentArray
    }
    currentArray[0] = buildValueBySchema(currentArray[0], schemaNode.items, parts, value)
    return currentArray
  }

  if (schemaNode.type === 'object' && schemaNode.properties) {
    const [head, ...rest] = parts
    const childSchema = schemaNode.properties?.[head]
    if (!childSchema) return existingValue && typeof existingValue === 'object' ? existingValue : {}
    const nextValue = existingValue && typeof existingValue === 'object' && !Array.isArray(existingValue)
      ? { ...existingValue }
      : {}
    nextValue[head] = buildValueBySchema(nextValue[head], childSchema, rest, value)
    return nextValue
  }

  return cloneJsonValue(value)
}

const normalizeGroupFieldPath = (raw) => String(raw || '')
  .normalize('NFKC')
  .replace(/\s*\/\s*/g, '/')
  .trim()

const readValueBySegments = (value, segments) => {
  if (segments.length === 0) return value
  if (value === null || value === undefined) return undefined
  const [head, ...rest] = segments
  if (Array.isArray(value)) {
    const mapped = value
      .map((item) => readValueBySegments(item, segments))
      .filter((item) => item !== undefined)
    return mapped.length > 0 ? mapped : undefined
  }
  if (typeof value === 'object') {
    return readValueBySegments(value?.[head], rest)
  }
  return undefined
}

export function readGroupFieldValueByPath(fields, fieldPath, groupName = '') {
  if (!fields || typeof fields !== 'object') return undefined
  const normalizedFieldPath = normalizeGroupFieldPath(fieldPath)
  const normalizedGroupName = normalizeGroupFieldPath(groupName)
  const pathSegments = normalizedFieldPath.split('/').filter(Boolean)
  const candidates = [normalizedFieldPath]
  if (normalizedGroupName && normalizedFieldPath.startsWith(`${normalizedGroupName}/`)) {
    candidates.push(normalizedFieldPath.slice(normalizedGroupName.length + 1))
  }
  if (pathSegments.length > 1) {
    candidates.push(pathSegments.slice(1).join('/'))
    for (let i = 2; i < pathSegments.length; i += 1) {
      candidates.push(pathSegments.slice(i).join('/'))
    }
  }

  const uniqueCandidates = [...new Set(candidates.filter(Boolean))]
  const fieldEntries = Object.entries(fields)
  for (const candidatePath of uniqueCandidates) {
    const directEntry = fieldEntries.find(([rawKey]) => normalizeGroupFieldPath(rawKey) === candidatePath)
    if (!directEntry) continue
    const rawFieldValue = directEntry[1]
    if (rawFieldValue && typeof rawFieldValue === 'object' && Object.prototype.hasOwnProperty.call(rawFieldValue, 'value')) {
      return rawFieldValue.value
    }
    return rawFieldValue
  }
  for (const candidatePath of uniqueCandidates) {
    const suffixMatches = fieldEntries.filter(([rawKey]) => {
      const normalizedRawKey = normalizeGroupFieldPath(rawKey)
      return candidatePath.endsWith(`/${normalizedRawKey}`) || normalizedRawKey.endsWith(`/${candidatePath}`)
    })
    if (suffixMatches.length === 0) continue
    suffixMatches.sort((a, b) => String(b[0]).length - String(a[0]).length)
    const rawFieldValue = suffixMatches[0][1]
    if (rawFieldValue && typeof rawFieldValue === 'object' && Object.prototype.hasOwnProperty.call(rawFieldValue, 'value')) {
      return rawFieldValue.value
    }
    return rawFieldValue
  }

  for (const candidatePath of uniqueCandidates) {
    const prefixMatches = fieldEntries
      .map(([rawKey, rawValue]) => ({ normalizedRawKey: normalizeGroupFieldPath(rawKey), rawValue }))
      .filter((entry) => entry.normalizedRawKey && candidatePath.startsWith(`${entry.normalizedRawKey}/`))
    if (prefixMatches.length === 0) continue
    prefixMatches.sort((a, b) => b.normalizedRawKey.length - a.normalizedRawKey.length)
    const bestMatch = prefixMatches[0]
    const baseValue = bestMatch.rawValue
      && typeof bestMatch.rawValue === 'object'
      && Object.prototype.hasOwnProperty.call(bestMatch.rawValue, 'value')
      ? bestMatch.rawValue.value
      : bestMatch.rawValue
    const restSegments = candidatePath.slice(bestMatch.normalizedRawKey.length + 1).split('/').filter(Boolean)
    const nestedValue = readValueBySegments(baseValue, restSegments)
    if (nestedValue !== undefined) return nestedValue
    for (let offset = 1; offset < restSegments.length; offset += 1) {
      const shiftedValue = readValueBySegments(baseValue, restSegments.slice(offset))
      if (shiftedValue !== undefined) return shiftedValue
    }
  }
  return undefined
}

const isSchemaValueCompatible = (schemaNode, value) => {
  if (!schemaNode || typeof schemaNode !== 'object') return true
  if (schemaNode.type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
  if (schemaNode.type === 'array') return Array.isArray(value)
  return true
}

const hasExistingRepeatableArrayAtOrAbove = (schemaRoot, data, parts) => {
  if (!schemaRoot || typeof schemaRoot !== 'object' || !Array.isArray(parts) || parts.length === 0) return false

  let schemaNode = schemaRoot
  let valueNode = data
  for (const part of parts) {
    if (!schemaNode || typeof schemaNode !== 'object') return false
    if (schemaNode.type === 'array') return Array.isArray(valueNode) && hasEffectiveValue(valueNode)
    if (schemaNode.type !== 'object' || !schemaNode.properties?.[part]) return false
    schemaNode = schemaNode.properties[part]
    valueNode = valueNode?.[part]
  }

  return schemaNode?.type === 'array' && Array.isArray(valueNode) && hasEffectiveValue(valueNode)
}

const resolveSchemaWriteParts = (schemaRoot, rawParts, groupName, value) => {
  if (!Array.isArray(rawParts) || rawParts.length === 0) return null
  const groupNameParts = normalizeSchemaPath(String(groupName || '').replace(/\s*\/\s*/g, '/'))
  const candidates = []
  const pushCandidate = (parts) => {
    const normalized = (Array.isArray(parts) ? parts : []).map((segment) => String(segment || '').trim()).filter(Boolean)
    if (normalized.length > 0) candidates.push(normalized)
  }

  pushCandidate(rawParts)
  if (groupNameParts.length > 0) {
    pushCandidate([...groupNameParts, ...rawParts])
    if (rawParts.length === 1 && groupNameParts[groupNameParts.length - 1] === rawParts[0]) {
      pushCandidate(groupNameParts)
    }
  }
  for (let i = 1; i < rawParts.length; i += 1) pushCandidate(rawParts.slice(i))

  const seen = new Set()
  for (const parts of candidates) {
    const key = parts.join('/')
    if (seen.has(key)) continue
    seen.add(key)
    const targetSchemaNode = getSchemaNodeByParts(schemaRoot, parts)
    if (targetSchemaNode && isSchemaValueCompatible(targetSchemaNode, value)) return parts
  }
  return null
}

export function mergeGroupValuesIntoDataByTemplate(baseData, schemaRoot, groups, templateGroups) {
  const nextData = cloneJsonValue(baseData) || {}
  if (!schemaRoot || typeof schemaRoot !== 'object') return nextData
  const safeGroups = groups && typeof groups === 'object' ? groups : {}
  const safeTemplateGroups = Array.isArray(templateGroups) ? templateGroups : []
  const consumedGroupIds = new Set()

  safeTemplateGroups.forEach((templateGroup) => {
    const groupId = String(templateGroup?.key || '')
    if (!groupId) return
    const groupNode = safeGroups?.[groupId]
    if (!groupNode || typeof groupNode !== 'object') return
    consumedGroupIds.add(groupId)
    const groupFields = groupNode?.fields && typeof groupNode.fields === 'object' ? groupNode.fields : {}

    Object.entries(groupFields).forEach(([rawFieldPath, rawFieldData]) => {
      if (String(rawFieldPath || '').startsWith('_') || rawFieldData?.value === undefined) return
      const resolvedParts = resolveSchemaWriteParts(schemaRoot, normalizeSchemaPath(rawFieldPath), templateGroup?.name || groupNode?.group_name || '', rawFieldData.value)
      if (!resolvedParts || hasExistingRepeatableArrayAtOrAbove(schemaRoot, nextData, resolvedParts)) return
      if (hasEffectiveValue(readValueBySchema(nextData, schemaRoot, resolvedParts))) return
      const mergedValue = buildValueBySchema(nextData, schemaRoot, resolvedParts, rawFieldData.value)
      if (mergedValue !== undefined) Object.assign(nextData, mergedValue)
    })

    const dbFields = Array.isArray(templateGroup?.dbFields) ? templateGroup.dbFields : []
    dbFields.forEach((dbFieldPath) => {
      const parts = normalizeSchemaPath(String(dbFieldPath || '').trim())
      if (parts.length === 0) return
      if (hasEffectiveValue(readValueBySchema(nextData, schemaRoot, parts))) return
      if (hasExistingRepeatableArrayAtOrAbove(schemaRoot, nextData, parts)) return
      const fieldValue = readGroupFieldValueByPath(groupFields, dbFieldPath, templateGroup?.name || groupNode?.group_name || '')
      if (fieldValue === undefined) return
      const mergedValue = buildValueBySchema(nextData, schemaRoot, parts, fieldValue)
      if (mergedValue !== undefined) Object.assign(nextData, mergedValue)
    })
  })

  Object.entries(safeGroups).forEach(([groupId, groupNode]) => {
    if (consumedGroupIds.has(groupId)) return
    const fields = groupNode?.fields && typeof groupNode.fields === 'object' ? groupNode.fields : {}
    Object.entries(fields).forEach(([fieldKey, fieldData]) => {
      if (String(fieldKey || '').startsWith('_') || fieldData?.value === undefined) return
      const resolvedParts = resolveSchemaWriteParts(schemaRoot, normalizeSchemaPath(fieldKey), groupNode?.group_name || '', fieldData.value)
      if (!resolvedParts || hasExistingRepeatableArrayAtOrAbove(schemaRoot, nextData, resolvedParts)) return
      const mergedValue = buildValueBySchema(nextData, schemaRoot, resolvedParts, fieldData.value)
      if (mergedValue !== undefined) Object.assign(nextData, mergedValue)
    })
  })

  return nextData
}
