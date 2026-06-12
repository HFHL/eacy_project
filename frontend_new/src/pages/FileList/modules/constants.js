import { PAGE_LAYOUT_HEIGHTS } from '../../../constants/pageLayout'
import { DOC_TYPE_CATEGORIES } from '../../../components/FormDesigner/core/docTypes'

// ─── 常量 ───
export const TASK_STATUS_DISPLAY_CONFIG = {
  uploaded: { color: 'processing', text: '待解析' },
  parsing: { color: 'processing', text: '解析中' },
  parsed: { color: 'processing', text: '等待抽取' },
  extracted: { color: 'processing', text: '抽取完成' },
  parse_failed: { color: 'error', text: '异常' },
  ai_matching: { color: 'processing', text: '匹配中' },
  pending_confirm_new: { color: 'warning', text: '元数据抽取完毕' },
  pending_confirm_review: { color: 'warning', text: '元数据抽取完毕' },
  pending_confirm_uncertain: { color: 'warning', text: '元数据抽取完毕' },
  auto_archived: { color: 'warning', text: '元数据抽取完毕' },
  archived: { color: 'success', text: '已归档' },
}

export const TASK_STATUS_TO_STAGE = {
  uploaded: 'processing',
  parsing: 'processing',
  parsed: 'processing',
  extracted: 'processing',
  parse_failed: 'error',
  ai_matching: 'processing',
  pending_confirm_new: 'pending_archive',
  pending_confirm_review: 'pending_archive',
  pending_confirm_uncertain: 'pending_archive',
  auto_archived: 'pending_archive',
  archived: 'archived',
}

export const STAGE_TO_TASK_STATUSES = {
  processing: ['uploaded', 'parsing', 'parsed', 'extracted', 'ai_matching'],
  error: ['parse_failed'],
  pending_archive: ['pending_confirm_new', 'pending_confirm_review', 'pending_confirm_uncertain', 'auto_archived'],
  archived: ['archived'],
}

export const PROCESS_STAGE_OPTIONS = [
  { value: 'processing', label: '解析中' },
  { value: 'error', label: '异常' },
  { value: 'pending_archive', label: '待归档' },
  { value: 'archived', label: '已归档' },
]

export const PARSE_STAGE_TASK_STATUSES = ['uploaded', 'parsing', 'parse_failed', 'parsed', 'extracted', 'ai_matching']
export const TODO_STAGE_TASK_STATUSES = ['pending_confirm_new', 'pending_confirm_review', 'pending_confirm_uncertain', 'auto_archived']
export const VIRTUAL_PENDING_PARSE_GROUP_KEY = 'virtual:pending_parse'
export const FILE_LIST_TREE_DEFER_MS = 350
export const FILE_LIST_TABLE_SCROLL_Y = Math.max(360, (typeof window !== 'undefined' ? window.innerHeight : 900) - PAGE_LAYOUT_HEIGHTS.fileList.tableScrollOffset)
/**
 * 与主布局左侧目录栏宽度保持一致（见 MainLayout `CONTEXT_RAIL_WIDTH`）。
 */
export const FILE_LIST_GROUP_PANEL_DEFAULT_WIDTH = 248
export const FILE_LIST_GROUP_PANEL_MIN_WIDTH = 220
export const FILE_LIST_GROUP_PANEL_MAX_WIDTH = 420
export const FILE_LIST_GROUP_PANEL_SPLITTER_WIDTH = 10
export const FILE_LIST_COLUMN_DEFAULT_WIDTHS = {
  file_name: 230,
  document_metadata_summary: 190,
  bound_patient_summary: 190,
  document_type: 120,
  task_status: 120,
  status_info: 120,
  created_at: 150,
  actions: 60,
}
export const FILE_LIST_COLUMN_WIDTH_BOUNDS = {
  file_name: { min: 180, max: 560 },
  document_metadata_summary: { min: 120, max: 420 },
  bound_patient_summary: { min: 120, max: 420 },
  document_type: { min: 100, max: 260 },
  task_status: { min: 80, max: 280 },
  status_info: { min: 80, max: 260 },
  created_at: { min: 120, max: 280 },
  actions: { min: 48, max: 120 },
}

export const LEGACY_DOC_TYPE_OPTIONS = [
  '病案首页', '出院记录', '入院记录', '手术记录', '病理报告',
  '影像报告', '检验报告', '超声报告', '门诊病历', '其他',
]

export const FILE_TYPE_CATEGORIES = (() => {
  const categories = Object.entries(DOC_TYPE_CATEGORIES).map(([key, category]) => ({
    key,
    label: category.label || key,
    children: Array.from(new Set(category.children || [])),
  }))
  const knownChildren = new Set(categories.flatMap((category) => category.children))
  const fallbackChildren = Array.from(new Set(
    [...LEGACY_DOC_TYPE_OPTIONS, '未分类'].filter((item) => !knownChildren.has(item))
  ))

  if (fallbackChildren.length) {
    categories.push({
      key: 'fallback',
      label: '其他类型',
      children: fallbackChildren,
    })
  }

  return categories
})()

export const STATUS_OPTIONS = PROCESS_STAGE_OPTIONS

export const STATUS_INFO_OPTIONS = [
  { value: 'parse_failed',       label: '解析失败' },
  { value: 'has_recommendation', label: '候选/优选' },
  { value: 'pending_new',        label: '新建' },
  { value: 'waiting_match',      label: '待匹配' },
  { value: 'parsing',            label: '解析中' },
  { value: 'matching',           label: '匹配中' },
  { value: 'bound',              label: '已绑定' },
  { value: 'archived',           label: '已归档' },
  { value: 'uploading',          label: '上传中' },
]

export const DEFAULT_COLUMN_FILTERS = {
  fileName: '',
  fileType: [],
  taskStatus: [],
  statusInfo: [],
  dateRange: null,
}
