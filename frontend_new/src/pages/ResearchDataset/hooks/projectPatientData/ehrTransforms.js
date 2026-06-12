import { hasEffectiveValue } from '@/utils/valuePresence'

const findMatchingField = (fields, fieldName) => {
  const entry = Object.entries(fields).find(([key]) => key.endsWith(`/${fieldName}`))
  return {
    entry,
    field: entry ? entry[1] : null,
  }
}

const mapRecordField = (groupKey, fields, index, fieldName, value) => {
  const { entry, field } = findMatchingField(fields, fieldName)

  return {
    id: `${groupKey}_${index}_${fieldName}`,
    apiFieldId: entry ? entry[0] : fieldName,
    name: fieldName,
    value,
    source: field?.source || 'document',
    confidence: field?.confidence,
    type: field?.type || 'text',
    fieldType: 'fields',
    document_id: field?.document_id,
    document_type: field?.document_type,
    raw: field?.raw,
    bbox: field?.bbox,
    page_idx: field?.page_idx,
  }
}

const buildRepeatableRecords = (groupKey, fields, arrayField) => (
  arrayField.value.map((recordObj, index) => ({
    id: `${groupKey}_record_${index}`,
    fields: Object.entries(recordObj).map(([fieldName, value]) => (
      mapRecordField(groupKey, fields, index, fieldName, value)
    )),
  }))
)

const mapFlatField = (fieldKey, field, fieldMapping) => ({
  id: fieldKey,
  apiFieldId: fieldKey,
  name: fieldMapping[fieldKey] || field.field_name || fieldKey.split('/').slice(-1)[0],
  value: field.value,
  source: field.source,
  confidence: field.confidence,
  type: field.type || 'text',
  document_id: field.document_id,
  document_type: field.document_type,
  raw: field.raw,
  bbox: field.bbox,
  page_idx: field.page_idx,
})

const getFilledFieldCount = (fields) => (
  Object.values(fields).filter((field) => hasEffectiveValue(field?.value)).length
)

const getGroupStatus = (completeness) => {
  if (completeness >= 90) return 'completed'
  if (completeness > 0) return 'partial'
  return 'pending'
}

const mapGroupSummary = ({ key, name, fields, totalFields, isRepeatable }) => {
  const filledFields = getFilledFieldCount(fields)
  const completeness = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0

  return {
    key,
    name,
    status: getGroupStatus(completeness),
    completeness,
    isRepeatable,
    fieldCount: totalFields,
    extractedCount: filledFields,
  }
}

export const buildEhrFieldsData = (crfData, fieldMapping) => {
  const result = {}
  const groups = crfData.groups || {}

  Object.keys(groups).forEach((groupKey) => {
    const group = groups[groupKey]
    const fields = group.fields || {}
    const isRepeatable = group.is_repeatable || false
    const firstArrayField = Object.values(fields).find((field) => (
      Array.isArray(field.value) && hasEffectiveValue(field.value)
    ))

    if (isRepeatable && firstArrayField && Array.isArray(firstArrayField.value)) {
      result[groupKey] = {
        name: group.group_name || groupKey,
        repeatable: true,
        records: buildRepeatableRecords(groupKey, fields, firstArrayField),
        fields: [],
      }
      return
    }

    result[groupKey] = {
      name: group.group_name || groupKey,
      repeatable: isRepeatable,
      fields: Object.keys(fields).map((fieldKey) => (
        mapFlatField(fieldKey, fields[fieldKey], fieldMapping)
      )),
      records: [],
    }
  })

  return result
}

export const buildEhrFieldGroups = (crfData, fieldGroups) => {
  const groups = crfData.groups || {}

  if (fieldGroups.length > 0) {
    return fieldGroups.map((fieldGroup) => {
      const groupData = groups[fieldGroup.key] || {}
      const fields = groupData.fields || {}
      const totalFields = fieldGroup.dbFields.length || Object.keys(fields).length

      return mapGroupSummary({
        key: fieldGroup.key,
        name: fieldGroup.name,
        fields,
        totalFields,
        isRepeatable: fieldGroup.isRepeatable,
      })
    })
  }

  return Object.keys(groups).map((groupKey) => {
    const group = groups[groupKey]
    const fields = group.fields || {}

    return mapGroupSummary({
      key: groupKey,
      name: group.group_name || groupKey,
      fields,
      totalFields: Object.keys(fields).length,
      isRepeatable: group.is_repeatable || false,
    })
  })
}
