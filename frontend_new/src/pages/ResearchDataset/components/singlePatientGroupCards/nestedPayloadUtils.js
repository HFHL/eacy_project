export const getLongestCommonPrefixPath = (paths) => {
  const normalizedPaths = (Array.isArray(paths) ? paths : [])
    .map((path) => String(path || '').trim())
    .filter(Boolean)

  if (normalizedPaths.length === 0) return ''

  const splitPaths = normalizedPaths.map((path) => (
    path.split('/').map((segment) => segment.trim()).filter(Boolean)
  ))
  const minLength = Math.min(...splitPaths.map((segments) => segments.length))
  const prefixSegments = []

  for (let index = 0; index < minLength; index += 1) {
    const segmentValue = splitPaths[0][index]
    const allMatched = splitPaths.every((segments) => segments[index] === segmentValue)
    if (!allMatched) break
    prefixSegments.push(segmentValue)
  }

  return prefixSegments.join('/')
}

export const setNestedPayloadValue = (payload, pathSegments, value) => {
  if (!payload || typeof payload !== 'object') return
  if (!Array.isArray(pathSegments) || pathSegments.length === 0) return

  let cursor = payload
  for (let index = 0; index < pathSegments.length - 1; index += 1) {
    const segment = pathSegments[index]
    if (!segment) continue

    if (!cursor[segment] || typeof cursor[segment] !== 'object' || Array.isArray(cursor[segment])) {
      cursor[segment] = {}
    }
    cursor = cursor[segment]
  }

  const lastSegment = pathSegments[pathSegments.length - 1]
  if (!lastSegment) return
  cursor[lastSegment] = value
}

export const resolveRelativeSegments = (fieldPath, prefixPath) => {
  const relativePath = prefixPath && fieldPath.startsWith(`${prefixPath}/`)
    ? fieldPath.slice(prefixPath.length + 1)
    : fieldPath

  return String(relativePath || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
}

export const buildRowAlignedPayload = (valuesByField, fieldPaths, prefixPath) => {
  const rowLengths = fieldPaths
    .map((fieldPath) => valuesByField[fieldPath])
    .filter((value) => Array.isArray(value))
    .map((arrayValue) => arrayValue.length)
    .filter((length) => Number.isFinite(length) && length > 0)

  if (rowLengths.length === 0) return null

  const rowCount = Math.max(...rowLengths)
  if (!Number.isFinite(rowCount) || rowCount <= 0) return null

  const rows = Array.from({ length: rowCount }, () => ({}))
  fieldPaths.forEach((fieldPath) => {
    const fieldValue = valuesByField[fieldPath]
    const relativeSegments = resolveRelativeSegments(fieldPath, prefixPath)
    if (relativeSegments.length === 0) return

    rows.forEach((rowPayload, rowIndex) => {
      // 仅切与外层同维的数组，避免误切内层子表数组。
      const scopedValue = Array.isArray(fieldValue) && fieldValue.length === rowCount
        ? (fieldValue[rowIndex] ?? null)
        : fieldValue
      setNestedPayloadValue(rowPayload, relativeSegments, scopedValue)
    })
  })

  return rows
}
