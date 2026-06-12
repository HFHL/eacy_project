export function normalizeDocumentCollection(docs) {
  if (!docs) return []
  if (Array.isArray(docs)) return docs.filter(Boolean).map(normalizeCandidateDocument)
  if (typeof docs === 'object') {
    return Object.entries(docs).map(([id, doc]) => normalizeCandidateDocument({ id, ...(doc || {}) }))
  }
  return []
}

function normalizeDocumentMetadata(metadata) {
  if (!metadata) return {}
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata)
    } catch {
      return {}
    }
  }
  return typeof metadata === 'object' ? metadata : {}
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value
    }
  }
  return undefined
}

export function normalizeCandidateDocument(doc) {
  if (!doc || typeof doc !== 'object') return doc
  const metadata = normalizeDocumentMetadata(doc.metadata)
  const result = normalizeDocumentMetadata(metadata.result)
  const documentType = firstNonEmpty(
    doc.document_type,
    doc.documentType,
    doc.doc_type,
    doc.file_type,
    metadata.documentType,
    metadata.document_type,
    metadata.docType,
    result['文档类型'],
    doc.category
  )
  const documentSubType = firstNonEmpty(
    doc.document_sub_type,
    doc.documentSubType,
    doc.documentSubtype,
    doc.doc_sub_type,
    doc.sub_type,
    metadata.documentSubType,
    metadata.documentSubtype,
    metadata.document_sub_type,
    result['文档子类型'],
    metadata.subType
  )
  return {
    ...doc,
    metadata,
    document_type: documentType,
    document_sub_type: documentSubType,
    documentType,
    documentSubType,
  }
}

export function buildCandidateDocuments(draftData, fallbackDocuments) {
  const metadataDocuments = normalizeDocumentCollection(draftData?._extraction_metadata?.documents)
  if (metadataDocuments.length > 0) return metadataDocuments
  return normalizeDocumentCollection(fallbackDocuments)
}

export function getDocumentDisplayName(doc) {
  return doc?.file_name || doc?.fileName || doc?.name || `文档_${doc?.id ?? '未知'}`
}

export function getDocumentTypeLabel(doc) {
  const normalizedDoc = normalizeCandidateDocument(doc)
  const mainType = normalizedDoc?.document_type || '未知类型'
  const subType = normalizedDoc?.document_sub_type || ''
  return subType ? `${mainType} | ${subType}` : String(mainType)
}

export function formatDocumentUploadedAt(doc) {
  const raw = doc?.upload_time || doc?.uploaded_at || doc?.created_at
  if (!raw) return '-'
  const uploadedAt = new Date(raw)
  if (Number.isNaN(uploadedAt.getTime())) return String(raw)
  return uploadedAt.toLocaleString()
}
