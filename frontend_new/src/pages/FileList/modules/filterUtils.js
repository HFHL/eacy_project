import { documentMatchesKeyword } from '../../../utils/documentSearch'
import { mapTaskStatusToStage } from './routeState'

export const getDocumentTypeValue = (item) => item?.document_sub_type || item?.document_type || '未分类'

export const buildAvailableFileTypeCategories = (baseCategories = [], availableValues = []) => {
  const availableSet = new Set(availableValues.filter(Boolean))
  const categories = []
  const assigned = new Set()

  baseCategories.forEach((category) => {
    const children = category.children.filter((child) => availableSet.has(child))
    if (!children.length) return
    children.forEach((child) => assigned.add(child))
    categories.push({ ...category, children })
  })

  const ungrouped = Array.from(availableSet).filter((value) => !assigned.has(value))
  if (ungrouped.length) {
    categories.push({
      key: 'dynamic-others',
      label: '其他类型',
      children: ungrouped,
    })
  }

  return categories
}

export const getStatusInfoValues = (item) => {
  const status = item?.task_status
  const values = []
  if (status === 'parse_failed') values.push('parse_failed')
  if (item?.patient_info?.patient_id) values.push('bound')
  if (status === 'archived' && !item?.patient_info?.patient_id) values.push('archived')
  if (['pending_confirm_review', 'pending_confirm_uncertain', 'auto_archived'].includes(status)) values.push('has_recommendation')
  if (status === 'pending_confirm_new') values.push('pending_new')
  if (status === 'parsing') values.push('parsing')
  if (status === 'ai_matching') values.push('matching')
  if (status === 'extracted' || status === 'parsed') values.push('waiting_match')
  if (status === 'uploading') values.push('uploading')
  return values
}

export const getFiltersWithoutKey = (filters, key) => ({
  ...filters,
  [key]: key === 'fileName' ? '' : key === 'dateRange' ? null : [],
})

// ─── 工具函数 ───

/** 对文档列表应用当前列筛选（供树形展开子行复用） */
export const applyColumnFiltersToItems = (items, columnFilters) => {
  let result = items
  if (columnFilters.taskStatus?.length) {
    result = result.filter((it) => columnFilters.taskStatus.includes(mapTaskStatusToStage(it.task_status)))
  }
  if (columnFilters.fileType?.length) {
    result = result.filter((it) =>
      columnFilters.fileType.includes(it.document_sub_type || it.document_type || '未分类')
    )
  }
  if (columnFilters.fileName) {
    result = result.filter((it) => documentMatchesKeyword(it, columnFilters.fileName))
  }
  if (columnFilters.dateRange?.length === 2) {
    const from = columnFilters.dateRange[0].startOf('day').valueOf()
    const to = columnFilters.dateRange[1].endOf('day').valueOf()
    result = result.filter((it) => {
      const t = it.created_at ? new Date(it.created_at).getTime() : 0
      return t >= from && t <= to
    })
  }
  if (columnFilters.statusInfo?.length) {
    const si = columnFilters.statusInfo
    result = result.filter((it) => {
      const ts = it.task_status
      if (si.includes('parse_failed')       && ts === 'parse_failed') return true
      if (si.includes('bound')              && !!it.patient_info?.patient_id) return true
      if (si.includes('archived')           && ts === 'archived' && !it.patient_info?.patient_id) return true
      if (si.includes('has_recommendation') && ['pending_confirm_review', 'pending_confirm_uncertain', 'auto_archived'].includes(ts)) return true
      if (si.includes('pending_new')        && ts === 'pending_confirm_new') return true
      if (si.includes('parsing')            && ts === 'parsing') return true
      if (si.includes('matching')           && ts === 'ai_matching') return true
      if (si.includes('waiting_match')      && (ts === 'extracted' || ts === 'parsed')) return true
      if (si.includes('uploading')          && ts === 'uploading') return true
      return false
    })
  }
  return result
}
