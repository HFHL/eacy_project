const STATUS_LABELS = {
  uploaded: '已上传',
  parsing: '解析中',
  parsed: '已解析',
  parse_failed: '解析失败',
  ai_matching: 'AI匹配中',
  pending_confirm_new: '新建',
  pending_confirm_review: '候选',
  pending_confirm_uncertain: '信息不足',
  auto_archived: '优选',
  archived: '已归档',
  extracted: '已抽取',
  pending: '待处理',
  processing: '处理中',
  error: '处理失败',
  unknown: '未知状态',
}

const STATUS_PRIORITY = {
  error: 0,
  pending: 1,
  processing: 2,
  extracted: 3,
  unknown: 4,
}

const formatLocalYYYYMMDD = (date) => {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const getDateKey = (value) => {
  if (!value) return null

  if (typeof value === 'string') {
    const s = value.trim()
    const dashedDate = s.match(/\b\d{4}-\d{2}-\d{2}\b/)
    if (dashedDate?.[0]) return dashedDate[0]

    const slashedDate = s.match(/\b\d{4}\/\d{2}\/\d{2}\b/)
    if (slashedDate?.[0]) return slashedDate[0].replaceAll('/', '-')

    const parsedDate = new Date(s)
    if (!Number.isNaN(parsedDate.getTime())) return formatLocalYYYYMMDD(parsedDate)
    return null
  }

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) return null
  return formatLocalYYYYMMDD(parsedDate)
}

export const getUploadDateKey = (doc) => (
  getDateKey(doc?.uploadTime) ||
  getDateKey(doc?.uploaded_at) ||
  getDateKey(doc?.createdAt) ||
  getDateKey(doc?.created_at) ||
  null
)

export const getEffectiveDateKey = (doc) => (
  getDateKey(doc?.metadata?.effectiveDate) ||
  getDateKey(doc?.metadata?.effective_at) ||
  getDateKey(doc?.metadata?.effectiveAt) ||
  getDateKey(doc?.metadata?.effective_date) ||
  null
)

export const getDocumentGroup = (doc, groupBy) => {
  switch (groupBy) {
    case 'date': {
      const key = getUploadDateKey(doc) || 'unknown'
      return { key, title: key === 'unknown' ? '未知上传日期' : key, subtitle: '' }
    }
    case 'effectiveDate': {
      const key = getEffectiveDateKey(doc) || 'unknown'
      return { key, title: key === 'unknown' ? '未知生效日期' : key, subtitle: '' }
    }
    case 'type': {
      const key = doc.metadata?.documentType || 'unknown'
      return {
        key,
        title: key === 'unknown' ? '未知类型' : key,
        subtitle: doc.metadata?.documentSubtype || '',
      }
    }
    case 'organization': {
      const key = doc.metadata?.organizationName || 'unknown'
      return { key, title: key === 'unknown' ? '未知机构' : key, subtitle: '' }
    }
    case 'status': {
      const key = doc.task_status || doc.taskStatus || doc.status || 'unknown'
      return { key, title: STATUS_LABELS[key] || key, subtitle: '' }
    }
    case 'confidence':
      return getConfidenceGroup(doc)
    default:
      return { key: 'all', title: '所有文档', subtitle: '' }
  }
}

export const sortDocumentGroups = (groups, sortOrder) => (
  Object.values(groups).sort((a, b) => {
    switch (sortOrder) {
      case 'asc':
        return a.title.localeCompare(b.title)
      case 'desc':
        return b.title.localeCompare(a.title)
      case 'count':
        return b.documents.length - a.documents.length
      case 'priority':
        return (STATUS_PRIORITY[a.key] || 4) - (STATUS_PRIORITY[b.key] || 4)
      default:
        return 0
    }
  })
)

const getConfidenceGroup = (doc) => {
  if (!doc.confidence && doc.confidence !== 0) {
    return { key: 'unknown', title: '未知置信度', subtitle: '' }
  }
  if (doc.confidence >= 0.9) {
    return { key: 'high', title: '高置信度 (≥90%)', subtitle: '' }
  }
  if (doc.confidence >= 0.7) {
    return { key: 'medium', title: '中置信度 (70-89%)', subtitle: '' }
  }
  return { key: 'low', title: '低置信度 (<70%)', subtitle: '' }
}
