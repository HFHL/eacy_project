import { getScopedFieldRawValue } from '../cellRenderers'
import {
  buildRowAlignedPayload,
  getLongestCommonPrefixPath,
  resolveRelativeSegments,
  setNestedPayloadValue,
} from './nestedPayloadUtils'

const hasDisplayValue = (value) => value !== null && value !== undefined && value !== ''

export const getGroupColumns = (group) => (
  Array.isArray(group?.columns) ? group.columns : []
)

export const isRepeatableGroup = (group) => (
  Boolean(group?.groupRenderMeta?.isRepeatable || group?.is_repeatable)
)

export const getColumnSourceFieldKeys = (column) => (
  Array.isArray(column?.sourceFieldKeys) && column.sourceFieldKeys.length > 0
    ? column.sourceFieldKeys
    : [column?.key]
)

const readScopedValue = ({ group, scopedRecord, includeSource }) => (fieldPath) => (
  getScopedFieldRawValue(scopedRecord, group.group_id, fieldPath, {
    groupName: group?.group_name,
    groupPathTokens: group?.groupPathTokens,
    strictPathOnly: true,
    includeSource,
    includeDiagnostics: includeSource,
  })
)

export const buildColumnRawValue = ({
  column,
  group,
  patient,
  scopedRecord = patient,
  includeSource = false,
}) => {
  const readValue = readScopedValue({ group, scopedRecord, includeSource })
  const sourceFieldKeys = getColumnSourceFieldKeys(column)
  const hasRepeatableRowContext = Boolean(
    (scopedRecord?.__activeGroupRecord && typeof scopedRecord.__activeGroupRecord === 'object')
    || Number(scopedRecord?.__groupRowCount) > 1
  )

  if (sourceFieldKeys.length === 1) {
    return readValue(sourceFieldKeys[0])
  }

  const commonPrefixPath = getLongestCommonPrefixPath(sourceFieldKeys)
  const payload = {}
  let payloadSource = 'groupRecord'
  let payloadDiagnostics = null
  const valuesByField = {}

  sourceFieldKeys.forEach((fieldPath) => {
    const scopedResult = readValue(fieldPath)
    const fieldValue = includeSource ? scopedResult?.value : scopedResult
    const fieldSource = includeSource ? scopedResult?.source : null
    const fieldDiagnostics = includeSource ? scopedResult?.diagnostics : null
    valuesByField[fieldPath] = fieldValue

    if (hasDisplayValue(fieldValue)) {
      const relativeSegments = resolveRelativeSegments(fieldPath, commonPrefixPath)
      if (relativeSegments.length > 0) {
        setNestedPayloadValue(payload, relativeSegments, fieldValue)
      } else {
        payload[fieldPath] = fieldValue
      }
    }

    if (includeSource && fieldSource && fieldSource !== 'groupRecord') {
      payloadSource = fieldSource
    }
    if (includeSource && fieldDiagnostics) payloadDiagnostics = fieldDiagnostics
  })

  const rowAlignedPayload = buildRowAlignedPayload(valuesByField, sourceFieldKeys, commonPrefixPath)
  const finalValue = (hasRepeatableRowContext && rowAlignedPayload) ? rowAlignedPayload : payload

  if (includeSource) {
    return {
      value: finalValue,
      source: payloadSource,
      diagnostics: payloadDiagnostics,
    }
  }

  return finalValue
}

const getGroupNodeRecords = (patient, group) => {
  const groupMap = patient?.crf_data?.groups && typeof patient.crf_data.groups === 'object'
    ? patient.crf_data.groups
    : {}
  const groupNode = groupMap?.[group?.group_id]
  return Array.isArray(groupNode?.records) ? groupNode.records : []
}

const normalizeGroupRecord = (record, groupId, index) => ({
  __rowKey: `${groupId}__record__${index}`,
  __rowFields: (
    record && typeof record === 'object'
      ? (record.fields && typeof record.fields === 'object' ? record.fields : record)
      : { value: record }
  ),
})

export const buildGroupRecords = ({ patient, group, groupColumns }) => {
  if (!isRepeatableGroup(group)) return []

  const groupNodeRecords = getGroupNodeRecords(patient, group)
  if (groupNodeRecords.length > 0) {
    return groupNodeRecords.map((record, index) => (
      normalizeGroupRecord(record, group.group_id, index)
    ))
  }

  const sourceValues = {}
  let maxCount = 0
  let hasAnyValue = false

  groupColumns.forEach((column) => {
    getColumnSourceFieldKeys(column).forEach((fieldPath) => {
      const fieldValue = getScopedFieldRawValue(patient, group.group_id, fieldPath, {
        groupName: group?.group_name,
        groupPathTokens: group?.groupPathTokens,
        strictPathOnly: true,
      })
      sourceValues[fieldPath] = fieldValue
      if (hasDisplayValue(fieldValue)) hasAnyValue = true
      if (Array.isArray(fieldValue) && fieldValue.length > maxCount) maxCount = fieldValue.length
    })
  })

  if (maxCount === 0 && hasAnyValue) maxCount = 1
  if (maxCount <= 0) return []

  return Array.from({ length: maxCount }, (_unused, index) => {
    const rowFields = {}
    Object.entries(sourceValues).forEach(([fieldPath, fieldValue]) => {
      rowFields[fieldPath] = Array.isArray(fieldValue) ? (fieldValue[index] ?? null) : fieldValue
    })
    return {
      __rowKey: `${group.group_id}__derived__${index}`,
      __rowFields: rowFields,
    }
  })
}
