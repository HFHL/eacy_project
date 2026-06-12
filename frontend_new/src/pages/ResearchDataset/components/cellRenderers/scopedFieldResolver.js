import {
  buildFieldPathCandidates,
  isEmptyValue,
  normalizeSlashPath,
  readFromFieldsWithDiagnostics,
} from './fieldPathUtils'
import { getFieldRawValue } from './legacyFieldReader'

const normalizeGroupRecordFields = (recordValue) => {
  if (!recordValue || typeof recordValue !== 'object') return null
  const wrappedFields = recordValue.fields && typeof recordValue.fields === 'object'
    ? recordValue.fields
    : null
  if (wrappedFields) return wrappedFields
  if (recordValue.__rowFields && typeof recordValue.__rowFields === 'object') return recordValue.__rowFields
  return recordValue
}

const resolveRowIndexContext = (record) => {
  const rowIndex = Number.isFinite(record?.__groupRowIndex) ? Number(record.__groupRowIndex) : 0
  const rowCount = Number.isFinite(record?.__groupRowCount) ? Number(record.__groupRowCount) : 0
  const canIndex = Number.isFinite(record?.__groupRowIndex)
    && (
      Boolean(record?.__activeGroupRecord && typeof record.__activeGroupRecord === 'object')
      || rowCount > 1
    )
  return { rowIndex, rowCount, canIndex }
}

const shouldSliceByRowDimension = (value, rowContext) => {
  if (!Array.isArray(value) || !rowContext?.canIndex) return false
  if (!Number.isFinite(rowContext.rowCount) || rowContext.rowCount <= 0) return false
  return value.length === rowContext.rowCount
}

const buildResolvedValue = ({ value, source, rowContext, candidatePaths, extras = {} }) => ({
  value,
  source,
  diagnostics: {
    source,
    matchedPath: extras?.matchedPath || '',
    fallbackUsed: Boolean(extras?.fallbackUsed),
    fallbackStage: extras?.fallbackStage || 'none',
    rowIndex: rowContext.rowIndex,
    groupRowCount: rowContext.rowCount,
    candidatePaths,
  },
})

const buildHitResult = ({ hit, source, rowContext, candidatePaths, allowRowSlice = false }) => {
  if (allowRowSlice && Array.isArray(hit.value) && shouldSliceByRowDimension(hit.value, rowContext)) {
    return buildResolvedValue({
      value: hit.value[rowContext.rowIndex] ?? null,
      source: 'patientArray',
      rowContext,
      candidatePaths,
      extras: {
        matchedPath: hit.matchedPath,
        fallbackUsed: true,
        fallbackStage: `${hit.stage}-row-slice`,
      },
    })
  }
  return buildResolvedValue({
    value: hit.value,
    source,
    rowContext,
    candidatePaths,
    extras: {
      matchedPath: hit.matchedPath,
      fallbackUsed: hit.stage !== 'exact',
      fallbackStage: hit.stage,
    },
  })
}

export const resolveFieldValue = (context, fieldPath) => {
  const record = context?.record || {}
  const groupId = context?.groupId
  const options = context?.options || {}
  const candidatePaths = buildFieldPathCandidates(fieldPath, options?.groupName || '')
  const rowContext = resolveRowIndexContext(record)

  const activeRowFields = normalizeGroupRecordFields(record?.__activeGroupRecord)
  const rowHit = readFromFieldsWithDiagnostics(activeRowFields, candidatePaths)
  if (rowHit) {
    return buildHitResult({ hit: rowHit, source: 'groupRecord', rowContext, candidatePaths })
  }

  const resolvedGroupNode = record?.__resolvedGroupNode || record?.__groupMatchMeta?.groupNode
  const groupHit = readFromFieldsWithDiagnostics(resolvedGroupNode?.fields, candidatePaths)
  if (groupHit) {
    return buildHitResult({
      hit: groupHit,
      source: 'groupFields',
      rowContext,
      candidatePaths,
      allowRowSlice: true,
    })
  }

  const fallbackValue = getFieldRawValue(record, groupId, fieldPath, options)
  if (!isEmptyValue(fallbackValue)) {
    if (Array.isArray(fallbackValue) && shouldSliceByRowDimension(fallbackValue, rowContext)) {
      return buildResolvedValue({
        value: fallbackValue[rowContext.rowIndex] ?? null,
        source: 'patientArray',
        rowContext,
        candidatePaths,
        extras: {
          matchedPath: candidatePaths[0] || normalizeSlashPath(fieldPath),
          fallbackUsed: true,
          fallbackStage: 'patient-row-slice',
        },
      })
    }
    return buildResolvedValue({
      value: fallbackValue,
      source: 'patientScalar',
      rowContext,
      candidatePaths,
      extras: {
        matchedPath: candidatePaths[0] || normalizeSlashPath(fieldPath),
        fallbackUsed: true,
        fallbackStage: 'patient-fallback',
      },
    })
  }

  return buildResolvedValue({
    value: null,
    source: 'empty',
    rowContext,
    candidatePaths,
    extras: {
      matchedPath: candidatePaths[0] || normalizeSlashPath(fieldPath),
      fallbackUsed: true,
      fallbackStage: 'miss',
    },
  })
}

export const getScopedFieldRawValue = (record, groupId, fieldKey, options = {}) => {
  const resolved = resolveFieldValue({ record, groupId, options }, fieldKey)
  if (options?.includeSource === true) {
    if (options?.includeDiagnostics === true) {
      return {
        value: resolved.value,
        source: resolved.source,
        diagnostics: resolved.diagnostics,
      }
    }
    return {
      value: resolved.value,
      source: resolved.source,
    }
  }
  return resolved.value
}
