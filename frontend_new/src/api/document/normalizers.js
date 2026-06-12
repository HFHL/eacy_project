import { emptySuccess } from '../_empty'

const toArray = (value) => {
  if (Array.isArray(value)) return value
  if (value === undefined || value === null || value === '') return []
  return String(value).split(',').map((item) => item.trim()).filter(Boolean)
}

const getFileType = (document = {}) => (
  document.file_ext || document.mime_type || document.file_type || 'unknown'
)

const getMetadataResult = (metadata = {}) => (
  metadata?.result && typeof metadata.result === 'object' && !Array.isArray(metadata.result)
    ? metadata.result
    : {}
)

const firstNonEmpty = (...values) => {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value
  }
  return ''
}

const normalizeMetadataForDisplay = (metadata = {}, summary = {}) => {
  const safeMetadata = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
  const safeSummary = summary && typeof summary === 'object' && !Array.isArray(summary) ? summary : {}
  const result = getMetadataResult(safeMetadata)
  const identifiers = Array.isArray(result['唯一标识符'])
    ? result['唯一标识符']
    : (Array.isArray(safeMetadata.identifiers) ? safeMetadata.identifiers : (Array.isArray(safeSummary.identifiers) ? safeSummary.identifiers : []))

  return {
    ...safeMetadata,
    result,
    identifiers,
    organizationName: firstNonEmpty(safeMetadata.organizationName, safeMetadata.organization_name, safeSummary.organization_name, result['机构名称']),
    patientName: firstNonEmpty(safeMetadata.patientName, safeMetadata.patient_name, safeSummary.patient_name, result['患者姓名']),
    gender: firstNonEmpty(safeMetadata.gender, safeMetadata.patient_gender, safeSummary.patient_gender, result['患者性别']),
    age: firstNonEmpty(safeMetadata.age, safeMetadata.patient_age, safeSummary.patient_age, result['患者年龄']),
    birthDate: firstNonEmpty(safeMetadata.birthDate, safeMetadata.birth_date, safeSummary.birth_date, result['出生日期']),
    phone: firstNonEmpty(safeMetadata.phone, safeSummary.phone, result['联系电话']),
    diagnosis: firstNonEmpty(safeMetadata.diagnosis, safeSummary.diagnosis, result['诊断']),
    department: firstNonEmpty(safeMetadata.department, safeSummary.department, result['科室信息']),
    documentType: firstNonEmpty(safeMetadata.documentType, safeMetadata.document_type, safeSummary.document_type, result['文档类型']),
    documentSubtype: firstNonEmpty(safeMetadata.documentSubtype, safeMetadata.document_subtype, safeSummary.document_subtype, result['文档子类型']),
    documentTitle: firstNonEmpty(safeMetadata.documentTitle, safeMetadata.document_title, safeMetadata.title, safeSummary.document_title, result['文档标题']),
    effectiveDate: firstNonEmpty(safeMetadata.effectiveDate, safeMetadata.effective_at, safeMetadata.effectiveAt, safeSummary.effective_date, result['文档生效日期']),
  }
}

const getDocumentType = (document = {}) => (
  document.doc_type || document.document_type || normalizeMetadataForDisplay(document.metadata_json, document.document_metadata_summary).documentType || ''
)

const getDocumentSubtype = (document = {}) => (
  document.doc_subtype || document.document_sub_type || normalizeMetadataForDisplay(document.metadata_json, document.document_metadata_summary).documentSubtype || ''
)

const normalizeTaskStatus = (document = {}) => {
  const status = document.status || document.task_status || 'uploaded'
  const archivedAt = document.archived_at || document.archivedAt
  if (status === 'archived' || archivedAt) return 'archived'
  if (status === 'failed') return 'parse_failed'
  if (status === 'ocr_pending') return 'parsing'

  const ocrStatus = document.ocr_status || document.ocrStatus
  const metaStatus = document.meta_status || document.metaStatus
  if ((status === 'ocr_completed' || ocrStatus === 'completed') && metaStatus === 'completed') {
    return 'pending_confirm_uncertain'
  }
  if (status === 'ocr_completed') return 'parsed'
  if (['queued', 'running'].includes(ocrStatus)) return 'parsing'
  if (ocrStatus === 'completed') return 'parsed'
  if (ocrStatus === 'failed') return 'parse_failed'

  return status
}

