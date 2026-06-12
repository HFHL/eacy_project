export const getRecordApiFieldId = (record) => {
  if (!record?.fields || record.fields.length === 0) return null
  const apiFieldId = record.fields[0].apiFieldId
  if (apiFieldId) return apiFieldId
  const fieldWithApiFieldId = record.fields.find((field) => field.apiFieldId)
  return fieldWithApiFieldId?.apiFieldId || null
}

export const buildRecordSourceField = ({ apiFieldId, groupData, index, record }) => ({
  id: record.id,
  name: `${groupData.name} #${index + 1}`,
  apiFieldId,
  value: record.fields?.map((field) => field.value).filter(Boolean).join(', ') || '',
  source: record.fields?.[0]?.source,
})

export const buildRepeatableSourceField = ({
  apiFieldId,
  field,
  groupData,
  recordIndex,
}) => ({
  id: field.id,
  name: `${groupData.name} #${recordIndex + 1} - ${field.name}`,
  apiFieldId,
  value: field.value || '',
  source: field.source,
})

export const isNormalRepeatableField = (field) => (
  field.fieldType === 'fields' || (field.type && !field.fieldType)
)
