import { normalizeSlashPath } from './groupPathUtils'

const readValueBySegments = (rootValue, segments) => {
  if (!Array.isArray(segments) || segments.length === 0) {
    if (rootValue && typeof rootValue === 'object' && Object.prototype.hasOwnProperty.call(rootValue, 'value')) {
      return rootValue.value
    }
    return rootValue
  }

  if (Array.isArray(rootValue)) {
    const mapped = rootValue.map((item) => readValueBySegments(item, segments))
    const hasAny = mapped.some((item) => item !== null && item !== undefined)
    return hasAny ? mapped : undefined
  }

  if (!rootValue || typeof rootValue !== 'object') return undefined
  const [head, ...rest] = segments
  if (!Object.prototype.hasOwnProperty.call(rootValue, head)) return undefined
  return readValueBySegments(rootValue[head], rest)
}

export const readFieldValueFromGroupFields = (fields, fieldPath, activeGroup) => {
  if (!fields || typeof fields !== 'object') return null

  const normalizedFieldPath = normalizeSlashPath(fieldPath)
  const pathSegments = normalizedFieldPath.split('/').filter(Boolean)
  const pathCandidates = [normalizedFieldPath]
  const normalizedGroupName = normalizeSlashPath(activeGroup?.group_name || '')

  if (normalizedGroupName && normalizedFieldPath.startsWith(`${normalizedGroupName}/`)) {
    pathCandidates.push(normalizedFieldPath.slice(normalizedGroupName.length + 1))
  }
  if (pathSegments.length > 1) {
    pathCandidates.push(pathSegments.slice(1).join('/'))
  }

  const fieldEntries = Object.entries(fields)
  for (const pathKey of pathCandidates) {
    const directEntry = fieldEntries.find(([key]) => normalizeSlashPath(key) === pathKey)
    if (!directEntry) continue
    const rawFieldItem = directEntry[1]
    if (rawFieldItem && typeof rawFieldItem === 'object' && Object.prototype.hasOwnProperty.call(rawFieldItem, 'value')) {
      return rawFieldItem.value
    }
    return rawFieldItem
  }

  for (const pathKey of pathCandidates) {
    const suffixMatches = fieldEntries.filter(([rawKey]) => {
      const normalizedRawKey = normalizeSlashPath(rawKey)
      return pathKey.endsWith(`/${normalizedRawKey}`) || normalizedRawKey.endsWith(`/${pathKey}`)
    })
    if (suffixMatches.length === 0) continue
    suffixMatches.sort((a, b) => String(b[0]).length - String(a[0]).length)
    const rawFieldItem = suffixMatches[0][1]
    if (rawFieldItem && typeof rawFieldItem === 'object' && Object.prototype.hasOwnProperty.call(rawFieldItem, 'value')) {
      return rawFieldItem.value
    }
    return rawFieldItem
  }

  for (const pathKey of pathCandidates) {
    const prefixMatches = fieldEntries
      .map(([rawKey, rawValue]) => ({
        rawKey,
        rawValue,
        normalizedRawKey: normalizeSlashPath(rawKey),
      }))
      .filter((entry) => entry.normalizedRawKey && pathKey.startsWith(`${entry.normalizedRawKey}/`))
    if (prefixMatches.length === 0) continue
    prefixMatches.sort((a, b) => b.normalizedRawKey.length - a.normalizedRawKey.length)
    const bestMatch = prefixMatches[0]
    const baseValue = bestMatch.rawValue && typeof bestMatch.rawValue === 'object' && Object.prototype.hasOwnProperty.call(bestMatch.rawValue, 'value')
      ? bestMatch.rawValue.value
      : bestMatch.rawValue
    const restPath = pathKey.slice(bestMatch.normalizedRawKey.length + 1)
    const nestedValue = readValueBySegments(baseValue, restPath.split('/').filter(Boolean))
    if (nestedValue !== null && nestedValue !== undefined) return nestedValue
  }

  for (const pathKey of pathCandidates) {
    const segments = pathKey.split('/').filter(Boolean)
    let cursor = fields
    let matched = true
    for (const segment of segments) {
      if (cursor && typeof cursor === 'object' && Object.prototype.hasOwnProperty.call(cursor, segment)) {
        cursor = cursor[segment]
      } else {
        matched = false
        break
      }
    }
    if (!matched) continue
    if (cursor && typeof cursor === 'object' && Object.prototype.hasOwnProperty.call(cursor, 'value')) {
      return cursor.value
    }
    return cursor
  }

  return null
}
