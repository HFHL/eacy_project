import { normalizeFieldPathToDot } from './crfPathUtils'

export const buildProjectFieldCanonicalPath = (groupId, fieldKey, fieldData = null) => {
  const normalizedGroup = normalizeFieldPathToDot(groupId)
  const candidatePath = normalizeFieldPathToDot(
    fieldData?.field_path
    || fieldData?.db_field
    || fieldKey
    || '',
  )
  if (!candidatePath) return ''
  if (!normalizedGroup) return candidatePath
  if (candidatePath === normalizedGroup || candidatePath.startsWith(`${normalizedGroup}.`)) {
    return candidatePath
  }
  return `${normalizedGroup}.${candidatePath}`
}

export const mergeAuditFieldEntry = (fieldMap, key, incoming) => {
  if (!key || !incoming || typeof incoming !== 'object') return
  const existing = fieldMap[key]
  if (!existing || typeof existing !== 'object') {
    fieldMap[key] = incoming
    return
  }
  const incomingHasSource =
    incoming.document_id
    || incoming.source_document_id
    || incoming.bbox
    || incoming.raw
    || incoming.source_id
  const existingHasSource =
    existing.document_id
    || existing.source_document_id
    || existing.bbox
    || existing.raw
    || existing.source_id
  if (!existingHasSource && incomingHasSource) {
    fieldMap[key] = { ...existing, ...incoming }
  }
}
