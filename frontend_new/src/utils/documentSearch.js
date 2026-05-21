const collectSearchValues = (doc = {}) => {
  const metadata = doc.metadata && typeof doc.metadata === 'object' ? doc.metadata : {}
  const summary = doc.document_metadata_summary && typeof doc.document_metadata_summary === 'object'
    ? doc.document_metadata_summary
    : {}

  return [
    doc.file_name,
    doc.fileName,
    doc.original_filename,
    doc.name,
    doc.doc_type,
    doc.doc_subtype,
    doc.document_type,
    doc.document_sub_type,
    doc.documentType,
    doc.documentSubtype,
    doc.doc_title,
    doc.created_at,
    doc.createdAt,
    doc.upload_time,
    doc.uploadTime,
    doc.effective_at,
    doc.effectiveAt,
    metadata.patientName,
    metadata.documentTitle,
    metadata.organizationName,
    metadata.department,
    metadata.diagnosis,
    metadata.documentType,
    metadata.documentSubtype,
    metadata.effectiveDate,
    metadata.effective_at,
    summary.patient_name,
    summary.name,
    summary.document_title,
    summary.document_type,
    summary.document_subtype,
    summary.organization_name,
    summary.department,
    summary.diagnosis,
    summary.effective_date,
    summary.birth_date,
    summary.phone,
  ]
}

export const documentMatchesKeyword = (doc = {}, keyword = '') => {
  const normalizedKeyword = String(keyword || '').trim().toLowerCase()
  if (!normalizedKeyword) return true

  return collectSearchValues(doc).some((value) => {
    if (value === undefined || value === null || value === '') return false
    return String(value).toLowerCase().includes(normalizedKeyword)
  })
}

export default documentMatchesKeyword
