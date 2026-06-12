const ENABLE_DOCUMENT_FALLBACK = false

export const normalizeDocuments = (docs) => {
  if (!docs) return []
  if (Array.isArray(docs)) return docs.filter(Boolean)
  if (typeof docs === 'object') {
    return Object.entries(docs).map(([id, doc]) => ({ id, ...(doc || {}) }))
  }
  return []
}

export const getDisplayFieldName = (fieldName) => (
  typeof fieldName === 'string' && fieldName.includes('/')
    ? fieldName.split('/').pop()
    : fieldName
)

export const buildFieldAudit = ({ audit, fieldData, fieldName }) => {
  const auditFields = (audit?.fields && fieldName in audit.fields)
    ? audit.fields[fieldName]
    : {}

  return {
    ...auditFields,
    document_id: fieldData?.document_id || auditFields.document_id,
    document_type: fieldData?.document_type || auditFields.document_type,
    raw: fieldData?.raw || auditFields.raw,
    source_id: fieldData?.source_id || auditFields.source_id,
    bbox: fieldData?.bbox || auditFields.bbox,
    page_idx: fieldData?.page_idx || auditFields.page_idx,
  }
}

export const buildFieldTraceContext = ({
  audit,
  documents,
  fieldData,
  fieldName,
}) => {
  const fieldAudit = buildFieldAudit({ audit, fieldData, fieldName })
  const docsList = normalizeDocuments(documents)
  const explicitDocId = fieldAudit.document_id
  const explicitDocInfo = explicitDocId && documents && !Array.isArray(documents)
    ? documents[explicitDocId]
    : null
  const traceLevel = fieldAudit.trace_level || (explicitDocId ? 'field_audit' : 'untraceable')
  const displayFieldName = getDisplayFieldName(fieldName)

  const fallbackDoc = (() => {
    if (!ENABLE_DOCUMENT_FALLBACK || explicitDocId || docsList.length === 0) return null
    const keyword = String(displayFieldName || fieldName || '').toLowerCase()
    const sorted = docsList
      .map((doc, idx) => {
        const content = [
          doc.file_name,
          doc.fileName,
          doc.name,
          doc.document_type,
          doc.document_sub_type,
          fieldAudit.document_type,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        const score = keyword && content.includes(keyword) ? 2 : 0
        return { doc, score, idx }
      })
      .sort((a, b) => (b.score - a.score) || (a.idx - b.idx))
    return sorted[0]?.doc || docsList[0]
  })()

  const docId = explicitDocId || fallbackDoc?.id
  const docInfo = explicitDocInfo || fallbackDoc || null

  return {
    displayFieldName,
    docId,
    docInfo,
    fieldAudit,
    traceLevel,
  }
}