export const normalizeDocument = (document = {}) => {
  const metadata = document.metadata_json && typeof document.metadata_json === 'object'
    ? document.metadata_json
    : {}
  const displayMetadata = normalizeMetadataForDisplay(metadata, document.document_metadata_summary)
  const fileName = document.original_filename || document.file_name || document.fileName || ''
  const documentType = getDocumentType(document)
  const documentSubtype = getDocumentSubtype(document)
  const taskStatus = normalizeTaskStatus(document)
  const createdAt = document.created_at || document.upload_time || document.uploadTime || ''
  const effectiveAt = document.effective_at || displayMetadata.effectiveDate || ''
  const patientId = document.patient_id || document.patientId || document.patient_info?.patient_id || null
  const backendSummary = document.document_metadata_summary && typeof document.document_metadata_summary === 'object'
    ? document.document_metadata_summary
    : null
  const documentMetadataSummary = backendSummary
    ? {
        ...backendSummary,
        name: firstNonEmpty(backendSummary.name, backendSummary.patient_name, displayMetadata.patientName),
        patient_name: firstNonEmpty(backendSummary.patient_name, backendSummary.name, displayMetadata.patientName),
        gender: firstNonEmpty(backendSummary.gender, backendSummary.patient_gender, displayMetadata.gender),
        patient_gender: firstNonEmpty(backendSummary.patient_gender, backendSummary.gender, displayMetadata.gender),
        age: firstNonEmpty(backendSummary.age, backendSummary.patient_age, displayMetadata.age),
        patient_age: firstNonEmpty(backendSummary.patient_age, backendSummary.age, displayMetadata.age),
        document_title: firstNonEmpty(backendSummary.document_title, displayMetadata.documentTitle),
        effective_date: firstNonEmpty(backendSummary.effective_date, effectiveAt),
      }
    : {
        name: displayMetadata.patientName,
        patient_name: displayMetadata.patientName,
        gender: displayMetadata.gender,
        patient_gender: displayMetadata.gender,
        age: displayMetadata.age,
        patient_age: displayMetadata.age,
        document_title: displayMetadata.documentTitle,
        effective_date: effectiveAt,
      }

  return {
    ...document,
    id: document.id,
    document_id: document.id,
    documentId: document.id,
    original_filename: fileName,
    file_name: fileName,
    fileName,
    name: fileName,
    file_ext: document.file_ext || '',
    file_type: getFileType(document),
    fileType: getFileType(document),
    mime_type: document.mime_type || '',
    file_size: document.file_size || 0,
    fileSize: document.file_size || 0,
    file_url: document.file_url || '',
    fileUrl: document.file_url || '',
    storage_path: document.storage_path || '',
    status: document.status || taskStatus,
    task_status: taskStatus,
    taskStatus,
    upload_time: createdAt,
    uploadTime: createdAt,
    created_at: createdAt,
    createdAt,
    updated_at: document.updated_at || '',
    archived_at: document.archived_at || '',
    patient_id: patientId,
    patientId,
    patient_info: {
      ...(document.patient_info || {}),
      patient_id: patientId,
      ...(document.bound_patient
        ? {
            name: document.bound_patient.name,
            patient_name: document.bound_patient.name,
            gender: document.bound_patient.gender,
            patient_gender: document.bound_patient.gender,
            age: document.bound_patient.age,
            patient_age: document.bound_patient.age,
          }
        : {}),
    },
    bound_patient_summary: patientId
      ? {
          patient_id: patientId,
          name: document.bound_patient?.name || null,
          patient_name: document.bound_patient?.name || null,
          gender: document.bound_patient?.gender || null,
          patient_gender: document.bound_patient?.gender || null,
          age: document.bound_patient?.age ?? null,
          patient_age: document.bound_patient?.age ?? null,
        }
      : null,
    document_type: documentType,
    documentType,
    document_sub_type: documentSubtype,
    documentSubtype,
    doc_type: document.doc_type || documentType,
    doc_subtype: document.doc_subtype || documentSubtype,
    doc_title: document.doc_title || displayMetadata.documentTitle || fileName,
    metadata_json: metadata,
    metadata: {
      ...displayMetadata,
      documentType,
      documentSubtype,
      effectiveDate: effectiveAt,
      effective_at: effectiveAt,
    },
    document_metadata_summary: documentMetadataSummary,
    effective_at: effectiveAt || null,
    ocr_status: document.ocr_status || document.ocrStatus || null,
    ocrStatus: document.ocr_status || document.ocrStatus || null,
    meta_status: document.meta_status || document.metaStatus || null,
    metaStatus: document.meta_status || document.metaStatus || null,
    extract_status: document.extract_status || document.extractStatus || null,
    extractStatus: document.extract_status || document.extractStatus || null,
    is_parsed: ['parsed', 'extracted', 'ai_matching', 'archived'].includes(taskStatus) || !!document.ocr_text,
    isParsed: ['parsed', 'extracted', 'ai_matching', 'archived'].includes(taskStatus) || !!document.ocr_text,
    preview_source: document.preview_source || null,
    ocr_page_count: document.ocr_page_count ?? null,
    requires_review: metadata.requires_review === true,
    requiresReview: metadata.requires_review === true,
    category: documentSubtype || documentType || '未分类',
  }
}

export const normalizeListParams = (params = {}) => {
  const next = {
    page: params.page || params.current || 1,
    page_size: params.page_size || params.pageSize || 20,
  }
  const patientId = params.patient_id ?? params.patientId
  if (patientId) next.patient_id = patientId
  const tab = params.tab
  if (tab && tab !== 'all') next.tab = tab
  const taskStages = toArray(params.task_stage ?? params.taskStage)
  if (taskStages.length) next.task_stage = taskStages.join(',')
  const keyword = (params.keyword ?? params.search ?? '').toString().trim()
  if (keyword) next.keyword = keyword
  const documentTypes = toArray(params.document_types ?? params.document_type)
  if (documentTypes.length) next.document_types = documentTypes.join(',')
  if (params.date_from) next.date_from = params.date_from
  if (params.date_to) next.date_to = params.date_to
  if (params.order_by) next.order_by = params.order_by
  if (params.order_direction) next.order_direction = params.order_direction
  const statuses = toArray(params.status)
  if (statuses.length) next.status = statuses.join(',')
  return next
}

export const normalizeDocumentListResponse = (payload = {}, params = {}) => {
  const page = Number(payload.page || params.page || 1)
  const pageSize = Number(payload.page_size || params.page_size || params.pageSize || 20)
  const items = (Array.isArray(payload.items) ? payload.items : []).map(normalizeDocument)
  const total = Number(payload.total ?? items.length)

  items.items = items
  items.list = items
  items.total = total
  items.page = page
  items.page_size = pageSize

  return emptySuccess(items, {
    list: items,
    items,
    total,
    page,
    page_size: pageSize,
    pagination: { total, page, page_size: pageSize },
  })
}
