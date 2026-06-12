import { getScopedFieldRawValue } from '../cellRenderers'

export const toDebugPreview = (value) => {
  try {
    const text = JSON.stringify(value)
    if (!text) return String(value)
    return text.length > 220 ? `${text.slice(0, 220)}...` : text
  } catch {
    return String(value)
  }
}

const getLongestCommonPrefixPath = (paths) => {
  const normalizedPaths = (Array.isArray(paths) ? paths : [])
    .map((path) => String(path || '').trim())
    .filter(Boolean)
  if (normalizedPaths.length === 0) return ''
  const splitPaths = normalizedPaths.map((path) => path.split('/').map((segment) => segment.trim()).filter(Boolean))
  const minLength = Math.min(...splitPaths.map((segments) => segments.length))
  const prefixSegments = []
  for (let index = 0; index < minLength; index += 1) {
    const segmentValue = splitPaths[0][index]
    if (!splitPaths.every((segments) => segments[index] === segmentValue)) break
    prefixSegments.push(segmentValue)
  }
  return prefixSegments.join('/')
}

const setNestedPayloadValue = (payload, pathSegments, value) => {
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
  if (lastSegment) cursor[lastSegment] = value
}

const resolveRelativeSegments = (fieldPath, prefixPath) => {
  const relativePath = prefixPath && fieldPath.startsWith(`${prefixPath}/`)
    ? fieldPath.slice(prefixPath.length + 1)
    : fieldPath
  return String(relativePath || '').split('/').map((segment) => segment.trim()).filter(Boolean)
}

const buildRowAlignedPayload = (valuesByField, fieldPaths, prefixPath) => {
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
      const scopedValue = Array.isArray(fieldValue) && fieldValue.length === rowCount
        ? (fieldValue[rowIndex] ?? null)
        : fieldValue
      setNestedPayloadValue(rowPayload, relativeSegments, scopedValue)
    })
  })
  return rows
}

export const buildColumnRawValue = ({ record, column, group, includeSource = false }) => {
  const readScopedValue = (fieldPath) => getScopedFieldRawValue(record, group?.group_id, fieldPath, {
    groupName: group?.group_name,
    groupPathTokens: group?.groupPathTokens,
    strictPathOnly: true,
    includeSource,
    includeDiagnostics: includeSource,
  })
  const sourceFieldKeys = Array.isArray(column?.sourceFieldKeys) && column.sourceFieldKeys.length > 0
    ? column.sourceFieldKeys
    : [column.key]
  const hasRepeatableRowContext = Boolean(
    (record?.__activeGroupRecord && typeof record.__activeGroupRecord === 'object')
    || Number(record?.__groupRowCount) > 1,
  )
  if (sourceFieldKeys.length === 1) return readScopedValue(sourceFieldKeys[0])

  const commonPrefixPath = getLongestCommonPrefixPath(sourceFieldKeys)
  const payload = {}
  let payloadSource = 'groupRecord'
  let payloadDiagnostics = null
  const valuesByField = {}
  sourceFieldKeys.forEach((fieldPath) => {
    const scopedResult = readScopedValue(fieldPath)
    const fieldValue = includeSource ? scopedResult?.value : scopedResult
    const fieldSource = includeSource ? scopedResult?.source : null
    valuesByField[fieldPath] = fieldValue
    if (fieldValue !== null && fieldValue !== undefined && fieldValue !== '') {
      const relativeSegments = resolveRelativeSegments(fieldPath, commonPrefixPath)
      if (relativeSegments.length > 0) setNestedPayloadValue(payload, relativeSegments, fieldValue)
      else payload[fieldPath] = fieldValue
    }
    if (includeSource && fieldSource && fieldSource !== 'groupRecord') payloadSource = fieldSource
    if (includeSource && scopedResult?.diagnostics) payloadDiagnostics = scopedResult.diagnostics
  })

  const rowAlignedPayload = buildRowAlignedPayload(valuesByField, sourceFieldKeys, commonPrefixPath)
  const finalValue = (hasRepeatableRowContext && rowAlignedPayload) ? rowAlignedPayload : payload
  if (includeSource) {
    return { value: finalValue, source: payloadSource, diagnostics: payloadDiagnostics }
  }
  return finalValue
}
