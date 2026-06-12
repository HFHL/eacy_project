import { getScopedFieldRawValue } from '../cellRenderers'
import { readFieldValueFromGroupFields } from './groupFieldReader'
import { getActiveGroupSourceFieldKeys } from './groupPathUtils'

const normalizeRowFields = (rawRecord) => {
  if (!rawRecord || typeof rawRecord !== 'object') return { value: rawRecord }
  const unwrapped = rawRecord.fields && typeof rawRecord.fields === 'object'
    ? rawRecord.fields
    : rawRecord
  if (!unwrapped || typeof unwrapped !== 'object') return { value: unwrapped }
  return Object.entries(unwrapped).reduce((acc, [fieldKey, fieldValue]) => {
    if (String(fieldKey).startsWith('__')) return acc
    acc[fieldKey] = fieldValue
    return acc
  }, {})
}

const isMeaningfulValue = (value) => {
  if (value === null || value === undefined || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  return true
}

export const buildGroupRecords = ({ activeGroup, groupNode, patient }) => {
  const isRepeatableGroup = Boolean(activeGroup?.groupRenderMeta?.isRepeatable)
  if (!isRepeatableGroup) return []
  if (!groupNode || typeof groupNode !== 'object') return []

  if (Array.isArray(groupNode.records) && groupNode.records.length > 0) {
    return groupNode.records.map((record) => normalizeRowFields(record))
  }

  const fields = groupNode.fields && typeof groupNode.fields === 'object' ? groupNode.fields : {}
  const activeFieldPaths = getActiveGroupSourceFieldKeys(activeGroup)
  if (activeFieldPaths.length === 0) return []

  let maxCount = 0
  let hasAnyValue = false
  const scopedFieldValues = {}

  activeFieldPaths.forEach((fieldPath) => {
    let candidateValue = readFieldValueFromGroupFields(fields, fieldPath, activeGroup)
    if (!isMeaningfulValue(candidateValue)) {
      candidateValue = getScopedFieldRawValue({
        ...patient,
        __resolvedGroupNode: groupNode,
        __groupMatchMeta: { groupNode },
        __groupRowIndex: 0,
        __groupRowCount: Math.max(1, maxCount || 1),
      }, activeGroup?.group_id, fieldPath, {
        groupName: activeGroup?.group_name,
        groupPathTokens: activeGroup?.groupPathTokens,
        strictPathOnly: true,
      })
    }

    scopedFieldValues[fieldPath] = candidateValue
    if (isMeaningfulValue(candidateValue)) hasAnyValue = true
    if (Array.isArray(candidateValue) && candidateValue.length > maxCount) {
      maxCount = candidateValue.length
    }
  })

  if (maxCount === 0 && hasAnyValue) maxCount = 1
  if (maxCount <= 0) return []

  return Array.from({ length: maxCount }, (_unused, index) => {
    const rowRecord = {}
    Object.entries(scopedFieldValues).forEach(([fieldPath, candidateValue]) => {
      rowRecord[fieldPath] = Array.isArray(candidateValue) ? (candidateValue[index] ?? null) : candidateValue
    })
    return rowRecord
  })
}

export const resolvePatientActiveGroupContext = ({ activeGroup, enableLegacyGroupFallback, patient, resolveActiveGroupMatch }) => {
  const groupMatch = resolveActiveGroupMatch({ activeGroup, enableLegacyGroupFallback, patient })
  const groupNode = groupMatch?.groupNode || null
  const groupRecords = buildGroupRecords({ activeGroup, groupNode, patient })
  const groupRowCount = Math.max(groupRecords.length || 0, 1)
  return {
    groupMatch,
    groupNode,
    groupRecords,
    groupRowCount,
  }
}
