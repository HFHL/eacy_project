const METADATA_FIELD_TO_CN = {
  identifiers: '唯一标识符',
  organizationName: '机构名称',
  patientName: '患者姓名',
  gender: '患者性别',
  age: '患者年龄',
  birthDate: '出生日期',
  phone: '联系电话',
  diagnosis: '诊断',
  department: '科室信息',
  documentType: '文档类型',
  documentSubtype: '文档子类型',
  documentTitle: '文档标题',
  effectiveDate: '文档生效日期',
}

const normalizeEffectiveAt = (value) => {
  if (value === undefined || value === null || value === '') return null
  const text = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T00:00:00`
  if (/^\d{4}-\d{2}-\d{2}\s/.test(text)) return text.replace(' ', 'T')
  return text
}

export const normalizeUpdatePayload = (metadata = {}) => {
  const payload = {}
  const nextMetadata = { ...(metadata.metadata_json || metadata.metadata || {}) }
  const result = {
    ...(nextMetadata.result && typeof nextMetadata.result === 'object' && !Array.isArray(nextMetadata.result)
      ? nextMetadata.result
      : {}),
  }

  const docType = metadata.doc_type ?? metadata.document_type ?? metadata.documentType
  if (docType !== undefined) payload.doc_type = docType
  const docSubtype = metadata.doc_subtype ?? metadata.document_sub_type ?? metadata.documentSubtype
  if (docSubtype !== undefined) payload.doc_subtype = docSubtype
  const docTitle = metadata.doc_title ?? metadata.document_title ?? metadata.documentTitle ?? metadata.title
  if (docTitle !== undefined) payload.doc_title = docTitle
  const effectiveAt = metadata.effective_at ?? metadata.effectiveAt ?? metadata.effectiveDate
  if (effectiveAt !== undefined) payload.effective_at = normalizeEffectiveAt(effectiveAt)

  ;['meta_status', 'ocr_status', 'ocr_text', 'ocr_payload_json'].forEach((key) => {
    if (metadata[key] !== undefined) payload[key] = metadata[key]
  })

  Object.entries(metadata).forEach(([key, value]) => {
    if (payload[key] === undefined && !['metadata', 'metadata_json'].includes(key)) {
      nextMetadata[key] = value
      const cnKey = METADATA_FIELD_TO_CN[key]
      if (cnKey) result[cnKey] = value
    }
  })

  if (Object.keys(result).length) nextMetadata.result = result
  if (Object.keys(nextMetadata).length) payload.metadata_json = nextMetadata
  return payload
}
