import {
  normalizePathKey,
  toAuditPath,
  toAuditPathWithoutIndex,
} from './pathUtils'

const buildNormalizedMaps = (fieldMaps) => fieldMaps.map((fields) => {
  const map = new Map()
  for (const [key, value] of Object.entries(fields)) {
    if (value && typeof value === 'object') {
      map.set(normalizePathKey(key), value)
    }
  }
  return map
})

const findPathOverlapMatch = ({ basePathWithoutIndex, markIfNeeded, normalizedMaps }) => {
  const normBase = normalizePathKey(basePathWithoutIndex)
  const baseParts = normBase.split('/')
  let bestMatch = null

  for (const normalizedMap of normalizedMaps) {
    for (const [normKey, value] of normalizedMap.entries()) {
      if (!normKey) continue
      if (normKey.startsWith(`${normBase}/`) || normBase.endsWith(`/${normKey}`) || normBase === normKey) {
        if (!bestMatch || (value.document_id && value.bbox)) bestMatch = value
        if (bestMatch.document_id && bestMatch.bbox) return markIfNeeded(bestMatch, true)
        continue
      }
      for (let index = 1; index < baseParts.length; index++) {
        const suffix = baseParts.slice(index).join('/')
        if (normKey === suffix || normKey.startsWith(`${suffix}/`)) {
          if (!bestMatch || (value.document_id && value.bbox)) bestMatch = value
          break
        }
      }
    }
  }
  return bestMatch ? markIfNeeded(bestMatch, true) : null
}

const findFieldNameSuffixMatch = ({ dotPath, markIfNeeded, normalizedMaps }) => {
  const segments = dotPath.split('.').filter((part) => !/^\d+$/.test(part))
  const fieldName = segments[segments.length - 1]
  if (!fieldName) return null

  const suffix = `/${fieldName}`
  for (const normalizedMap of normalizedMaps) {
    for (const [normKey, value] of normalizedMap.entries()) {
      if (normKey.endsWith(suffix) && (value.bbox || value.raw || value.value)) {
        return markIfNeeded(value, true)
      }
    }
  }
  return null
}

const findSiblingMatch = ({ basePathWithoutIndex, markIfNeeded, normalizedMaps }) => {
  const normBase = normalizePathKey(basePathWithoutIndex)
  const parentPath = normBase.includes('/') ? normBase.substring(0, normBase.lastIndexOf('/')) : ''
  if (!parentPath) return null

  const parentPrefix = `${parentPath}/`
  let siblingMatch = null
  for (const normalizedMap of normalizedMaps) {
    for (const [normKey, value] of normalizedMap.entries()) {
      if (!normKey) continue
      if (normKey.startsWith(parentPrefix) && !normKey.substring(parentPrefix.length).includes('/')) {
        if (!siblingMatch || (value.document_id && value.bbox)) siblingMatch = value
        if (siblingMatch.document_id && siblingMatch.bbox) return markIfNeeded(siblingMatch, true)
      }
    }
  }
  if (siblingMatch) return markIfNeeded(siblingMatch, true)

  const parentParts = parentPath.split('/')
  for (const normalizedMap of normalizedMaps) {
    for (const [normKey, value] of normalizedMap.entries()) {
      if (!normKey) continue
      const keyParent = normKey.includes('/') ? normKey.substring(0, normKey.lastIndexOf('/')) : ''
      if (!keyParent) continue
      for (let index = 1; index < parentParts.length; index++) {
        const suffix = parentParts.slice(index).join('/')
        if (keyParent === suffix || keyParent.endsWith(`/${suffix}`) || suffix.endsWith(`/${keyParent}`)) {
          if (!siblingMatch || (value.document_id && value.bbox)) siblingMatch = value
          break
        }
      }
    }
  }
  return siblingMatch ? markIfNeeded(siblingMatch, true) : null
}

export function resolveFieldAudit(fieldMaps, dotPath) {
  if (!dotPath) return null
  const maps = Array.isArray(fieldMaps) ? fieldMaps : (fieldMaps ? [fieldMaps] : [])
  if (maps.length === 0) return null

  const pathHasIndex = /\.\d+(\.|$)/.test(dotPath)
  const markIfNeeded = (value, fuzzy = false) => {
    if (!value || typeof value !== 'object') return value
    const flags = {}
    if (pathHasIndex) flags._index_stripped = true
    if (fuzzy) flags._fuzzy_match = true
    return Object.keys(flags).length === 0 ? value : { ...value, ...flags }
  }

  const normalizedMaps = buildNormalizedMaps(maps)
  const pathVariants = [toAuditPath(dotPath), toAuditPathWithoutIndex(dotPath)]

  for (let variantIndex = 0; variantIndex < pathVariants.length; variantIndex++) {
    const auditPath = pathVariants[variantIndex]
    if (!auditPath) continue
    const normPath = normalizePathKey(auditPath)
    const isStripped = variantIndex > 0
    for (const fields of maps) {
      const direct = fields[auditPath]
      if (direct && typeof direct === 'object') return isStripped ? markIfNeeded(direct) : direct
    }
    for (const normalizedMap of normalizedMaps) {
      const hit = normalizedMap.get(normPath)
      if (hit) return isStripped ? markIfNeeded(hit) : hit
    }
  }

  const basePathWithoutIndex = toAuditPathWithoutIndex(dotPath)
  if (basePathWithoutIndex) {
    const overlapMatch = findPathOverlapMatch({ basePathWithoutIndex, markIfNeeded, normalizedMaps })
    if (overlapMatch) return overlapMatch
  }

  const suffixMatch = findFieldNameSuffixMatch({ dotPath, markIfNeeded, normalizedMaps })
  if (suffixMatch) return suffixMatch

  if (basePathWithoutIndex) {
    const siblingMatch = findSiblingMatch({ basePathWithoutIndex, markIfNeeded, normalizedMaps })
    if (siblingMatch) return siblingMatch
  }

  return null
}
