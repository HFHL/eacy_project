import { useMemo } from 'react'
import { ehrFieldGroupsConfig } from '../data/ehrFieldsConfig'

const clone = (value) => JSON.parse(JSON.stringify(value))

const hasValue = (value) => value !== null && value !== undefined && value !== ''

const getGroupStatus = (filled, total) => {
  if (total === 0) return 'incomplete'
  const ratio = filled / total
  if (ratio >= 1) return 'completed'
  if (ratio >= 0.5) return 'partial'
  return 'incomplete'
}

const countFilledFields = (groupData) => {
  if (!groupData) return { filled: 0, total: 0 }

  let filled = 0
  let total = 0

  if (groupData.fields && !groupData.repeatable) {
    groupData.fields.forEach(field => {
      total += 1
      if (field.fieldType === 'table_fields') {
        if (field.tableData && field.tableData.length > 0) filled += 1
      } else if (hasValue(field.value)) {
        filled += 1
      }
    })
  }

  if (groupData.repeatable) {
    const records = groupData.records || []
    records.forEach(record => {
      record.fields?.forEach(field => {
        total += 1
        if (hasValue(field.value)) filled += 1
      })
    })
  }

  return { filled, total }
}

const applyGroupCounts = ({ group, mergedEhrFieldsData, ehrData }) => {
  let groupFilled = 0
  let groupTotal = 0

  if (group.children) {
    group.children.forEach(child => {
      const { filled, total } = countFilledFields(mergedEhrFieldsData?.[child.key])

      if (total === 0 && !ehrData) {
        child.extractedCount = 0
      } else {
        child.extractedCount = filled
        child.fieldCount = total > 0 ? total : child.fieldCount
      }

      child.status = getGroupStatus(child.extractedCount, child.fieldCount)
      child.completeness = child.fieldCount > 0
        ? Math.round((child.extractedCount / child.fieldCount) * 100)
        : 0

      groupFilled += child.extractedCount
      groupTotal += child.fieldCount
    })
  } else {
    const { filled, total } = countFilledFields(mergedEhrFieldsData?.[group.key])
    if (total === 0 && !ehrData) {
      groupFilled = 0
      groupTotal = group.fieldCount
    } else {
      groupFilled = filled
      groupTotal = total > 0 ? total : group.fieldCount
    }
  }

  group.extractedCount = groupFilled
  group.fieldCount = groupTotal > 0 ? groupTotal : group.fieldCount
  group.status = getGroupStatus(group.extractedCount, group.fieldCount)
  group.completeness = group.fieldCount > 0
    ? Math.round((group.extractedCount / group.fieldCount) * 100)
    : 0
}

export const useEhrFieldGroupsData = ({ mergedEhrFieldsData, ehrData }) => (
  useMemo(() => {
    const groups = clone(ehrFieldGroupsConfig)

    groups.forEach(group => {
      applyGroupCounts({ group, mergedEhrFieldsData, ehrData })
    })

    return groups
  }, [mergedEhrFieldsData, ehrData])
)
