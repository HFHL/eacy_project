import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import {
  searchUserFiles,
  parseDocument,
  getFileStatusesByIds,
  aiMatchPatientAsync,
  getDocumentTaskProgress,
  extractEhrData,
  getDocumentAiMatchInfo,
  changeArchivePatient,
  archiveDocument,
  batchArchiveDocuments,
  unarchiveDocument,
  deleteDocument,
  deleteDocuments,
  getFileListV2Tree,
  getFileListV2GroupDocuments,
  matchGroup,
  confirmGroupArchive
} from '../../api/document'
import { createPatient, getPatientList } from '../../api/patient'
import { maskName } from '../../utils/sensitiveUtils'
import { useSelector } from 'react-redux'
import { useUploadManager, UploadStatus } from '../../hooks/useUploadManager'
import UploadPanel from '../../components/UploadPanel'
import UploadFloatingButton from '../../components/UploadPanel/UploadFloatingButton'
import { PAGE_LAYOUT_HEIGHTS, toViewportHeight } from '../../constants/pageLayout'
import {
  App as AntdApp,
  Typography,
  Button,
  Space,
  Tag,
  Table,
  Tooltip,
  Input,
  DatePicker,
  Modal,
  List,
  Descriptions,
  Spin,
  Dropdown,
  Checkbox,
  Badge,
  Alert,
  Popover,
  Segmented,
  theme,
} from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  DeleteOutlined,
  FileTextOutlined,
  FilePdfOutlined,
  LoadingOutlined,
  RobotOutlined,
  CheckCircleOutlined,
  UserAddOutlined,
  UploadOutlined,
  FolderOpenOutlined,
  MoreOutlined,
  DownloadOutlined,
  TeamOutlined,
  CaretDownOutlined,
  CaretRightOutlined,
  FilterOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
  CloseOutlined,
  FileImageOutlined,
  DisconnectOutlined,
  UserOutlined,
  CheckCircleFilled,
  ClockCircleFilled,
  ExclamationCircleFilled,
  CloseCircleFilled,
  WarningFilled,
  QuestionCircleOutlined,
} from '@ant-design/icons'
import DocumentDetailModal from '../PatientDetail/tabs/DocumentsTab/components/DocumentDetailModal'
import CreatePatientDrawer from '../../components/Patient/CreatePatientDrawer'
import { mergePatientPrefills } from '../../components/Patient/patientPrefill'
import { DOC_TYPE_CATEGORIES } from '../../components/FormDesigner/core/docTypes'
import { appThemeToken, modalBodyPreset, modalWidthPreset } from '../../styles/themeTokens'

const { Text } = Typography
const { RangePicker } = DatePicker

// ─── 常量 ───
const TASK_STATUS_DISPLAY_CONFIG = {
  uploaded: { color: 'processing', text: '解析中' },
  parsing: { color: 'processing', text: '解析中' },
  parsed: { color: 'processing', text: '解析中' },
  extracted: { color: 'processing', text: '解析中' },
  parse_failed: { color: 'error', text: '异常' },
  ai_matching: { color: 'processing', text: '解析中' },
  pending_confirm_new: { color: 'warning', text: '元数据抽取完毕' },
  pending_confirm_review: { color: 'warning', text: '元数据抽取完毕' },
  pending_confirm_uncertain: { color: 'warning', text: '元数据抽取完毕' },
  auto_archived: { color: 'warning', text: '元数据抽取完毕' },
  archived: { color: 'success', text: '已归档' },
}

const TASK_STATUS_TO_STAGE = {
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

const STAGE_TO_TASK_STATUSES = {
  processing: ['uploaded', 'parsing', 'parsed', 'extracted', 'ai_matching'],
  error: ['parse_failed'],
  pending_archive: ['pending_confirm_new', 'pending_confirm_review', 'pending_confirm_uncertain', 'auto_archived'],
  archived: ['archived'],
}

const PROCESS_STAGE_OPTIONS = [
  { value: 'processing', label: '解析中' },
  { value: 'error', label: '异常' },
  { value: 'pending_archive', label: '待归档' },
  { value: 'archived', label: '已归档' },
]

const TAB_STATUS_MAP = {
  all: null,
  parse: 'uploaded,parsing,parse_failed,parsed,extracted,ai_matching',
  todo: 'pending_confirm_new,pending_confirm_review,pending_confirm_uncertain,auto_archived',
  archived: 'archived',
}

const PARSE_STAGE_TASK_STATUSES = ['uploaded', 'parsing', 'parse_failed', 'parsed', 'extracted', 'ai_matching']
const TODO_STAGE_TASK_STATUSES = ['pending_confirm_new', 'pending_confirm_review', 'pending_confirm_uncertain', 'auto_archived']
const VIRTUAL_PENDING_PARSE_GROUP_KEY = 'virtual:pending_parse'
const FILE_LIST_TREE_DEFER_MS = 350
const FILE_LIST_TABLE_SCROLL_Y = Math.max(360, (typeof window !== 'undefined' ? window.innerHeight : 900) - PAGE_LAYOUT_HEIGHTS.fileList.tableScrollOffset)
/**
 * 与主布局左侧目录栏宽度保持一致（见 MainLayout `CONTEXT_RAIL_WIDTH`）。
 */
const FILE_LIST_GROUP_PANEL_DEFAULT_WIDTH = 248
const FILE_LIST_GROUP_PANEL_MIN_WIDTH = 220
const FILE_LIST_GROUP_PANEL_MAX_WIDTH = 420
const FILE_LIST_GROUP_PANEL_SPLITTER_WIDTH = 10
const FILE_LIST_COLUMN_DEFAULT_WIDTHS = {
  file_name: 230,
  document_metadata_summary: 190,
  bound_patient_summary: 190,
  document_type: 120,
  task_status: 120,
  status_info: 120,
  created_at: 150,
  actions: 60,
}
const FILE_LIST_COLUMN_WIDTH_BOUNDS = {
  file_name: { min: 180, max: 560 },
  document_metadata_summary: { min: 120, max: 420 },
  bound_patient_summary: { min: 120, max: 420 },
  document_type: { min: 100, max: 260 },
  task_status: { min: 80, max: 280 },
  status_info: { min: 80, max: 260 },
  created_at: { min: 120, max: 280 },
  actions: { min: 48, max: 120 },
}

const LEGACY_DOC_TYPE_OPTIONS = [
  '病案首页', '出院记录', '入院记录', '手术记录', '病理报告',
  '影像报告', '检验报告', '超声报告', '门诊病历', '其他',
]

const FILE_TYPE_CATEGORIES = (() => {
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

const STATUS_OPTIONS = PROCESS_STAGE_OPTIONS

const STATUS_INFO_OPTIONS = [
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

const DEFAULT_COLUMN_FILTERS = {
  fileName: '',
  fileType: [],
  taskStatus: [],
  statusInfo: [],
  dateRange: null,
}

const getRouteStateFromSearchParams = (searchParams) => {
  const validTabs = new Set(['all', 'parse', 'todo', 'archived'])
  const validViews = new Set(['patient', 'table'])
  const validTaskStatuses = new Set(STATUS_OPTIONS.map((item) => item.value))
  const validStatusInfo = new Set(STATUS_INFO_OPTIONS.map((item) => item.value))

  const tabParam = searchParams.get('tab')
  const tab = validTabs.has(tabParam) ? tabParam : 'all'
  const viewParam = searchParams.get('view')
  const view = validViews.has(viewParam) ? viewParam : 'patient'
  const filters = {
    ...DEFAULT_COLUMN_FILTERS,
    fileName: searchParams.get('q') || '',
    taskStatus: normalizeTaskStatusFilters(
      (searchParams.get('taskStatus') || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    ).filter((item) => validTaskStatuses.has(item)),
    statusInfo: (searchParams.get('statusInfo') || '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => validStatusInfo.has(item)),
  }

  return { tab, view, filters }
}

const getRouteStateSignature = (routeState) => JSON.stringify({
  tab: routeState.tab,
  view: routeState.view,
  fileName: routeState.filters.fileName || '',
  taskStatus: routeState.filters.taskStatus || [],
  statusInfo: routeState.filters.statusInfo || [],
})

const mapTaskStatusToStage = (status) => TASK_STATUS_TO_STAGE[status] || null

const expandStageFiltersToTaskStatuses = (stages = []) =>
  Array.from(new Set(stages.flatMap((stage) => STAGE_TO_TASK_STATUSES[stage] || [])))

const normalizeTaskStatusFilters = (values = []) =>
  Array.from(new Set(
    values
      .map((value) => {
        if (STAGE_TO_TASK_STATUSES[value]) return value
        return mapTaskStatusToStage(value)
      })
      .filter(Boolean)
  ))

const toggleFilterValues = (currentValues = [], targets = [], checked = true) => {
  const next = new Set(currentValues)
  targets.forEach((target) => {
    if (checked) next.add(target)
    else next.delete(target)
  })
  return Array.from(next)
}

const getDocumentTypeValue = (item) => item?.document_sub_type || item?.document_type || '未分类'

const buildAvailableFileTypeCategories = (baseCategories = [], availableValues = []) => {
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

const getStatusInfoValues = (item) => {
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

const getFiltersWithoutKey = (filters, key) => ({
  ...filters,
  [key]: key === 'fileName' ? '' : key === 'dateRange' ? null : [],
})

// ─── 工具函数 ───

/** 对文档列表应用当前列筛选（供树形展开子行复用） */
const applyColumnFiltersToItems = (items, columnFilters) => {
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
    const kw = columnFilters.fileName.toLowerCase()
    result = result.filter((it) => it.file_name?.toLowerCase().includes(kw))
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

const formatFileSize = (bytes) => {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let unitIndex = 0
  let size = bytes
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  return `${size.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`
}

const formatTime = (time) =>
  time
    ? new Date(time).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '--'

/**
 * 格式化患者摘要展示文案（姓名/性别/年龄）。
 * @param {{name?: string, gender?: string, age?: string|number}|null|undefined} summary 患者摘要对象
 * @returns {string} 摘要字符串
 */
const formatPatientSummary = (summary) => {
  const rawName = summary?.name || summary?.patient_name ? String(summary.name || summary.patient_name).trim() : ''
  const rawGender = summary?.gender || summary?.patient_gender ? String(summary.gender || summary.patient_gender).trim() : ''
  const rawAge = summary?.age ?? summary?.patient_age ?? ''
  const normalizedAge = rawAge == null ? '' : String(rawAge).trim()

  const name = rawName ? maskName(rawName) : '--'
  const gender = rawGender || '--'
  const age = normalizedAge ? (normalizedAge.endsWith('岁') ? normalizedAge : `${normalizedAge}岁`) : '--'

  if (name === '--' && gender === '--' && age === '--') {
    return '--'
  }

  return `${name} · ${gender} · ${age}`
}

const STATUS_PROGRESS_MAP = {
  uploaded:                    { filled: 1 },
  parsing:                     { filled: 1, processing: true },
  parsed:                      { filled: 2 },
  parse_failed:                { filled: 1, failed: true },
  extracted:                   { filled: 3 },
  ai_matching:                 { filled: 3, processing: true },
  pending_confirm_new:         { filled: 4, pending: true },
  pending_confirm_review:      { filled: 4, pending: true },
  pending_confirm_uncertain:   { filled: 4, pending: true },
  auto_archived:               { filled: 4, pending: true },
  archived:                    { filled: 5, done: true },
}

const STAGE_LABELS = ['上传', '识别', '抽取', '匹配', '归档']

const isLlmExtractionFailure = (record) =>
  record?.task_status === 'parse_failed' && typeof record?.parse_error === 'string' && record.parse_error.includes('LLM 抽取失败')

const formatMatchScorePercent = (score) => {
  if (score == null || score === '') return ''
  const numericScore = Number(score)
  if (!Number.isFinite(numericScore)) return ''
  const percent = numericScore <= 1 ? Math.round(numericScore * 100) : Math.round(numericScore)
  return `${percent}%`
}

const getRecommendedArchiveLabel = (patientName, matchScore, { masked = true } = {}) => {
  const displayName = patientName
    ? (masked ? maskName(patientName) : patientName)
    : ''
  const scoreText = formatMatchScorePercent(matchScore)
  if (!displayName) return '确认推荐'
  return `绑定${displayName}${scoreText ? `（${scoreText}）` : ''}`
}

const getCandidatePatientId = (candidate = {}) => (
  candidate?.id || candidate?.patient_id || candidate?.patientId || candidate?.patientID || ''
)

const getGroupRecommendedPatient = (matchInfo = {}) => {
  const candidates = Array.isArray(matchInfo?.candidates) ? matchInfo.candidates : []
  const matchedPatientId = matchInfo?.matched_patient_id || matchInfo?.ai_recommendation || ''
  const matchedCandidate = matchedPatientId
    ? candidates.find((item) => getCandidatePatientId(item) === matchedPatientId) || candidates[0]
    : candidates[0]
  return {
    patientId: matchedPatientId || getCandidatePatientId(matchedCandidate),
    candidate: matchedCandidate || null,
  }
}

const GROUP_PRIMARY_ACTION_TEXT_MAX_WIDTH = 132
const META_CHIP_TEXT_MAX_WIDTH = 112

/**
 * 根据任务状态返回统一语义类型。
 *
 * @param {string | undefined | null} status 任务状态
 * @returns {'neutral' | 'processing' | 'success' | 'warning' | 'error'}
 */
const getTaskStatusSemantic = (status) => {
  if (status === 'parse_failed') return 'error'
  if (['uploaded', 'parsing', 'parsed', 'extracted', 'ai_matching'].includes(status)) return 'processing'
  if (['pending_confirm_new', 'pending_confirm_review', 'pending_confirm_uncertain', 'auto_archived'].includes(status)) return 'warning'
  if (status === 'archived') return 'success'
  return 'neutral'
}

/**
 * 统一元信息标签样式（文件类型/处理阶段/状态信息复用）。
 *
 * @param {'neutral' | 'processing' | 'success' | 'warning' | 'error'} semantic 语义类型
 * @param {'outline' | 'soft' | 'plain'} [variant='soft'] 样式变体
 * @returns {React.CSSProperties}
 */
const getMetaChipStyle = (semantic, variant = 'soft') => {
  const palette = {
    neutral: { text: appThemeToken.colorTextSecondary, bg: appThemeToken.colorFillQuaternary, border: appThemeToken.colorBorderSecondary || appThemeToken.colorBorder },
    processing: { text: appThemeToken.colorPrimary, bg: appThemeToken.colorPrimaryBg, border: appThemeToken.colorPrimaryBorder },
    success: { text: appThemeToken.colorSuccess, bg: appThemeToken.colorSuccessBg, border: appThemeToken.colorSuccessBorder },
    warning: { text: appThemeToken.colorWarning, bg: appThemeToken.colorWarningBg, border: appThemeToken.colorWarningBorder },
    error: { text: appThemeToken.colorError, bg: appThemeToken.colorErrorBg, border: appThemeToken.colorErrorBorder },
  }
  const tone = palette[semantic] || palette.neutral
  const base = {
    display: 'inline-block',
    maxWidth: '100%',
    minWidth: 0,
    fontSize: 12,
    lineHeight: '18px',
    borderRadius: 10,
    padding: '0 8px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    verticalAlign: 'middle',
  }
  if (variant === 'plain') {
    return {
      ...base,
      color: tone.text,
      background: 'transparent',
      border: '1px solid transparent',
      padding: 0,
      borderRadius: 0,
    }
  }
  if (variant === 'outline') {
    return {
      ...base,
      color: tone.text,
      background: appThemeToken.colorBgContainer,
      border: `1px solid ${tone.border}`,
    }
  }
  return {
    ...base,
    color: tone.text,
    background: tone.bg,
    border: `1px solid ${tone.border}`,
  }
}

/**
 * 状态信息列两行省略样式（仅用于状态信息文案）。
 *
 * @returns {React.CSSProperties}
 */
const getStatusInfoTwoLineClampStyle = () => ({
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  whiteSpace: 'normal',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  lineHeight: '16px',
  maxHeight: 32,
  wordBreak: 'break-word',
})

/**
 * 渲染分组主按钮文案（限制最大宽度，超出省略）。
 *
 * @param {string} label 按钮文案
 * @returns {React.ReactNode}
 */
const renderGroupPrimaryActionLabel = (label) => (
  <span
    title={label}
    style={{
      display: 'inline-block',
      maxWidth: GROUP_PRIMARY_ACTION_TEXT_MAX_WIDTH,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      verticalAlign: 'bottom',
    }}
  >
    {label}
  </span>
)

const getStatusConfig = (status, record) => {
  if (isLlmExtractionFailure(record)) {
    return { color: 'error', text: '异常' }
  }
  return TASK_STATUS_DISPLAY_CONFIG[status] || { text: status || '未知' }
}

const getStatusInfoConfig = (record) => {
  const status = record?.task_status
  if (status === 'uploaded') return { semantic: 'processing', text: '待解析' }
  if (status === 'parsing') return { semantic: 'processing', text: '解析中' }
  if (status === 'parsed') return { semantic: 'processing', text: '等待抽取' }
  if (status === 'extracted') return { semantic: 'processing', text: '抽取完成' }
  if (status === 'parse_failed') return { semantic: 'error', text: '解析/抽取失败' }
  if (status === 'ai_matching') return { semantic: 'processing', text: '匹配中' }
  if (status === 'pending_confirm_new') return { semantic: 'warning', text: '待归档' }
  if (status === 'pending_confirm_review') return { semantic: 'warning', text: '待归档' }
  if (status === 'pending_confirm_uncertain') return { semantic: 'warning', text: '待归档' }
  if (status === 'auto_archived') return { semantic: 'warning', text: '待归档' }
  if (status === 'archived') return { semantic: 'success', text: '已绑定' }
  return null
}

const StatusProgressBar = ({ status, record, pollingParseIds, matchingDocIds }) => {
  const config = getStatusConfig(status, record)
  const info = STATUS_PROGRESS_MAP[status] || { filled: 0 }
  const semantic = getTaskStatusSemantic(status)

  let { filled, processing = false, failed = false, pending = false, done = false } = info

  if (pollingParseIds?.has(record?.id) && ['uploaded', 'parsing', 'parsed', 'extracted'].includes(status)) {
    processing = true
  }
  if (matchingDocIds?.has(record?.id) || status === 'ai_matching') {
    filled = Math.max(filled, 3)
    processing = true
  }

  let filledColor = 'var(--primary-color)'
  let textColor = 'var(--text-color-secondary)'
  if (done)          { filledColor = appThemeToken.colorSuccess; textColor = appThemeToken.colorSuccess }
  else if (pending)  { filledColor = appThemeToken.colorWarning; textColor = appThemeToken.colorWarning }
  else if (failed)   { textColor = appThemeToken.colorError }
  else if (processing) { textColor = 'var(--primary-color)' }

  const getSegColor = (idx) => {
    if (failed && idx === filled) return appThemeToken.colorError
    if (processing && idx === filled) return done ? filledColor : appThemeToken.colorPrimary
    if (idx < filled) return filledColor
    return 'var(--border-color)'
  }

  const tipParts = STAGE_LABELS.map((s, i) => {
    if (i < filled) return `${s} ✓`
    if (failed && i === filled) return `${s} ✗`
    if (processing && i === filled) return `${s} ⏳`
    return s
  })
  const tooltip = failed && record?.parse_error
    ? `${tipParts.join(' → ')}\n${record.parse_error}`
    : tipParts.join(' → ')

  return (
    <Tooltip title={<span style={{ whiteSpace: 'pre-wrap' }}>{tooltip}</span>}>
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <div style={{ display: 'inline-flex', gap: 4, marginBottom: 3 }}>
          {STAGE_LABELS.map((_, i) => (
            <div
              key={i}
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: getSegColor(i),
                transition: 'background 0.3s',
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', minWidth: 0 }}>
          {processing && <LoadingOutlined spin style={{ fontSize: 12, color: 'var(--primary-color)' }} />}
          <span
            title={config.text}
            style={{
              ...getMetaChipStyle(semantic, 'plain'),
              maxWidth: META_CHIP_TEXT_MAX_WIDTH,
              color: textColor,
            }}
          >
            {config.text}
          </span>
        </div>
      </div>
    </Tooltip>
  )
}

// ─── 筛选弹出面板组件 ───
const CheckboxFilterDropdown = ({ options, value, onChange, onConfirm, onReset, locked = false }) => (
  <div style={{ padding: 12, minWidth: 180 }} onClick={(e) => e.stopPropagation()}>
    <Checkbox.Group
      value={value}
      onChange={locked ? undefined : onChange}
      style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      {options.map((opt) => (
        <Checkbox
          key={typeof opt === 'string' ? opt : opt.value}
          value={typeof opt === 'string' ? opt : opt.value}
          disabled={locked}
        >
          {typeof opt === 'string' ? opt : opt.label}
        </Checkbox>
      ))}
    </Checkbox.Group>
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 10,
        borderTop: '1px solid var(--border-color)',
        paddingTop: 8,
      }}
    >
      <Button size="small" type="link" onClick={locked ? undefined : onReset} disabled={locked}>
        清空
      </Button>
      <Button size="small" type="primary" onClick={onConfirm}>
        {locked ? '确定' : '筛选'}
      </Button>
    </div>
  </div>
)

const FileTypeFilterDropdown = ({ categories, value, onChange, onConfirm, onReset }) => {
  const [activeCategoryKey, setActiveCategoryKey] = useState(null)
  const selectedValues = value || []
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues])
  const activeCategory = categories.find((category) => category.key === activeCategoryKey) || null

  useEffect(() => {
    if (activeCategoryKey && !categories.some((category) => category.key === activeCategoryKey)) {
      setActiveCategoryKey(null)
    }
  }, [activeCategoryKey, categories])

  const getCategorySelectionMeta = useCallback((category) => {
    const selectedCount = category.children.filter((item) => selectedSet.has(item)).length
    return {
      selectedCount,
      allChecked: category.children.length > 0 && selectedCount === category.children.length,
      indeterminate: selectedCount > 0 && selectedCount < category.children.length,
    }
  }, [selectedSet])

  return (
    <div
      style={{
        width: 300,
        background: appThemeToken.colorBgContainer,
        borderRadius: 8,
        boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          padding: '10px 12px 8px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        {activeCategory ? (
          <Button
            type="link"
            size="small"
            onClick={() => setActiveCategoryKey(null)}
            style={{ padding: 0, height: 'auto' }}
          >
            返回大类
          </Button>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-color-secondary)' }}>按大类选择子类型</span>
        )}
        <span style={{ fontSize: 12, color: 'var(--text-color-secondary)', whiteSpace: 'nowrap' }}>
          已选 {selectedValues.length} 项
        </span>
      </div>

      <div style={{ maxHeight: 320, overflowY: 'auto', padding: 8 }}>
        {!categories.length ? (
          <div style={{ padding: '20px 12px', fontSize: 12, color: 'var(--text-color-secondary)', textAlign: 'center' }}>
            当前列表暂无可筛选的文档类型
          </div>
        ) : (
          activeCategory ? (
            <div>
              <div
                style={{
                  padding: '4px 4px 10px',
                  marginBottom: 8,
                  borderBottom: `1px solid ${appThemeToken.colorBorder}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <Checkbox
                  checked={getCategorySelectionMeta(activeCategory).allChecked}
                  indeterminate={getCategorySelectionMeta(activeCategory).indeterminate}
                  onChange={(e) => onChange(toggleFilterValues(selectedValues, activeCategory.children, e.target.checked))}
                >
                  {activeCategory.label}
                </Checkbox>
                <span style={{ fontSize: 12, color: 'var(--text-color-secondary)' }}>
                  {getCategorySelectionMeta(activeCategory).selectedCount}/{activeCategory.children.length}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {activeCategory.children.map((child) => (
                  <Checkbox
                    key={child}
                    checked={selectedSet.has(child)}
                    onChange={(e) => onChange(toggleFilterValues(selectedValues, [child], e.target.checked))}
                  >
                    {child}
                  </Checkbox>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {categories.map((category) => {
                const meta = getCategorySelectionMeta(category)
                return (
                  <div
                    key={category.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 4px',
                      borderRadius: 6,
                    }}
                  >
                    <Checkbox
                      checked={meta.allChecked}
                      indeterminate={meta.indeterminate}
                      onChange={(e) => onChange(toggleFilterValues(selectedValues, category.children, e.target.checked))}
                    />
                    <button
                      type="button"
                      onClick={() => setActiveCategoryKey(category.key)}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ fontSize: 14, color: 'var(--text-color)' }}>{category.label}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-color-secondary)' }}>
                        {meta.selectedCount > 0 ? `${meta.selectedCount}/${category.children.length}` : `${category.children.length} 项`}
                      </span>
                    </button>
                    <Button
                      type="text"
                      size="small"
                      onClick={() => setActiveCategoryKey(category.key)}
                      style={{ color: 'var(--text-color-secondary)' }}
                    >
                      <CaretRightOutlined />
                    </Button>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 2,
          borderTop: '1px solid var(--border-color)',
          padding: '8px 12px',
        }}
      >
        <Button size="small" type="link" onClick={onReset}>
          清空
        </Button>
        <Button size="small" type="primary" onClick={onConfirm}>
          筛选
        </Button>
      </div>
    </div>
  )
}

// 筛选下拉 overlay 内容：memo 避免表格 data 更新时整表重渲染导致 overlay 重建（闪烁/多框）
const FilterDropdownOverlayContent = memo(function FilterDropdownOverlayContent({
  filterKey,
  tempFilters,
  setTempFilters,
  onApply,
  onReset,
  options,
}) {
  if (filterKey === 'fileName') {
    return (
      <div style={{ padding: 12, minWidth: 220, background: appThemeToken.colorBgContainer, borderRadius: 8, boxShadow: '0 6px 16px rgba(0,0,0,0.08)' }} onClick={(e) => e.stopPropagation()}>
        <Input
          placeholder="搜索文件名或患者姓名..."
          prefix={<SearchOutlined style={{ color: 'var(--text-color-secondary)' }} />}
          allowClear
          value={tempFilters.fileName || ''}
          onChange={(e) => setTempFilters((prev) => ({ ...prev, fileName: e.target.value }))}
          onPressEnter={() => onApply('fileName')}
          style={{ marginBottom: 8 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
          <Button size="small" type="link" onClick={() => onReset('fileName')}>清空</Button>
          <Button size="small" type="primary" onClick={() => onApply('fileName')}>筛选</Button>
        </div>
      </div>
    )
  }
  if (filterKey === 'dateRange') {
    return (
      <div style={{ padding: 12, background: appThemeToken.colorBgContainer, borderRadius: 8, boxShadow: '0 6px 16px rgba(0,0,0,0.08)' }} onClick={(e) => e.stopPropagation()}>
        <RangePicker
          value={tempFilters.dateRange}
          onChange={(v) => setTempFilters((prev) => ({ ...prev, dateRange: v }))}
          style={{ width: '100%' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <Button size="small" type="link" onClick={() => onReset('dateRange')}>清空</Button>
          <Button size="small" type="primary" onClick={() => onApply('dateRange')}>确认</Button>
        </div>
      </div>
    )
  }
  if (filterKey === 'fileType') {
    return (
      <FileTypeFilterDropdown
        categories={options}
        value={tempFilters.fileType}
        onChange={(v) => setTempFilters((prev) => ({ ...prev, fileType: v }))}
        onConfirm={() => onApply('fileType')}
        onReset={() => onReset('fileType')}
      />
    )
  }
  const isArchivedStatusFilter =
    filterKey === 'taskStatus' &&
    Array.isArray(options) &&
    options.length === 1 &&
    ((typeof options[0] === 'string' && options[0] === 'archived') ||
      (typeof options[0] === 'object' && options[0].value === 'archived'))
  const effectiveValue = isArchivedStatusFilter ? ['archived'] : tempFilters[filterKey]
  return (
    <div style={{ background: appThemeToken.colorBgContainer, borderRadius: 8, boxShadow: '0 6px 16px rgba(0,0,0,0.08)' }}>
      <CheckboxFilterDropdown
        options={options}
        value={effectiveValue}
        onChange={(v) => setTempFilters((prev) => ({ ...prev, [filterKey]: v }))}
        onConfirm={() => onApply(filterKey)}
        onReset={() => onReset(filterKey)}
        locked={isArchivedStatusFilter}
      />
    </div>
  )
})

// ─── 主组件 ───
const FileList = () => {
  const { token } = theme.useToken()
  const { message, modal } = AntdApp.useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialRouteStateRef = useRef(null)
  if (!initialRouteStateRef.current) {
    initialRouteStateRef.current = getRouteStateFromSearchParams(searchParams)
  }
  const routeStateSignatureRef = useRef(getRouteStateSignature(initialRouteStateRef.current))

  // 树数据（用于统计和分组信息）
  const [treeData, setTreeData] = useState(null)
  const [treeLoading, setTreeLoading] = useState(false)
  const treeDataRef = useRef(treeData)
  const treeRefreshingRef = useRef(false)
  const treeRefreshPromiseRef = useRef(null)
  const treeLoadTimerRef = useRef(null)
  const hasLoadedTreeRef = useRef(false)

  // 文件列表
  const [fileList, setFileList] = useState([])
  const [fileListLoading, setFileListLoading] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50, total: 0 })

  // Tab & 筛选 & 排序
  const [activeTab, setActiveTab] = useState(initialRouteStateRef.current.tab)
  const [viewMode, setViewMode] = useState(initialRouteStateRef.current.view)
  const [columnFilters, setColumnFilters] = useState(initialRouteStateRef.current.filters)
  const [sorter, setSorter] = useState({ field: 'created_at', order: 'desc' })

  // 不同 Tab 下处理状态筛选可选项
  const statusOptionsForTab = useMemo(() => {
    if (activeTab === 'archived') {
      return STATUS_OPTIONS.filter((opt) => opt.value === 'archived')
    }
    if (activeTab === 'todo') {
      const allowed = new Set(['pending_archive'])
      return STATUS_OPTIONS.filter((opt) => allowed.has(opt.value))
    }
    if (activeTab === 'parse') {
      const allowed = new Set(['processing', 'error'])
      return STATUS_OPTIONS.filter((opt) => allowed.has(opt.value))
    }
    return STATUS_OPTIONS
  }, [activeTab])

  // 选中（仅文件行）
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  // 批量手动选择归档弹窗（选择患者归档）的 loading
  const [batchProcessing, setBatchProcessing] = useState(false)

  // 批量操作区按钮：避免三个按钮公用同一个 loading 导致同时转圈
  const [batchReidentifyLoading, setBatchReidentifyLoading] = useState(false)
  const [batchConfirmArchiveLoading, setBatchConfirmArchiveLoading] = useState(false)
  const [batchDeleteLoading, setBatchDeleteLoading] = useState(false)

  // 展开的分组
  const [expandedGroups, setExpandedGroups] = useState([])
  const [activeGroupKey, setActiveGroupKey] = useState(null)
  const [patientGroupPanelWidth, setPatientGroupPanelWidth] = useState(FILE_LIST_GROUP_PANEL_DEFAULT_WIDTH)
  const [isGroupSplitterDragging, setIsGroupSplitterDragging] = useState(false)
  const [isGroupSplitterHover, setIsGroupSplitterHover] = useState(false)
  const [columnWidths, setColumnWidths] = useState(FILE_LIST_COLUMN_DEFAULT_WIDTHS)
  const [resizingColumnKey, setResizingColumnKey] = useState('')
  const [hoveredGroupKey, setHoveredGroupKey] = useState(null)

  // 分组文档缓存 { groupId: { loading, items, matchInfo } }
  const [groupDocsMap, setGroupDocsMap] = useState({})

  // 解析 / AI匹配 轮询状态
  const [startingParseIds, setStartingParseIds] = useState(new Set())
  const [pollingParseIds, setPollingParseIds] = useState(new Set())
  const [matchingDocIds, setMatchingDocIds] = useState(new Set())
  const [matchTaskMap, setMatchTaskMap] = useState(new Map())
  const [pollingAiMatchIds, setPollingAiMatchIds] = useState(new Set())
  const pollingParseIdsRef = useRef(pollingParseIds)
  const matchTaskMapRef = useRef(matchTaskMap)
  const pollingAiMatchIdsRef = useRef(pollingAiMatchIds)
  const statusPollingTimerRef = useRef(null)
  const statusPollingInFlightRef = useRef(false)
  const matchPollingTimerRef = useRef(null)
  const matchPollingInFlightRef = useRef(false)
  const aiMatchPollingTimerRef = useRef(null)
  const aiMatchPollingInFlightRef = useRef(false)
  // Monotonic version counter: each setFileList call from fetchFileList increments this.
  // Polling updates compare against it to avoid overwriting fresh data with stale responses.
  const fileListVersionRef = useRef(0)
  const fetchRequestIdRef = useRef(0)
  useEffect(() => { pollingParseIdsRef.current = pollingParseIds }, [pollingParseIds])
  useEffect(() => { matchTaskMapRef.current = matchTaskMap }, [matchTaskMap])
  useEffect(() => { pollingAiMatchIdsRef.current = pollingAiMatchIds }, [pollingAiMatchIds])

  // 自动归档 loading
  const [autoArchivingGroupIds, setAutoArchivingGroupIds] = useState(new Set())

  // 弹窗状态
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [detailRefreshTrigger, setDetailRefreshTrigger] = useState(0)
  const detailModalRef = useRef(null)

  const [createPatientDrawerOpen, setCreatePatientDrawerOpen] = useState(false)
  const [createPatientDocIds, setCreatePatientDocIds] = useState([])
  const [createPatientMode, setCreatePatientMode] = useState('docs')
  const [createPatientGroupId, setCreatePatientGroupId] = useState(null)
  const [createPatientPrefillValues, setCreatePatientPrefillValues] = useState(null)

  const [patientMatchVisible, setPatientMatchVisible] = useState(false)
  const [selectedMatchDocument, setSelectedMatchDocument] = useState(null)
  const [matchModalMode, setMatchModalMode] = useState('change')
  const [patientSearchValue, setPatientSearchValue] = useState('')
  const [patientSearchResults, setPatientSearchResults] = useState([])
  const [patientSearchLoading, setPatientSearchLoading] = useState(false)
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [selectedMatchPatient, setSelectedMatchPatient] = useState(null)
  const [archivingLoading, setArchivingLoading] = useState(false)
  const [matchInfoLoading, setMatchInfoLoading] = useState(false)

  // 分组手动选择归档
  const [groupManualArchiveVisible, setGroupManualArchiveVisible] = useState(false)
  const [groupManualArchiveGroupId, setGroupManualArchiveGroupId] = useState(null)
  const [groupPatientSearchValue, setGroupPatientSearchValue] = useState('')
  const [groupPatientSearchResults, setGroupPatientSearchResults] = useState([])
  const [groupPatientSearchLoading, setGroupPatientSearchLoading] = useState(false)
  const [selectedGroupPatient, setSelectedGroupPatient] = useState(null)
  const groupSearchTimerRef = useRef(null)
  const groupSearchVersionRef = useRef(0)

  // 批量手动选择归档
  const [batchManualArchiveVisible, setBatchManualArchiveVisible] = useState(false)
  const [batchPatientSearchValue, setBatchPatientSearchValue] = useState('')
  const [batchPatientSearchResults, setBatchPatientSearchResults] = useState([])
  const [batchPatientSearchLoading, setBatchPatientSearchLoading] = useState(false)
  const [selectedBatchPatient, setSelectedBatchPatient] = useState(null)
  const batchSearchTimerRef = useRef(null)
  const batchSearchVersionRef = useRef(0)

  // 上传
  const [uploadModalVisible, setUploadModalVisible] = useState(false)
  const fileInputRef = useRef(null)
  const folderInputRef = useRef(null)
  const userId = useSelector((state) => state.user.userInfo?.id)
  const searchTimerRef = useRef(null)
  const searchVersionRef = useRef(0)

  const uploadManager = useUploadManager({
    userId,
    concurrency: 3,
    maxRetries: 3,
    onTaskComplete: (task) => {
      if (task.status === UploadStatus.SUCCESS) refreshAll({ forceTree: true })
    },
    onAllComplete: ({ successCount, failedCount }) => {
      if (successCount > 0 && failedCount === 0) message.success(`全部 ${successCount} 个文件上传成功`)
      else if (successCount > 0) message.warning(`上传完成：${successCount} 个成功，${failedCount} 个失败`)
      else if (failedCount > 0) message.error(`${failedCount} 个文件上传失败`)
      refreshAll({ forceTree: true })
    },
  })

  // 每次路由或查询参数变化时，将视图滚动到页面顶部，确保 Tab 区域可见（例如从仪表盘跳转过来）
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [location.pathname, location.search])

  // ─── 数据获取 ───
  const fetchFileList = useCallback(async () => {
    const requestId = ++fetchRequestIdRef.current
    setFileListLoading(true)
    try {
      const params = {
        page: pagination.current,
        page_size: pagination.pageSize,
        order_by: sorter.field || 'created_at',
        order_direction: sorter.order || 'desc',
      }
      if (columnFilters.fileName) params.keyword = columnFilters.fileName
      const tabStatus = TAB_STATUS_MAP[activeTab]
      const selectedTaskStatuses = expandStageFiltersToTaskStatuses(columnFilters.taskStatus)
      if (selectedTaskStatuses.length > 0) {
        params.task_status = selectedTaskStatuses.join(',')
      } else if (tabStatus) {
        params.task_status = tabStatus
      }
      if (columnFilters.fileType && columnFilters.fileType.length > 0) {
        // 与后端 Document.document_sub_type / document_type 文本一致，逗号分隔传递
        params.document_types = columnFilters.fileType.join(',')
      }
      if (columnFilters.dateRange && columnFilters.dateRange.length === 2) {
        params.date_from = columnFilters.dateRange[0].format('YYYY-MM-DD')
        params.date_to = columnFilters.dateRange[1].format('YYYY-MM-DD')
      }

      const response = await searchUserFiles(params)
      if (requestId !== fetchRequestIdRef.current) return
      if (response.success && response.data) {
        let items = response.data.items || []

        // 前端列筛选（文件类型、处理阶段、状态信息）
        if (columnFilters.fileType.length) {
          items = items.filter((it) => {
            const t = it.document_sub_type || it.document_type || '未分类'
            return columnFilters.fileType.includes(t)
          })
        }
        if (columnFilters.taskStatus.length) {
          items = items.filter((it) => columnFilters.taskStatus.includes(mapTaskStatusToStage(it.task_status)))
        }
        if (columnFilters.statusInfo.length) {
          const si = columnFilters.statusInfo
          items = items.filter((it) => {
            const ts = it.task_status
            // 与「状态信息」列 render 逻辑完全对应（优先级相同）
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

        fileListVersionRef.current += 1
        setFileList(items)

        // 加入轮询（包含 uploaded 状态，持续刷新刚上传文件的状态）
        const parsingIds = items
          .filter((it) => ['uploaded', 'parsing'].includes(it.task_status))
          .map((it) => it.id)
        if (parsingIds.length)
          setPollingParseIds((prev) => {
            const next = new Set(prev)
            parsingIds.forEach((id) => next.add(id))
            return next
          })
        const aiMatchingIds = items.filter((it) => it.task_status === 'ai_matching').map((it) => it.id)
        if (aiMatchingIds.length) {
          setMatchingDocIds((prev) => {
            const next = new Set(prev)
            aiMatchingIds.forEach((id) => next.add(id))
            return next
          })
          setPollingAiMatchIds((prev) => {
            const next = new Set(prev)
            aiMatchingIds.forEach((id) => next.add(id))
            return next
          })
        }
        setPagination((prev) => ({ ...prev, total: response.data.total || 0 }))
      }
    } catch (error) {
      if (requestId !== fetchRequestIdRef.current) return
      console.error('获取文件列表失败:', error)
      message.error('获取文件列表失败')
    } finally {
      if (requestId === fetchRequestIdRef.current) setFileListLoading(false)
    }
  }, [pagination.current, pagination.pageSize, activeTab, columnFilters, sorter])

  const fetchTree = useCallback(async (options = {}) => {
    const { force = false } = options
    setTreeLoading(true)
    try {
      const res = await getFileListV2Tree(force ? { refresh: true } : {})
      if (res?.success) {
        const data = res.data
        hasLoadedTreeRef.current = true
        setTreeData(data)

        // 若是强制刷新（例如元数据修改后重建分组），需要把已展开分组与最新树结构对齐：
        // - 仍存在于新树的分组：保留展开状态
        // - 已不存在的分组：移除，避免继续用旧 groupId 请求导致 40404
        if (force && data) {
          const validKeys = new Set()
          const todoGroups = Array.isArray(data.todo_groups) ? data.todo_groups : []
          const archivedPatients = Array.isArray(data.archived_patients) ? data.archived_patients : []
          todoGroups.forEach((g) => {
            if (g?.group_id) validKeys.add(`group:${g.group_id}`)
          })
          archivedPatients.forEach((p) => {
            if (p?.patient_id) validKeys.add(`patient:${p.patient_id}`)
          })
          setExpandedGroups((prev) => prev.filter((key) => validKeys.has(key)))
        }
        return data
      } else {
        setTreeData(null)
        return null
      }
    } catch {
      setTreeData(null)
      return null
    } finally {
      setTreeLoading(false)
    }
  }, [])

  const refreshAll = useCallback(
    async (options = {}) => {
      const { forceTree = false } = options
      if (forceTree) {
        treeRefreshingRef.current = true
        try {
          // 先刷新树并对齐 expandedGroups，再刷新列表并清空分组缓存，避免旧 groupId 先发请求
          const treeRefreshPromise = fetchTree({ force: true })
          treeRefreshPromiseRef.current = treeRefreshPromise
          await treeRefreshPromise
          await fetchFileList()
          setGroupDocsMap({})
        } finally {
          treeRefreshPromiseRef.current = null
          treeRefreshingRef.current = false
        }
        return
      }
      fetchFileList()
      if (hasLoadedTreeRef.current || viewMode === 'patient') {
        fetchTree({ force: false })
        setGroupDocsMap({})
      }
    },
    [fetchTree, fetchFileList, viewMode]
  )
  useEffect(() => {
    treeDataRef.current = treeData
  }, [treeData])


  useEffect(() => {
    const nextRouteState = getRouteStateFromSearchParams(searchParams)
    const nextSignature = getRouteStateSignature(nextRouteState)
    if (nextSignature === routeStateSignatureRef.current) return

    routeStateSignatureRef.current = nextSignature
    fetchRequestIdRef.current += 1
    setFileList([])
    setActiveTab(nextRouteState.tab)
    setViewMode(nextRouteState.view)
    setColumnFilters(nextRouteState.filters)
    setTempFilters(nextRouteState.filters)
    setSelectedRowKeys([])
    setExpandedGroups([])
    setPagination((prev) => ({ ...prev, current: 1, total: 0 }))
  }, [searchParams])

  useEffect(() => {
    if (searchParams.get('openUpload') !== '1') return
    setUploadModalVisible(true)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('openUpload')
    setSearchParams(nextParams, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => { fetchFileList() }, [fetchFileList])
  useEffect(() => {
    if (treeLoadTimerRef.current) clearTimeout(treeLoadTimerRef.current)
    treeLoadTimerRef.current = window.setTimeout(() => {
      fetchTree()
    }, FILE_LIST_TREE_DEFER_MS)
    return () => {
      if (treeLoadTimerRef.current) clearTimeout(treeLoadTimerRef.current)
    }
  }, [fetchTree])

  // ─── 轮询：解析状态 ───
  useEffect(() => {
    const POLL_INTERVAL = 2000
    const startPolling = () => {
      if (statusPollingTimerRef.current) return
      const tick = async () => {
        const ids = Array.from(pollingParseIdsRef.current || [])
        if (!ids.length || statusPollingInFlightRef.current) return
        statusPollingInFlightRef.current = true
        const versionBefore = fileListVersionRef.current
        try {
          const res = await getFileStatusesByIds(ids)
          if (fileListVersionRef.current !== versionBefore) return
          const items = res?.data?.items || []
          if (res?.success && items.length) {
            const byId = new Map(items.map((it) => [it.id, it]))
            setFileList((prev) => prev.map((item) => {
              const updated = byId.get(item.id)
              return updated ? { ...item, ...updated } : item
            }))
            const IN_PROGRESS = new Set(['uploaded', 'parsing', 'ai_matching'])
            const completed = items.filter((it) => it.task_status && !IN_PROGRESS.has(it.task_status))
            if (completed.length) {
              setPollingParseIds((prev) => {
                const next = new Set(prev)
                completed.forEach((it) => next.delete(it.id))
                return next
              })
              if (completed.some((it) => !['uploaded', 'parse_failed'].includes(it.task_status)))
                refreshAll({ forceTree: true })
            }
          }
        } catch (e) {
          console.error('轮询解析状态失败:', e)
        } finally {
          statusPollingInFlightRef.current = false
        }
      }
      setTimeout(tick, 0)
      statusPollingTimerRef.current = setInterval(tick, POLL_INTERVAL)
    }
    const stop = () => {
      if (statusPollingTimerRef.current) {
        clearInterval(statusPollingTimerRef.current)
        statusPollingTimerRef.current = null
      }
    }
    if (pollingParseIds.size > 0) startPolling()
    else stop()
    return stop
  }, [pollingParseIds.size, refreshAll])

  // ─── 轮询：AI匹配任务 ───
  useEffect(() => {
    const POLL_INTERVAL = 3000
    const start = () => {
      if (matchPollingTimerRef.current) return
      const tick = async () => {
        const entries = Array.from(matchTaskMapRef.current || [])
        if (!entries.length || matchPollingInFlightRef.current) return
        matchPollingInFlightRef.current = true
        try {
          const completedDocIds = []
          const failedDocIds = []
          for (const [documentId, taskId] of entries) {
            try {
              const res = await getDocumentTaskProgress(taskId, { silent: true })
              if (res?.success && res?.data) {
                if (res.data.status === 'completed') completedDocIds.push(documentId)
                else if (res.data.status === 'failed') failedDocIds.push({ documentId })
              }
            } catch {}
          }
          if (completedDocIds.length || failedDocIds.length) {
            setMatchingDocIds((prev) => {
              const next = new Set(prev)
              completedDocIds.forEach((id) => next.delete(id))
              failedDocIds.forEach(({ documentId }) => next.delete(documentId))
              return next
            })
            setMatchTaskMap((prev) => {
              const next = new Map(prev)
              completedDocIds.forEach((id) => next.delete(id))
              failedDocIds.forEach(({ documentId }) => next.delete(documentId))
              return next
            })
            const allDone = [...completedDocIds, ...failedDocIds.map((f) => f.documentId)]
            if (allDone.length) {
              try {
                const vBefore = fileListVersionRef.current
                const r = await getFileStatusesByIds(allDone)
                if (r?.success && r?.data?.items && fileListVersionRef.current === vBefore) {
                  const byId = new Map(r.data.items.map((it) => [it.id, it]))
                  setFileList((prev) => prev.map((item) => {
                    const updated = byId.get(item.id)
                    return updated ? { ...item, ...updated } : item
                  }))
                }
              } catch {}
            }
            if (completedDocIds.length) {
              message.success(`${completedDocIds.length} 个文档 AI 匹配完成`)
              refreshAll({ forceTree: true })
            }
            if (failedDocIds.length) message.error(`${failedDocIds.length} 个文档 AI 匹配失败`)
          }
        } catch {} finally {
          matchPollingInFlightRef.current = false
        }
      }
      setTimeout(tick, 0)
      matchPollingTimerRef.current = setInterval(tick, POLL_INTERVAL)
    }
    const stop = () => {
      if (matchPollingTimerRef.current) {
        clearInterval(matchPollingTimerRef.current)
        matchPollingTimerRef.current = null
      }
    }
    if (matchTaskMap.size > 0) start()
    else stop()
    return stop
  }, [matchTaskMap.size, refreshAll])

  // ─── 轮询：后台AI匹配 ───
  useEffect(() => {
    const POLL_INTERVAL = 3000
    const start = () => {
      if (aiMatchPollingTimerRef.current) return
      const tick = async () => {
        const ids = Array.from(pollingAiMatchIdsRef.current || [])
        if (!ids.length || aiMatchPollingInFlightRef.current) return
        aiMatchPollingInFlightRef.current = true
        const vBefore = fileListVersionRef.current
        try {
          const res = await getFileStatusesByIds(ids)
          if (fileListVersionRef.current !== vBefore) return
          const items = res?.data?.items || []
          if (res?.success && items.length) {
            setFileList((prev) => prev.map((item) => {
              const updated = items.find((it) => it.id === item.id)
              return updated ? { ...item, ...updated } : item
            }))
            const completed = items.filter((it) => it.task_status && it.task_status !== 'ai_matching')
            if (completed.length) {
              setPollingAiMatchIds((prev) => {
                const next = new Set(prev)
                completed.forEach((it) => next.delete(it.id))
                return next
              })
              setMatchingDocIds((prev) => {
                const next = new Set(prev)
                completed.forEach((it) => next.delete(it.id))
                return next
              })
              const matched = completed.filter((it) =>
                ['pending_confirm_new', 'pending_confirm_review', 'pending_confirm_uncertain', 'auto_archived'].includes(it.task_status)
              ).length
              if (matched) {
                message.success(`${matched} 个文档 AI 匹配完成`)
                refreshAll({ forceTree: true })
              }
            }
          }
        } catch {} finally {
          aiMatchPollingInFlightRef.current = false
        }
      }
      setTimeout(tick, 0)
      aiMatchPollingTimerRef.current = setInterval(tick, POLL_INTERVAL)
    }
    const stop = () => {
      if (aiMatchPollingTimerRef.current) {
        clearInterval(aiMatchPollingTimerRef.current)
        aiMatchPollingTimerRef.current = null
      }
    }
    if (pollingAiMatchIds.size > 0) start()
    else stop()
    return stop
  }, [pollingAiMatchIds.size, refreshAll])

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
      if (statusPollingTimerRef.current) clearInterval(statusPollingTimerRef.current)
      if (matchPollingTimerRef.current) clearInterval(matchPollingTimerRef.current)
      if (aiMatchPollingTimerRef.current) clearInterval(aiMatchPollingTimerRef.current)
    }
  }, [])

  // ─── 加载分组内文档 ───
  const loadGroupDocs = useCallback(async (groupId) => {
    if (!groupId) return
    // 若有树强制刷新在进行，等待 tree 返回后再请求组内文档，避免旧 groupId 40404
    if (treeRefreshPromiseRef.current) {
      try {
        await treeRefreshPromiseRef.current
      } catch {
        // noop
      }
    }
    if (treeLoading && !treeDataRef.current) return

    const currentTree = treeDataRef.current
    const validGroupIds = new Set(
      (Array.isArray(currentTree?.todo_groups) ? currentTree.todo_groups : [])
        .map((g) => g?.group_id)
        .filter(Boolean)
    )
    if (!validGroupIds.has(groupId)) {
      setExpandedGroups((prev) => prev.filter((key) => key !== `group:${groupId}`))
      setGroupDocsMap((prev) => ({
        ...prev,
        [groupId]: { loading: false, items: [], error: '分组不存在或已过期' },
      }))
      return
    }

    setGroupDocsMap((prev) => ({ ...prev, [groupId]: { ...(prev[groupId] || {}), loading: true } }))
    try {
      const res = await getFileListV2GroupDocuments(groupId, { page: 1, page_size: 100 })
      if (res?.success) {
        setGroupDocsMap((prev) => ({
          ...prev,
          [groupId]: { loading: false, items: res?.data?.items || [], matchInfo: res?.data?.match_info || null },
        }))
      } else {
        setGroupDocsMap((prev) => ({ ...prev, [groupId]: { loading: false, items: [], error: res?.message } }))
      }
    } catch (e) {
      setGroupDocsMap((prev) => ({ ...prev, [groupId]: { loading: false, items: [], error: e?.message } }))
    }
  }, [treeLoading])

  const loadArchivedPatientDocs = useCallback(async (pid) => {
    if (!pid) return
    setGroupDocsMap((prev) => ({ ...prev, [`patient:${pid}`]: { loading: true } }))
    try {
      const res = await searchUserFiles({ task_status: 'archived', patient_id: pid, page: 1, page_size: 100 })
      if (res?.success) {
        setGroupDocsMap((prev) => ({
          ...prev,
          [`patient:${pid}`]: { loading: false, items: res?.data?.items || [] },
        }))
      } else {
        setGroupDocsMap((prev) => ({ ...prev, [`patient:${pid}`]: { loading: false, items: [] } }))
      }
    } catch {
      setGroupDocsMap((prev) => ({ ...prev, [`patient:${pid}`]: { loading: false, items: [] } }))
    }
  }, [])

  // 只校验已展开分组是否仍存在；分组文档改为点击展开/选中时按需加载，避免首屏批量请求。
  useEffect(() => {
    if (!Array.isArray(expandedGroups) || expandedGroups.length === 0) return
    if (treeLoading || !treeData) return

    const todoGroupIds = new Set(
      (Array.isArray(treeData?.todo_groups) ? treeData.todo_groups : [])
        .map((g) => g?.group_id)
        .filter(Boolean)
    )
    const archivedPatientIds = new Set(
      (Array.isArray(treeData?.archived_patients) ? treeData.archived_patients : [])
        .map((p) => p?.patient_id)
        .filter(Boolean)
    )

    const invalidKeys = expandedGroups.filter((key) => {
      if (key.startsWith('group:')) return !todoGroupIds.has(key.slice('group:'.length))
      if (key.startsWith('patient:')) return !archivedPatientIds.has(key.slice('patient:'.length))
      return false
    })
    if (invalidKeys.length > 0) {
      setExpandedGroups((prev) => prev.filter((key) => !invalidKeys.includes(key)))
    }
  }, [expandedGroups, treeData, treeLoading])

  // 当文件类型 / 状态信息 / 上传时间 / 文件名 筛选激活时，树形分组视图无法正确过滤，切换为扁平列表模式
  const isFilterActive = useMemo(
    () =>
      columnFilters.fileType.length > 0 ||
      columnFilters.statusInfo.length > 0 ||
      !!columnFilters.dateRange ||
      !!columnFilters.fileName,
    [columnFilters]
  )

  const availableFileTypeCategories = useMemo(() => {
    const items = applyColumnFiltersToItems(fileList, getFiltersWithoutKey(columnFilters, 'fileType'))
    const availableValues = new Set([
      ...columnFilters.fileType,
      ...items.map((item) => getDocumentTypeValue(item)),
    ])
    return buildAvailableFileTypeCategories(FILE_TYPE_CATEGORIES, Array.from(availableValues))
  }, [fileList, columnFilters])

  const availableTaskStatusOptions = useMemo(() => {
    const items = applyColumnFiltersToItems(fileList, getFiltersWithoutKey(columnFilters, 'taskStatus'))
    const availableStages = new Set([
      ...columnFilters.taskStatus,
      ...items.map((item) => mapTaskStatusToStage(item.task_status)).filter(Boolean),
    ])
    return statusOptionsForTab.filter((opt) => availableStages.has(opt.value))
  }, [fileList, columnFilters, statusOptionsForTab])

  const availableStatusInfoOptions = useMemo(() => {
    const items = applyColumnFiltersToItems(fileList, getFiltersWithoutKey(columnFilters, 'statusInfo'))
    const availableValues = new Set(columnFilters.statusInfo)
    items.forEach((item) => {
      getStatusInfoValues(item).forEach((value) => availableValues.add(value))
    })
    return STATUS_INFO_OPTIONS.filter((opt) => availableValues.has(opt.value))
  }, [fileList, columnFilters])

  // ─── 构建扁平 TreeTable 数据（分组行 + 子文件行混排） ───
  const formatLabel = (label) => {
    const name = label?.name ? String(label.name).trim() : ''
    const gender = label?.gender || '--'
    const ageRaw = label?.age
    const age = ageRaw != null && String(ageRaw).trim() && String(ageRaw).trim() !== '--'
      ? (String(ageRaw).endsWith('岁') ? String(ageRaw) : `${ageRaw}岁`)
      : '--'
    const maskedName = name ? maskName(name) : ''
    return maskedName ? `${maskedName} · ${gender} · ${age}` : '未知患者'
  }

  const getGroupBadge = (g) => {
    if (g?.is_failed) {
      return { icon: <WarningFilled style={{ fontSize: 14, color: token.colorError }} />, tip: '分组失败' }
    }
    const set = Array.isArray(g?.status_set) ? g.status_set : []
    if (set.includes('auto_archived')) {
      return { icon: <CheckCircleFilled style={{ fontSize: 14, color: token.colorSuccess }} />, tip: '优选' }
    }
    if (set.includes('pending_confirm_review')) {
      return { icon: <ClockCircleFilled style={{ fontSize: 14, color: token.colorWarning }} />, tip: '候选' }
    }
    if (set.includes('pending_confirm_uncertain')) {
      return { icon: <ExclamationCircleFilled style={{ fontSize: 14, color: token.colorWarning }} />, tip: '信息不足' }
    }
    if (set.includes('pending_confirm_new')) {
      return { icon: <UserAddOutlined style={{ fontSize: 14, color: token.colorPrimary }} />, tip: '新建' }
    }
    return { icon: <QuestionCircleOutlined style={{ fontSize: 14, color: token.colorTextSecondary }} />, tip: '待确认' }
  }


  const todoDocumentStatusMap = useMemo(() => {
    const map = new Map()
    const todoGroups = Array.isArray(treeData?.todo_groups) ? treeData.todo_groups : []
    todoGroups.forEach((group) => {
      const groupStatus = Array.isArray(group?.status_set) && group.status_set.length
        ? group.status_set[0]
        : 'pending_confirm_uncertain'
      if (Array.isArray(group?.document_ids)) {
        group.document_ids.forEach((id) => map.set(id, groupStatus))
      }
    })
    return map
  }, [treeData])

  const groupedTodoDocumentIds = useMemo(
    () => new Set(
      Array.from(todoDocumentStatusMap.entries())
        .filter(([, status]) => TODO_STAGE_TASK_STATUSES.includes(status))
        .map(([id]) => id)
    ),
    [todoDocumentStatusMap]
  )

  const normalizedTreeFileList = useMemo(
    () => fileList.map((item) => {
      const treeStatus = todoDocumentStatusMap.get(item.id)
      return treeStatus ? { ...item, task_status: treeStatus, taskStatus: treeStatus } : item
    }),
    [fileList, todoDocumentStatusMap]
  )

  const treeTableData = useMemo(() => {
    // 筛选激活时：
    //  · 已归档患者 → 从 fileList 按 patient_id 重建患者分组
    //  · 待归档     → 仅保留有命中文档的分组，组内只显示命中文档
    //  · 解析阶段   → 扁平列表
    if (isFilterActive) {
      const rows = []
      const addedIds = new Set()
      const todoStatuses = new Set([
        'pending_confirm_new',
        'pending_confirm_review',
        'pending_confirm_uncertain',
        'auto_archived',
      ])
      const parseStatuses = new Set(['uploaded', 'parsing', 'parse_failed', 'extracted', 'parsed', 'ai_matching'])

      // ── 已归档：按 patient_id 重建患者分组 ──
      if (activeTab === 'all' || activeTab === 'archived') {
        const patientMap = new Map()
        for (const item of fileList) {
          const pid = item.patient_info?.patient_id
          if (!pid) continue
          // all Tab 只聚合真正已归档的（避免把 auto_archived 待确认项误放入归档组）
          if (activeTab === 'all' && item.task_status !== 'archived') continue
          if (!patientMap.has(pid)) {
            patientMap.set(pid, { pid, info: item.patient_info, items: [] })
          }
          patientMap.get(pid).items.push(item)
          addedIds.add(item.id)
        }
        for (const [pid, group] of patientMap) {
          const isExpanded = expandedGroups.includes(`patient:${pid}`)
          rows.push({
            key: `patient:${pid}`,
            _isGroup: true,
            _groupType: 'archived',
            _patientId: pid,
            _patientDeleted: false,
            _label: formatLabel(group.info),
            _count: group.items.length,
            _badge: { icon: <CheckCircleFilled style={{ fontSize: 14, color: token.colorSuccess }} />, tip: '已归档' },
            _loading: false,
          })
          if (isExpanded) {
            for (const item of group.items) {
              rows.push({ ...item, _isFile: true, _patientId: pid, key: item.id, _indent: 1 })
            }
          }
        }
      }

      // ── 待归档：仅保留有命中文档的分组 ──
      if (activeTab === 'all' || activeTab === 'todo') {
        const todoGroups = treeData?.todo_groups || []
        const seen = new Set()

        for (const g of todoGroups) {
          if (!g?.group_id || seen.has(g.group_id)) continue
          seen.add(g.group_id)

          const groupDocumentIds = new Set(Array.isArray(g.document_ids) ? g.document_ids : [])
          const groupStatus = Array.isArray(g.status_set) && g.status_set.length ? g.status_set[0] : 'pending_confirm_uncertain'
          const matchedItems = normalizedTreeFileList
            .filter((item) => !addedIds.has(item.id) && groupDocumentIds.has(item.id))
            .map((item) => ({ ...item, task_status: todoStatuses.has(item.task_status) ? item.task_status : groupStatus }))

          if (!matchedItems.length) continue

          const isExpanded = expandedGroups.includes(`group:${g.group_id}`)
          rows.push({
            key: `group:${g.group_id}`,
            _isGroup: true,
            _groupType: 'todo',
            _groupId: g.group_id,
            _label: formatLabel(g.label),
            _count: matchedItems.length,
            _badge: getGroupBadge(g),
            _loading: false,
            _matchInfo: groupDocsMap[g.group_id]?.matchInfo,
            _statusSet: Array.from(new Set(matchedItems.map((item) => item.task_status).filter(Boolean))),
          })

          matchedItems.forEach((item) => addedIds.add(item.id))

          if (isExpanded) {
            matchedItems.forEach((item) => {
              rows.push({ ...item, _isFile: true, _groupId: g.group_id, key: item.id, _indent: 1 })
            })
          }
        }

        // 兜底：若有命中的待归档文档未出现在分组树中，则以扁平文件行展示
        for (const item of normalizedTreeFileList) {
          if (addedIds.has(item.id)) continue
          if (todoStatuses.has(item.task_status)) {
            rows.push({ ...item, _isFile: true, key: item.id })
          }
        }
      }

      // ── 解析阶段（parse tab）：扁平显示 ──
      if (activeTab === 'parse') {
        for (const item of fileList) {
          rows.push({ ...item, _isFile: true, key: item.id })
        }
      }

      // ── all tab：未被患者分组收录的解析阶段项，扁平显示 ──
      if (activeTab === 'all') {
        for (const item of fileList) {
          if (addedIds.has(item.id)) continue
          if (parseStatuses.has(item.task_status)) {
            rows.push({ ...item, _isFile: true, key: item.id })
          }
        }
      }

      return rows
    }

    const todoGroups = treeData?.todo_groups || []
    const archivedPatients = treeData?.archived_patients || []
    const rows = []
    const selectedStatuses = columnFilters.taskStatus || []
    const hasStatusFilter = selectedStatuses.length > 0

    if (activeTab === 'all' || activeTab === 'todo') {
      const seen = new Set()
      for (const g of todoGroups) {
        if (!g?.group_id || seen.has(g.group_id)) continue
        seen.add(g.group_id)
        const statusSet = Array.isArray(g?.status_set) ? g.status_set : []
        // 如果当前有处理阶段筛选，只保留与选中阶段有交集的分组
        if (hasStatusFilter && !statusSet.some((s) => selectedStatuses.includes(mapTaskStatusToStage(s)))) continue

        const badge = getGroupBadge(g)
        const cached = groupDocsMap[g.group_id]
        const isExpanded = expandedGroups.includes(`group:${g.group_id}`)
        rows.push({
          key: `group:${g.group_id}`,
          _isGroup: true,
          _groupType: 'todo',
          _groupId: g.group_id,
          _label: formatLabel(g.label),
          _count: g.count || 0,
          _badge: badge,
          _loading: cached?.loading,
          _matchInfo: cached?.matchInfo,
          _statusSet: statusSet,
        })
        if (isExpanded && cached?.items) {
          for (const item of cached.items) {
            rows.push({ ...item, _isFile: true, _groupId: g.group_id, key: item.id, _indent: 1 })
          }
        }
      }
    }

    if (activeTab === 'all' || activeTab === 'archived') {
      const seen = new Set()
      for (const p of archivedPatients) {
        if (!p?.patient_id || seen.has(p.patient_id)) continue
        // 已归档分组：如果有状态筛选且不包含 archived，则在「全部」视图里隐藏这些分组
        if (hasStatusFilter && !selectedStatuses.includes('archived')) continue

        seen.add(p.patient_id)
        const cached = groupDocsMap[`patient:${p.patient_id}`]
        const isExpanded = expandedGroups.includes(`patient:${p.patient_id}`)
        const isPatientDeleted = p.patient_status === 'inactive'
        rows.push({
          key: `patient:${p.patient_id}`,
          _isGroup: true,
          _groupType: 'archived',
          _patientId: p.patient_id,
          _patientDeleted: isPatientDeleted,
          _label: formatLabel(p.label),
          _count: p.count || 0,
          _badge: isPatientDeleted
            ? { icon: <CloseCircleFilled style={{ fontSize: 14, color: token.colorError }} />, tip: '患者已删除' }
            : { icon: <CheckCircleFilled style={{ fontSize: 14, color: token.colorSuccess }} />, tip: '已归档' },
          _loading: cached?.loading,
        })
        if (isExpanded && cached?.items) {
          for (const item of cached.items) {
            rows.push({ ...item, _isFile: true, _patientId: p.patient_id, key: item.id, _indent: 1 })
          }
        }
      }
    }

    if (activeTab === 'parse') {
      for (const item of fileList) {
        rows.push({ ...item, _isFile: true, key: item.id })
      }
    }

    if (activeTab === 'all') {
      const groupedFileIds = new Set()
      for (const r of rows) {
        if (r._isFile) groupedFileIds.add(r.key)
      }
      for (const group of todoGroups) {
        if (Array.isArray(group?.document_ids)) group.document_ids.forEach((id) => groupedFileIds.add(id))
      }
      for (const item of normalizedTreeFileList) {
        if (!groupedFileIds.has(item.id)) {
          const isParsePhase = ['uploaded', 'parsing', 'parse_failed', 'parsed', 'extracted', 'ai_matching'].includes(item.task_status)
          if (isParsePhase) {
            rows.push({ ...item, _isFile: true, key: item.id })
          }
        }
      }
    }

    return rows
  }, [fileList, normalizedTreeFileList, treeData, activeTab, groupDocsMap, expandedGroups, columnFilters, isFilterActive])

  /**
   * 按文件 ID 聚合当前页面已加载文件记录，统一供批量与弹窗逻辑复用。
   *
   * @type {Map<string|number, Record<string, any>>}
   */
  const fileRecordMap = useMemo(() => {
    const map = new Map()
    fileList.forEach((item) => {
      if (item?.id != null) map.set(item.id, item)
    })
    treeTableData.forEach((item) => {
      if (item?._isFile && item?.id != null && !map.has(item.id)) {
        map.set(item.id, item)
      }
    })
    return map
  }, [fileList, treeTableData])


  const pendingParseFiles = useMemo(
    () => normalizedTreeFileList
      .filter((item) => PARSE_STAGE_TASK_STATUSES.includes(item.task_status) && !groupedTodoDocumentIds.has(item.id))
      .map((item) => ({ ...item, _isFile: true, key: item.id, _groupType: 'pending_parse' })),
    [normalizedTreeFileList, groupedTodoDocumentIds]
  )

  const patientGroupList = useMemo(() => {
    const groups = treeTableData.filter((item) => item?._isGroup)
    if (!pendingParseFiles.length) return groups

    const pendingParseGroup = {
      key: VIRTUAL_PENDING_PARSE_GROUP_KEY,
      _isGroup: true,
      _groupType: 'pending_parse',
      _label: '待分组文件',
      _count: pendingParseFiles.length,
      _badge: { icon: <FolderOpenOutlined style={{ fontSize: 14, color: token.colorPrimary }} />, tip: '解析阶段文件暂存容器' },
      _loading: false,
      _statusSet: PARSE_STAGE_TASK_STATUSES,
    }
    if (activeTab === 'parse') return [pendingParseGroup]
    return [pendingParseGroup, ...groups]
  }, [activeTab, pendingParseFiles, treeTableData])

  useEffect(() => {
    if (viewMode !== 'patient') {
      setActiveGroupKey(null)
      return
    }
    if (!patientGroupList.length) {
      if (activeGroupKey) setActiveGroupKey(null)
      return
    }
    const hasCurrent = patientGroupList.some((item) => item.key === activeGroupKey)
    if (!hasCurrent) {
      setActiveGroupKey(patientGroupList[0].key)
    }
  }, [activeGroupKey, patientGroupList, viewMode])

  useEffect(() => {
    if (viewMode !== 'patient' || !activeGroupKey) return
    if (activeGroupKey.startsWith('group:')) {
      const groupId = activeGroupKey.slice('group:'.length)
      if (!groupId) return
      const cached = groupDocsMap[groupId]
      if (!cached || (!cached.loading && !Array.isArray(cached.items))) {
        loadGroupDocs(groupId)
      }
      return
    }
    if (activeGroupKey.startsWith('patient:')) {
      const patientId = activeGroupKey.slice('patient:'.length)
      if (!patientId) return
      const cached = groupDocsMap[`patient:${patientId}`]
      if (!cached || (!cached.loading && !Array.isArray(cached.items))) {
        loadArchivedPatientDocs(patientId)
      }
    }
  }, [activeGroupKey, groupDocsMap, loadArchivedPatientDocs, loadGroupDocs, viewMode])

  const patientRightPaneDataSource = useMemo(() => {
    if (!activeGroupKey) return []
    if (activeGroupKey === VIRTUAL_PENDING_PARSE_GROUP_KEY) {
      return pendingParseFiles
    }
    if (activeGroupKey.startsWith('group:')) {
      const groupId = activeGroupKey.slice('group:'.length)
      if (!groupId) return []
      if (isFilterActive) {
        const todoGroups = Array.isArray(treeData?.todo_groups) ? treeData.todo_groups : []
        const targetGroup = todoGroups.find((item) => item?.group_id === groupId)
        const groupDocumentIds = new Set(Array.isArray(targetGroup?.document_ids) ? targetGroup.document_ids : [])
        return normalizedTreeFileList
          .filter((item) => TODO_STAGE_TASK_STATUSES.includes(item.task_status) && groupDocumentIds.has(item.id))
          .map((item) => ({ ...item, _isFile: true, _groupId: groupId, key: item.id }))
      }
      const cachedItems = groupDocsMap[groupId]?.items
      if (!Array.isArray(cachedItems)) return []
      return cachedItems.map((item) => ({ ...item, _isFile: true, _groupId: groupId, key: item.id }))
    }
    if (activeGroupKey.startsWith('patient:')) {
      const patientId = activeGroupKey.slice('patient:'.length)
      if (!patientId) return []
      if (isFilterActive) {
        return fileList
          .filter((item) => item?.patient_info?.patient_id === patientId && item.task_status === 'archived')
          .map((item) => ({ ...item, _isFile: true, _patientId: patientId, key: item.id }))
      }
      const cachedItems = groupDocsMap[`patient:${patientId}`]?.items
      if (!Array.isArray(cachedItems)) return []
      return cachedItems.map((item) => ({ ...item, _isFile: true, _patientId: patientId, key: item.id }))
    }
    return []
  }, [activeGroupKey, fileList, normalizedTreeFileList, groupDocsMap, isFilterActive, pendingParseFiles, treeData])

  const displayDataSource = useMemo(() => {
    if (viewMode === 'patient') return patientRightPaneDataSource
    return fileList.map((item) => ({ ...item, _isFile: true, key: item.id }))
  }, [fileList, patientRightPaneDataSource, viewMode])

  const tablePagination = useMemo(() => {
    if (viewMode === 'table') {
      return {
        current: pagination.current,
        pageSize: pagination.pageSize,
        total: pagination.total,
        showSizeChanger: true,
        showQuickJumper: pagination.total > pagination.pageSize,
        showTotal: (total) => `共 ${total} 项`,
        onChange: (page, pageSize) => {
          setPagination((prev) => ({ ...prev, current: page, pageSize }))
          setSelectedRowKeys([])
        },
      }
    }

    if (activeTab === 'parse' || isFilterActive) {
      return {
        current: pagination.current,
        pageSize: pagination.pageSize,
        total: pagination.total,
        showSizeChanger: true,
        showTotal: (total) => `共 ${total} 项`,
        onChange: (page, pageSize) => {
          setPagination((prev) => ({ ...prev, current: page, pageSize }))
          setSelectedRowKeys([])
        },
      }
    }

    return false
  }, [activeTab, isFilterActive, pagination.current, pagination.pageSize, pagination.total, viewMode])

  // ─── Tab 统计 ───
  const tabCounts = useMemo(() => {
    const c = treeData?.counts || {}
    return {
      all: treeData?.total || 0,
      parse: c.parse_total || 0,
      todo: c.todo_total || 0,
      archived: c.archived_total || 0,
    }
  }, [treeData])

  // ─── 展开/折叠控制 ───
  const toggleGroup = useCallback(
    (record) => {
      const key = record.key
      const isExpanded = expandedGroups.includes(key)
      if (isExpanded) {
        setExpandedGroups((prev) => prev.filter((k) => k !== key))
      } else {
        setExpandedGroups((prev) => [...prev, key])
        if (record._groupType === 'todo' && record._groupId) {
          const cached = groupDocsMap[record._groupId]
          if (!cached || (!cached.loading && !Array.isArray(cached.items))) loadGroupDocs(record._groupId)
        }
        if (record._groupType === 'archived' && record._patientId) {
          const cached = groupDocsMap[`patient:${record._patientId}`]
          if (!cached || (!cached.loading && !Array.isArray(cached.items))) loadArchivedPatientDocs(record._patientId)
        }
      }
    },
    [expandedGroups, groupDocsMap, loadGroupDocs, loadArchivedPatientDocs]
  )

  // ─── 操作处理器 ───
  const handleParseDocument = useCallback(async (documentId) => {
    setStartingParseIds((prev) => new Set([...prev, documentId]))
    try {
      const response = await parseDocument(documentId)
      setStartingParseIds((prev) => {
        const n = new Set(prev); n.delete(documentId); return n
      })
      if (response.success) {
        message.success('解析任务已启动')
        setFileList((prev) => prev.map((f) => (f.id === documentId ? { ...f, task_status: 'parsing' } : f)))
        setPollingParseIds((prev) => new Set([...prev, documentId]))
      } else {
        message.error(response.message || '解析启动失败')
      }
    } catch {
      message.error('解析文档失败')
      setStartingParseIds((prev) => {
        const n = new Set(prev); n.delete(documentId); return n
      })
    }
  }, [])

  const handleAiMatchPatient = useCallback(async (documentId) => {
    setMatchingDocIds((prev) => new Set([...prev, documentId]))
    try {
      const response = await aiMatchPatientAsync(documentId)
      if (response.success && response.data?.task_id) {
        message.info('AI 匹配任务已启动')
        setFileList((prev) => prev.map((f) => (f.id === documentId ? { ...f, task_status: 'ai_matching' } : f)))
        setMatchTaskMap((prev) => {
          const n = new Map(prev); n.set(documentId, response.data.task_id); return n
        })
      } else {
        message.error(response.message || 'AI 匹配启动失败')
        setMatchingDocIds((prev) => {
          const n = new Set(prev); n.delete(documentId); return n
        })
      }
    } catch {
      message.error('AI匹配患者失败')
      setMatchingDocIds((prev) => {
        const n = new Set(prev); n.delete(documentId); return n
      })
    }
  }, [])

  const handleDeleteDocument = useCallback((documentId, fileName) => {
    modal.confirm({
      title: '确认删除文档',
      icon: <DeleteOutlined style={{ color: token.colorError }} />,
      content: (
        <div>
          <p>确定要删除文档 <Text strong>{fileName}</Text> 吗？</p>
          <p style={{ color: token.colorError }}>删除操作不可撤销</p>
        </div>
      ),
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      centered: true,
      width: modalWidthPreset.standard,
      onOk: async () => {
        try {
          const response = await deleteDocument(documentId, true)
          if (response.success) {
            message.success('文档删除成功')
            refreshAll({ forceTree: true })
          } else {
            message.error(response.message || '删除失败')
          }
        } catch (error) {
          message.error(error.response?.data?.message || '删除文档失败')
        }
      },
    })
  }, [refreshAll, token.colorError])

  const handleUnbindDocument = useCallback((documentId, fileName) => {
    modal.confirm({
      title: '确认解绑文档',
      icon: <DisconnectOutlined style={{ color: token.colorWarning }} />,
      content: (
        <div>
          <p>确定要将文档 <Text strong>{fileName}</Text> 从当前患者解绑吗？</p>
          <p style={{ color: token.colorTextSecondary }}>解绑后文档将自动重新匹配并进入待归档状态，患者数据池中对应的文档数据也会被移除。</p>
        </div>
      ),
      okText: '确认解绑',
      okButtonProps: { danger: true },
      cancelText: '取消',
      centered: true,
      width: modalWidthPreset.standard,
      onOk: async () => {
        try {
          const response = await unarchiveDocument(documentId, true)
          if (response.success) {
            message.success('文档已解绑，正在重新匹配...')
            // 将文档加入轮询，实时跟踪重新匹配进度
            setPollingParseIds((prev) => new Set([...prev, documentId]))
            refreshAll({ forceTree: true })
          } else {
            message.error(response.message || '解绑失败')
          }
        } catch (error) {
          message.error(error.response?.data?.message || '解绑文档失败')
        }
      },
    })
  }, [refreshAll, token.colorTextSecondary, token.colorWarning])

  const handleBatchDelete = useCallback(() => {
    if (!selectedRowKeys.length) return
    modal.confirm({
      title: '确认批量删除',
      icon: <DeleteOutlined style={{ color: token.colorError }} />,
      content: (
        <div>
          <p>确定要删除选中的 <Text strong>{selectedRowKeys.length}</Text> 个文档吗？</p>
          <p style={{ color: token.colorError }}>删除操作不可撤销</p>
        </div>
      ),
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      centered: true,
      width: modalWidthPreset.standard,
      onOk: async () => {
        try {
          setBatchDeleteLoading(true)
          const response = await deleteDocuments(selectedRowKeys, true)
          if (response.success) {
            const { deleted_count, failed_count, errors } = response.data || {}
            if (failed_count > 0 && errors?.length)
              message.warning(`成功删除 ${deleted_count} 个，${failed_count} 个失败`)
            else message.success(response.message || `已删除 ${deleted_count} 个文档`)
            setSelectedRowKeys([])
            refreshAll({ forceTree: true })
          } else {
            message.error(response.message || '批量删除失败')
          }
        } catch {
          message.error('批量删除失败')
        } finally {
          setBatchDeleteLoading(false)
        }
      },
    })
  }, [selectedRowKeys, refreshAll, token.colorError])

  const handleDownload = useCallback((record) => {
    if (record?.file_url) window.open(record.file_url, '_blank')
    else message.error('文档URL不存在')
  }, [])

  const handleFileClick = useCallback((file) => {
    const isParsed = ['parsed', 'ai_matching', 'pending_confirm_new', 'pending_confirm_review',
      'pending_confirm_uncertain', 'auto_archived', 'archived'].includes(file.task_status)
    setSelectedDocument({
      id: file.id,
      fileName: file.file_name,
      status: file.task_status || 'uploaded',
      isParsed,
      isExtracted: false,
      patientId: file.patient_info?.patient_id || null,
    })
    setDetailModalVisible(true)
  }, [])

  const handleDetailModalClose = useCallback(() => {
    setDetailModalVisible(false)
    setSelectedDocument(null)
    // 返回列表时，保留已展开分组，只刷新树和列表数据
    refreshAll({ forceTree: true })
  }, [refreshAll])

  const handleReExtract = useCallback(async (documentId) => {
    try {
      const response = await extractEhrData(documentId)
      if (response.success) {
        message.success('重新抽取成功')
        refreshAll({ forceTree: true })
      } else {
        message.error(response.message || '重新抽取失败')
      }
    } catch {
      message.error('重新抽取失败')
    }
  }, [refreshAll])

  const handleChangePatient = useCallback(async (documentId) => {
    const file = fileRecordMap.get(documentId)
    if (!file) return message.warning('文档不存在')
    if (file.task_status !== 'archived')
      return message.warning('只有已归档文档才能更换患者')
    setMatchModalMode('change')
    await openPatientMatchModal(documentId, {
      archivedPatientId: file.patient_info?.patient_id || null,
      isFromAutoArchived: true,
    }, file)
  }, [fileRecordMap])

  const handleArchivePatient = useCallback(async (documentId) => {
    setMatchModalMode('archive')
    const file = fileRecordMap.get(documentId)
    await openPatientMatchModal(documentId, { archivedPatientId: null, isFromAutoArchived: false }, file)
  }, [fileRecordMap])

  const openPatientMatchModal = async (documentId, options = {}, fileOverride) => {
    const { archivedPatientId, isFromAutoArchived } = options
    const file = fileOverride || fileRecordMap.get(documentId)
    if (!file) return message.warning('文档不存在')
    const currentArchivedPatientId = archivedPatientId ?? (file.patient_info?.patient_id || null)
    setSelectedMatchDocument({
      id: documentId,
      name: file.file_name || '未知文档',
      fileName: file.file_name,
      taskStatus: file.task_status,
      isFromAutoArchived: !!isFromAutoArchived,
      archivedPatientId: currentArchivedPatientId,
      archivedPatientInfo: file.patient_info || null,
      createdAt: file.created_at,
      documentType: file.document_type,
      documentSubType: file.document_sub_type,
      candidates: [],
      extractedInfo: {},
    })
    setPatientMatchVisible(true)
    setMatchInfoLoading(true)
    setSelectedMatchPatient(null)
    setPatientSearchValue('')
    setPatientSearchResults([])
    setShowSearchResults(false)
    try {
      const matchResponse = await getDocumentAiMatchInfo(documentId)
      if (matchResponse.success && matchResponse.data) {
        const md = matchResponse.data
        setSelectedMatchDocument({
          id: documentId,
          name: file.file_name || '未知文档',
          fileName: file.file_name,
          taskStatus: file.task_status,
          isFromAutoArchived: !!isFromAutoArchived,
          archivedPatientId: currentArchivedPatientId,
          archivedPatientInfo: file.patient_info || null,
          createdAt: file.created_at,
          documentType: file.document_type,
          documentSubType: file.document_sub_type,
          extractedInfo: md.extracted_info || {},
          matchScore: md.match_score || 0,
          confidence: md.confidence || 0,
          candidates: (md.candidates || []).map((c) => ({
            id: c.id, name: c.name, patientCode: c.patient_code,
            similarity: c.similarity || 0, matchReasoning: c.match_reasoning,
            keyEvidence: c.key_evidence || [], concerns: c.concerns || [],
            matchFeatures: (c.key_evidence?.length ? c.key_evidence : c.concerns?.length ? c.concerns : ['待AI分析']),
            gender: c.gender || '', age: c.age || '',
          })),
          aiRecommendation: md.ai_recommendation,
          aiReason: md.ai_reason,
          matchResult: md.match_result || 'matched',
        })
      } else {
        message.info('未获取到 AI 推荐，可手动搜索患者归档')
      }
    } catch {
      message.info('未获取到 AI 推荐，可手动搜索患者归档')
    } finally {
      setMatchInfoLoading(false)
    }
  }

  const handleCreatePatientFromDoc = useCallback((record) => {
    if (!record?.id) return
    setCreatePatientMode('docs')
    setCreatePatientGroupId(null)
    setCreatePatientDocIds([record.id])
    setCreatePatientPrefillValues(null)
    setCreatePatientDrawerOpen(true)
  }, [])

  const handleConfirmRecommendedArchive = useCallback(async (record) => {
    const hideLoading = message.loading('正在获取推荐信息...', 0)
    try {
      const groupRecommendation = record?._groupId
        ? getGroupRecommendedPatient(groupDocsMap[record._groupId]?.matchInfo)
        : { patientId: '', candidate: null }
      let matchInfo = null
      let recommendedPatientId = groupRecommendation.patientId
      if (!recommendedPatientId) {
        matchInfo = await getDocumentAiMatchInfo(record.id)
        recommendedPatientId = matchInfo?.data?.ai_recommendation
      }
      hideLoading()
      if (recommendedPatientId) {
        const candidates = matchInfo?.data?.candidates || []
        const candidate = groupRecommendation.candidate || candidates.find((c) => c.id === recommendedPatientId) || candidates[0]
        const patientName = candidate?.name || candidate?.patient_name || '未知'
        const matchScore = matchInfo?.data?.match_score ?? candidate?.similarity
        const confirmLabel = getRecommendedArchiveLabel(patientName, matchScore)
        const matchScoreText = formatMatchScorePercent(matchScore)
        modal.confirm({
          title: confirmLabel,
          content: (
            <div>
              <p>AI 推荐将该文档归档到以下患者：</p>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="患者姓名">{patientName}</Descriptions.Item>
                <Descriptions.Item label="匹配分数">{matchScoreText || '--'}</Descriptions.Item>
              </Descriptions>
            </div>
          ),
          okText: confirmLabel,
          cancelText: '取消',
          centered: true,
          width: modalWidthPreset.standard,
          onOk: async () => {
            try {
              const res = await archiveDocument(record.id, recommendedPatientId, true)
              if (res?.success) {
                message.success(`已归档到患者「${patientName}」`)
                refreshAll({ forceTree: true })
              } else {
                message.error(res?.message || '归档失败')
              }
            } catch {
              message.error('归档失败')
            }
          },
        })
      } else {
        message.warning('未找到AI推荐的患者，请手动选择')
        handleArchivePatient(record.id)
      }
    } catch {
      hideLoading()
      message.error('获取推荐信息失败')
    }
  }, [groupDocsMap, refreshAll, handleArchivePatient])

  // ─── 分组操作 ───
  const handleAutoArchiveGroup = useCallback(async (groupId) => {
    if (!groupId || autoArchivingGroupIds.has(groupId)) return
    setAutoArchivingGroupIds((prev) => new Set([...prev, groupId]))
    try {
      const cached = groupDocsMap[groupId]?.matchInfo
      let matchedPatientId = getGroupRecommendedPatient(cached).patientId
      if (!matchedPatientId) {
        const mr = await matchGroup(groupId)
        matchedPatientId = getGroupRecommendedPatient(mr?.data?.match_info || mr?.data).patientId
      }
      if (!matchedPatientId) {
        message.warning('未找到推荐患者，请手动选择')
        return
      }
      const res = await confirmGroupArchive(groupId, matchedPatientId, true)
      if (res?.success) {
        message.success(`自动归档完成：成功 ${res.data?.archived_count || 0} 个文档`)
        setGroupDocsMap((prev) => { const n = { ...prev }; delete n[groupId]; return n })
        refreshAll({ forceTree: true })
      } else {
        message.error(res?.message || '自动归档失败')
      }
    } catch {
      message.error('自动归档失败')
    } finally {
      setAutoArchivingGroupIds((prev) => {
        const n = new Set(prev); n.delete(groupId); return n
      })
    }
  }, [autoArchivingGroupIds, groupDocsMap, refreshAll])

  const handleCreatePatientForGroup = useCallback(async (groupId) => {
    if (!groupId) return
    let items = groupDocsMap[groupId]?.items
    let groupPayload = groupDocsMap[groupId]
    if (!Array.isArray(items)) {
      try {
        const res = await getFileListV2GroupDocuments(groupId, { page: 1, page_size: 100 })
        items = res?.success ? res?.data?.items || [] : []
        groupPayload = res?.success ? res?.data : groupPayload
      } catch { items = [] }
    }
    const groupDocuments = groupPayload?.group?.documents || []
    const prefillSources = items?.length ? items : groupDocuments
    setCreatePatientMode('group')
    setCreatePatientGroupId(groupId)
    setCreatePatientDocIds((items || []).map((x) => x.id).filter(Boolean))
    setCreatePatientPrefillValues(mergePatientPrefills(prefillSources))
    setCreatePatientDrawerOpen(true)
  }, [groupDocsMap])

  const openManualArchiveForGroup = useCallback((groupId) => {
    if (!groupId) return
    setGroupManualArchiveGroupId(groupId)
    setSelectedGroupPatient(null)
    setGroupPatientSearchValue('')
    setGroupPatientSearchResults([])
    setGroupPatientSearchLoading(true)
    setGroupManualArchiveVisible(true)
  }, [])

  const handleGroupPatientSearch = useCallback((value) => {
    setGroupPatientSearchValue(value)
    setSelectedGroupPatient(null)
    if (groupSearchTimerRef.current) clearTimeout(groupSearchTimerRef.current)
    groupSearchVersionRef.current += 1
    const ver = groupSearchVersionRef.current
    const trimmed = (value || '').trim()
    const debounceMs = trimmed.length < 1 ? 0 : 400
    groupSearchTimerRef.current = setTimeout(async () => {
      if (ver !== groupSearchVersionRef.current) return
      setGroupPatientSearchLoading(true)
      try {
        const res = await getPatientList({ page: 1, page_size: 50, ...(trimmed ? { search: trimmed } : {}) })
        if (ver !== groupSearchVersionRef.current) return
        setGroupPatientSearchResults(res?.success && res?.data ? res.data : [])
      } catch {
        if (ver === groupSearchVersionRef.current) setGroupPatientSearchResults([])
      } finally {
        if (ver === groupSearchVersionRef.current) setGroupPatientSearchLoading(false)
      }
    }, debounceMs)
  }, [])

  const handleConfirmGroupManualArchive = useCallback(async () => {
    if (!groupManualArchiveGroupId || !selectedGroupPatient?.id) {
      message.warning('请先选择一个患者')
      return
    }
    try {
      const res = await confirmGroupArchive(groupManualArchiveGroupId, selectedGroupPatient.id)
      if (res?.success) {
        message.success(`归档完成: 成功 ${res.data?.archived_count || 0} 个文档`)
        setGroupManualArchiveVisible(false)
        refreshAll({ forceTree: true })
      } else {
        message.error(res?.message || '归档失败')
      }
    } catch {
      message.error('按组归档失败')
    }
  }, [groupManualArchiveGroupId, selectedGroupPatient, refreshAll])

  // ─── 批量操作 ───
  const handleBatchPatientSearch = useCallback((value) => {
    setBatchPatientSearchValue(value)
    setSelectedBatchPatient(null)
    if (batchSearchTimerRef.current) clearTimeout(batchSearchTimerRef.current)
    batchSearchVersionRef.current += 1
    const ver = batchSearchVersionRef.current
    const trimmed = (value || '').trim()
    const debounceMs = trimmed.length < 1 ? 0 : 400
    batchSearchTimerRef.current = setTimeout(async () => {
      if (ver !== batchSearchVersionRef.current) return
      setBatchPatientSearchLoading(true)
      try {
        const res = await getPatientList({ page: 1, page_size: 50, ...(trimmed ? { search: trimmed } : {}) })
        if (ver !== batchSearchVersionRef.current) return
        setBatchPatientSearchResults(res?.success && res?.data ? res.data : [])
      } catch {
        if (ver === batchSearchVersionRef.current) setBatchPatientSearchResults([])
      } finally {
        if (ver === batchSearchVersionRef.current) setBatchPatientSearchLoading(false)
      }
    }, debounceMs)
  }, [])

  // 打开批量/分组「手动选择」弹窗时预加载患者列表，无需先输入
  useEffect(() => {
    if (!batchManualArchiveVisible) return
    if (batchSearchTimerRef.current) clearTimeout(batchSearchTimerRef.current)
    batchSearchVersionRef.current += 1
    const ver = batchSearchVersionRef.current
    setBatchPatientSearchLoading(true)
    getPatientList({ page: 1, page_size: 50 })
      .then((res) => {
        if (ver !== batchSearchVersionRef.current) return
        setBatchPatientSearchResults(res?.success && res?.data ? res.data : [])
      })
      .catch(() => {
        if (ver === batchSearchVersionRef.current) setBatchPatientSearchResults([])
      })
      .finally(() => {
        if (ver === batchSearchVersionRef.current) setBatchPatientSearchLoading(false)
      })
  }, [batchManualArchiveVisible])

  useEffect(() => {
    if (!groupManualArchiveVisible) return
    if (groupSearchTimerRef.current) clearTimeout(groupSearchTimerRef.current)
    groupSearchVersionRef.current += 1
    const ver = groupSearchVersionRef.current
    setGroupPatientSearchLoading(true)
    getPatientList({ page: 1, page_size: 50 })
      .then((res) => {
        if (ver !== groupSearchVersionRef.current) return
        setGroupPatientSearchResults(res?.success && res?.data ? res.data : [])
      })
      .catch(() => {
        if (ver === groupSearchVersionRef.current) setGroupPatientSearchResults([])
      })
      .finally(() => {
        if (ver === groupSearchVersionRef.current) setGroupPatientSearchLoading(false)
      })
  }, [groupManualArchiveVisible])

  const handleConfirmBatchManualArchive = useCallback(async () => {
    if (!selectedRowKeys.length || !selectedBatchPatient?.id) {
      message.warning('请先选择文档和患者')
      return
    }
    const documentIds = selectedRowKeys
      .map((key) => fileRecordMap.get(key))
      .filter((item) => item?.id && item.task_status !== 'archived')
      .map((item) => item.id)
    if (!documentIds.length) {
      message.warning('当前选中文档没有可归档的文档')
      return
    }
    setBatchProcessing(true)
    try {
      const res = await batchArchiveDocuments(documentIds, selectedBatchPatient.id, true)
      const ok = Number(res?.data?.total ?? res?.data?.items?.length ?? 0)
      if (res?.success && ok > 0) {
        message.success(`已归档 ${ok} 个文档到患者「${selectedBatchPatient.name || '未知'}」`)
        setSelectedRowKeys([])
        setBatchManualArchiveVisible(false)
        refreshAll({ forceTree: true })
      } else {
        message.error(res?.message || '归档失败')
      }
    } catch {
      message.error('批量归档失败')
    } finally {
      setBatchProcessing(false)
    }
  }, [fileRecordMap, selectedRowKeys, selectedBatchPatient, refreshAll])

  const handleBatchCreatePatientFromSelection = useCallback(() => {
    if (!selectedRowKeys.length) return message.warning('请先选择文档')
    const selected = selectedRowKeys
      .map((key) => fileRecordMap.get(key))
      .filter(Boolean)
    const eligible = selected
      .filter((r) => r?.id && r.task_status !== 'archived')
      .map((r) => r.id)
    if (!eligible.length)
      return message.warning('当前选中文档中没有可「新建患者」并归档的文档')
    setCreatePatientMode('docs')
    setCreatePatientGroupId(null)
    setCreatePatientDocIds(eligible)
    setCreatePatientPrefillValues(mergePatientPrefills(selected.filter((r) => eligible.includes(r.id))))
    setCreatePatientDrawerOpen(true)
  }, [fileRecordMap, selectedRowKeys])

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const waitForParseCompletion = async (documentId) => {
    for (let i = 0; i < 180; i++) {
      await sleep(2000)
      try {
        const res = await getFileStatusesByIds([documentId])
        const item = res?.data?.items?.[0]
        if (item?.task_status && item.task_status !== 'parsing') {
          setFileList((prev) => prev.map((f) => (f.id === documentId ? { ...f, ...item } : f)))
          return item.task_status
        }
      } catch {}
    }
    return null
  }

  const handleBatchParseArchive = useCallback(async () => {
    if (!selectedRowKeys.length) return message.warning('请先选择需要处理的文件')
    const selectedRecords = selectedRowKeys
      .map((key) => fileRecordMap.get(key))
      .filter(Boolean)
    if (!selectedRecords.length) return message.warning('当前无可处理文件')

    const successIds = []
    const failedIds = []
    const skippedIds = []

    const processRecord = async (record) => {
      // 已在解析中时跳过，避免重复启动
      if (record.task_status === 'parsing') {
        skippedIds.push(record.id)
        return
      }
      setStartingParseIds((prev) => new Set([...prev, record.id]))
      try {
        const resp = await parseDocument(record.id)
        if (resp?.success) {
          successIds.push(record.id)
          setFileList((prev) => prev.map((f) => (f.id === record.id ? { ...f, task_status: 'parsing' } : f)))
          setPollingParseIds((prev) => new Set([...prev, record.id]))
        } else {
          failedIds.push(record.id)
        }
      } catch {
        failedIds.push(record.id)
      } finally {
        setStartingParseIds((prev) => {
          const n = new Set(prev)
          n.delete(record.id)
          return n
        })
      }
    }

    setBatchReidentifyLoading(true)
    try {
      const limit = 3
      let index = 0
      const runners = Array.from({ length: Math.min(limit, selectedRecords.length) }).map(async () => {
        while (index < selectedRecords.length) {
          const current = selectedRecords[index]; index += 1
          await processRecord(current)
        }
      })
      await Promise.all(runners)
      setSelectedRowKeys([])
      await refreshAll({ forceTree: true })
      if (successIds.length) message.success(`已启动 ${successIds.length} 个文档的批量重新识别`)
      if (skippedIds.length) message.info(`${skippedIds.length} 个文档已在识别中，已跳过`)
      if (failedIds.length) message.error(`${failedIds.length} 个文档启动失败`)
    } finally {
      setBatchReidentifyLoading(false)
    }
  }, [fileRecordMap, refreshAll, selectedRowKeys])

  // 批量确认归档至 AI 推荐患者
  const handleBatchConfirmRecommendedArchive = useCallback(async () => {
    if (!selectedRowKeys.length) return message.warning('请先选择文档')

    const selectedRecords = selectedRowKeys.map((id) => fileRecordMap.get(id)).filter(Boolean)
    if (!selectedRecords.length) return message.warning('没有找到可处理的文档')

    const eligible = selectedRecords.filter((r) => r?.id && r.task_status !== 'archived')
    if (!eligible.length) return message.warning('选中文档中没有可确认推荐归档的文档')

    setBatchConfirmArchiveLoading(true)
    let successCount = 0
    let skippedNoMatchCount = 0
    let failedArchiveCount = 0
    const skippedNoMatchDocNames = new Set()
    const failedArchiveDocNames = new Set()

    const getDocName = (doc) => {
      if (!doc) return ''
      return doc.file_name || doc.fileName || doc.name || (doc.id ? String(doc.id).slice(0, 8) : '')
    }
    const getDocNameById = (docId) => {
      const row = fileRecordMap.get(docId)
      return getDocName(row) || String(docId).slice(0, 8)
    }

    // 按 _groupId 分组：同一分组只调用一次 confirmGroupArchive
    const processedGroupIds = new Set()
    const groupArchives = []   // { groupId, matchedPatientId }
    const soloArchives  = []   // 无组 / 组内无缓存 matchInfo 的单个文档

    for (const doc of eligible) {
      const gid = doc._groupId
      if (gid) {
        if (processedGroupIds.has(gid)) continue  // 同组其他文件已加入队列
        const matchedPatientId = getGroupRecommendedPatient(groupDocsMap[gid]?.matchInfo).patientId
        if (matchedPatientId) {
          processedGroupIds.add(gid)
          groupArchives.push({ groupId: gid, matchedPatientId })
        } else {
          soloArchives.push(doc)
        }
      } else {
        soloArchives.push(doc)
      }
    }

    // 按分组归档
    for (const { groupId, matchedPatientId } of groupArchives) {
      try {
        const res = await confirmGroupArchive(groupId, matchedPatientId, true)
        if (res?.success) {
          successCount += res.data?.archived_count || 0
          const failedCount = res.data?.failed_count || 0
          failedArchiveCount += failedCount

          const errors = Array.isArray(res.data?.errors) ? res.data.errors : []
          errors.forEach((err) => {
            const docId = err?.document_id
            if (!docId) return
            failedArchiveDocNames.add(getDocNameById(docId))
          })
        } else {
          failedArchiveCount += res?.data?.failed_count || 1
        }
      } catch (e) {
        failedArchiveCount += 1
      }
    }

    // 无组 / 缺缓存的逐个归档
    for (const doc of soloArchives) {
      try {
        let matchedPatientId = doc?._groupId
          ? getGroupRecommendedPatient(groupDocsMap[doc._groupId]?.matchInfo).patientId
          : ''
        if (!matchedPatientId) {
          const matchRes = await getDocumentAiMatchInfo(doc.id)
          matchedPatientId = matchRes?.data?.ai_recommendation
        }
        if (!matchedPatientId) {
          skippedNoMatchCount += 1
          skippedNoMatchDocNames.add(getDocName(doc))
          continue
        }
        const res = await archiveDocument(doc.id, matchedPatientId, true)
        if (res?.success) successCount += 1
        else {
          failedArchiveCount += 1
          failedArchiveDocNames.add(getDocName(doc))
        }
      } catch (e) {
        failedArchiveCount += 1
        failedArchiveDocNames.add(getDocName(doc))
      }
    }

    setBatchConfirmArchiveLoading(false)
    setSelectedRowKeys([])
    refreshAll({ forceTree: true })

    const skippedNamesText = skippedNoMatchDocNames.size
      ? Array.from(skippedNoMatchDocNames).join('、')
      : `${skippedNoMatchCount}个`
    const failedNamesText = failedArchiveDocNames.size
      ? Array.from(failedArchiveDocNames).join('、')
      : `${failedArchiveCount}个`

    const tip = `归档成功 ${successCount} 个，缺少匹配患者跳过：${skippedNamesText}，归档失败：${failedNamesText}`
    if (failedArchiveCount === 0 && skippedNoMatchCount === 0) message.success(tip)
    else message.warning(tip)
  }, [fileRecordMap, groupDocsMap, refreshAll, selectedRowKeys])

  // ─── 患者搜索（匹配弹窗内） ───
  const handlePatientSearch = (value) => {
    setPatientSearchValue(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchVersionRef.current += 1
    const ver = searchVersionRef.current
    if (!value || value.trim().length < 1) {
      setShowSearchResults(false)
      setPatientSearchResults([])
      return
    }
    setPatientSearchLoading(true)
    setShowSearchResults(true)
    searchTimerRef.current = setTimeout(async () => {
      try {
        const resp = await getPatientList({ page: 1, page_size: 10, search: value.trim() })
        if (ver === searchVersionRef.current) {
          setPatientSearchResults(resp.success && resp.data ? resp.data : [])
          setPatientSearchLoading(false)
        }
      } catch {
        if (ver === searchVersionRef.current) {
          setPatientSearchResults([])
          setPatientSearchLoading(false)
        }
      }
    }, 500)
  }

  const handleConfirmPatientMatch = async () => {
    if (!selectedMatchDocument || !selectedMatchPatient) return message.warning('请先选择一个患者')
    const isArchive = matchModalMode === 'archive'
    const matchedCandidate = selectedMatchDocument?.candidates?.find((c) => c.id === selectedMatchPatient.id)
    const confirmLabel = isArchive
      ? getRecommendedArchiveLabel(selectedMatchPatient.name, matchedCandidate?.similarity)
      : '确认更换归档患者'
    modal.confirm({
      title: confirmLabel,
      content: isArchive ? '确定选择该患者并归档文档吗？' : '确定更换归档到该患者吗？',
      okText: isArchive ? confirmLabel : '确认',
      cancelText: '取消',
      centered: true,
      width: modalWidthPreset.standard,
      onOk: async () => {
        setArchivingLoading(true)
        try {
          const response = isArchive
            ? await archiveDocument(selectedMatchDocument.id, selectedMatchPatient.id, true)
            : await changeArchivePatient(selectedMatchDocument.id, selectedMatchPatient.id, {
                revokeLastMerge: true, autoMergeEhr: true,
              })
          if (response.success) {
            message.success(isArchive
              ? `已归档到患者: ${selectedMatchPatient.name}`
              : `已更换归档到: ${selectedMatchPatient.name}`)
            setPatientMatchVisible(false)
            setSelectedMatchPatient(null)
            setSelectedMatchDocument(null)
            refreshAll({ forceTree: true })
            detailModalRef.current?.refetch?.()
          } else {
            message.error(response.message || '操作失败')
          }
        } catch (error) {
          message.error(error.response?.data?.message || '操作失败')
        } finally {
          setArchivingLoading(false)
        }
      },
    })
  }

  const handleConfirmMatch = async (docId, targetPatientId) => {
    if (!docId || !targetPatientId) return
    const candidate = selectedMatchDocument?.candidates?.find((c) => c.id === targetPatientId)
    const isArchive = matchModalMode === 'archive'
    const confirmLabel = isArchive
      ? getRecommendedArchiveLabel(candidate?.name, candidate?.similarity)
      : '确认更换归档患者'
    modal.confirm({
      title: confirmLabel,
      okText: isArchive ? confirmLabel : '确认',
      cancelText: '取消',
      centered: true,
      width: modalWidthPreset.standard,
      onOk: async () => {
        setArchivingLoading(true)
        try {
          const response = isArchive
            ? await archiveDocument(docId, targetPatientId, true)
            : await changeArchivePatient(docId, targetPatientId, { revokeLastMerge: true, autoMergeEhr: true })
          if (response.success) {
            message.success(`已${isArchive ? '归档' : '更换归档'}到患者: ${candidate?.name || targetPatientId}`)
            setPatientMatchVisible(false)
            setSelectedMatchPatient(null)
            setSelectedMatchDocument(null)
            refreshAll({ forceTree: true })
            detailModalRef.current?.refetch?.()
          } else {
            message.error(response.message || '操作失败')
          }
        } catch {
          message.error('操作失败')
        } finally {
          setArchivingLoading(false)
        }
      },
    })
  }

  // ─── 上传处理 ───
  const handleFileInputChange = (e) => {
    if (e.target.files?.length > 0) {
      handleFileUpload(Array.from(e.target.files))
      e.target.value = ''
      setUploadModalVisible(false)
    }
  }

  const handleFolderInputChange = (e) => {
    if (e.target.files?.length > 0) {
      const supportedTypes = ['application/pdf', 'image/jpg', 'image/jpeg', 'image/png']
      const valid = Array.from(e.target.files).filter(
        (f) => supportedTypes.includes(f.type) && f.size <= 50 * 1024 * 1024
      )
      if (!valid.length) {
        message.warning('文件夹中没有支持的文件')
        e.target.value = ''
        setUploadModalVisible(false)
        return
      }
      const processed = valid.map((f) => new File([f], f.name.split('/').pop(), { type: f.type }))
      handleFileUpload(processed)
      e.target.value = ''
      setUploadModalVisible(false)
    }
  }

  const handleFileUpload = useCallback(async (files) => {
    const supportedTypes = ['application/pdf', 'image/jpg', 'image/jpeg', 'image/png']
    const validFiles = []
    files.forEach((file) => {
      if (!supportedTypes.includes(file.type)) {
        message.error(`${file.name}: 不支持的文件格式`)
        return
      }
      if (file.size > 50 * 1024 * 1024) {
        message.error(`${file.name}: 文件超过50MB`)
        return
      }
      validFiles.push(file)
    })
    if (!validFiles.length) return
    const addedCount = uploadManager.addFiles(validFiles)
    if (addedCount > 0) {
      message.info(`已添加 ${addedCount} 个文件到上传队列`)
      uploadManager.startUpload()
    }
  }, [uploadManager])

  // ─── 筛选状态 ───
  const [filterDropdownOpen, setFilterDropdownOpen] = useState({})
  const [tempFilters, setTempFilters] = useState(initialRouteStateRef.current.filters)
  const [overlayPosition, setOverlayPosition] = useState(null)
  const filterTriggerRefs = useRef({})

  const openFilterDropdown = (key) => {
    const el = filterTriggerRefs.current[key]
    if (el) {
      const cell = el.closest('th') || el.closest('.ant-table-cell') || el
      const rect = cell.getBoundingClientRect()
      setOverlayPosition({ left: rect.left, top: rect.bottom + 2 })
    }
    setTempFilters({ ...columnFilters })
    setFilterDropdownOpen((prev) => ({ ...prev, [key]: true }))
  }

  const closeFilterOverlay = useCallback((key) => {
    setFilterDropdownOpen((prev) => ({ ...prev, [key]: false }))
    setOverlayPosition(null)
  }, [])

  const syncSearchParams = useCallback((filters, nextTab = activeTab, nextView = viewMode) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tab', nextTab || 'all')
    nextParams.set('view', nextView || 'patient')

    if (filters.fileName) nextParams.set('q', filters.fileName)
    else nextParams.delete('q')

    if (filters.taskStatus?.length) nextParams.set('taskStatus', filters.taskStatus.join(','))
    else nextParams.delete('taskStatus')

    if (filters.statusInfo?.length) nextParams.set('statusInfo', filters.statusInfo.join(','))
    else nextParams.delete('statusInfo')

    setSearchParams(nextParams, { replace: true })
  }, [activeTab, searchParams, setSearchParams, viewMode])

  const handleViewModeChange = useCallback((nextMode) => {
    setViewMode(nextMode)
    syncSearchParams(columnFilters, activeTab, nextMode)
    setSelectedRowKeys([])
    setExpandedGroups([])
    if (nextMode !== 'patient') setActiveGroupKey(null)
  }, [activeTab, columnFilters, syncSearchParams])

  const applyFilter = useCallback((key) => {
    const nextFilters = { ...tempFilters }
    setColumnFilters(nextFilters)
    syncSearchParams(nextFilters)
    closeFilterOverlay(key)
    setPagination((prev) => ({ ...prev, current: 1 }))
  }, [tempFilters, closeFilterOverlay, syncSearchParams])

  const resetFilter = useCallback((key) => {
    const reset = { ...tempFilters }
    if (key === 'fileName') reset.fileName = ''
    if (key === 'fileType') reset.fileType = []
    if (key === 'taskStatus') reset.taskStatus = []
    if (key === 'statusInfo') reset.statusInfo = []
    if (key === 'dateRange') reset.dateRange = null
    setTempFilters(reset)
    setColumnFilters(reset)
    syncSearchParams(reset)
    closeFilterOverlay(key)
    setPagination((prev) => ({ ...prev, current: 1 }))
  }, [tempFilters, closeFilterOverlay, syncSearchParams])

  const toggleSort = (field) => {
    setSorter((prev) => {
      if (prev.field !== field) return { field, order: 'asc' }
      if (prev.order === 'asc') return { field, order: 'desc' }
      if (prev.order === 'desc') return { field: 'created_at', order: 'desc' }
      return { field, order: 'asc' }
    })
    setPagination((prev) => ({ ...prev, current: 1 }))
  }

  const SortIcon = ({ field }) => {
    const active = sorter.field === field
    if (!active) return <SortAscendingOutlined style={{ cursor: 'pointer', color: token.colorTextSecondary, fontSize: 12 }} onClick={() => toggleSort(field)} />
    if (sorter.order === 'asc') return <SortAscendingOutlined style={{ cursor: 'pointer', color: token.colorPrimary, fontSize: 12 }} onClick={() => toggleSort(field)} />
    return <SortDescendingOutlined style={{ cursor: 'pointer', color: token.colorPrimary, fontSize: 12 }} onClick={() => toggleSort(field)} />
  }

  const FilterIcon = ({ filterKey, hasFilter }) => (
    <span
      ref={(el) => { filterTriggerRefs.current[filterKey] = el }}
      style={{ display: 'inline-flex', cursor: 'pointer' }}
      onClick={(e) => { e.stopPropagation(); openFilterDropdown(filterKey) }}
    >
      <FilterOutlined
        style={{ color: hasFilter ? token.colorPrimary : token.colorTextSecondary, fontSize: 12 }}
      />
    </span>
  )

  const openFilterKey = Object.keys(filterDropdownOpen).find((k) => filterDropdownOpen[k])

  // 悬浮时预加载分组匹配信息
  const handleGroupMouseEnter = useCallback((record) => {
    setHoveredGroupKey(record.key)
    if (record._groupType === 'todo' && record._groupId) {
      const cached = groupDocsMap[record._groupId]
      if (!cached || (!cached.loading && !cached.matchInfo && !Array.isArray(cached.items))) {
        loadGroupDocs(record._groupId)
      }
    }
  }, [groupDocsMap, loadGroupDocs])

  /**
   * 计算分组记录的主动作按钮集合（用于组行与左栏卡片复用）。
   *
   * @param {Record<string, any>} record 分组记录
   * @param {{expandDetailLabel?: boolean}} [options] 动作按钮渲染选项
   * @returns {React.ReactNode[]} 动作节点数组
   */
  const getGroupActionNodes = useCallback((record, options = {}) => {
    const { expandDetailLabel = true } = options
    const actions = []
    const isTodo = record?._groupType === 'todo'
    const isArchived = record?._groupType === 'archived'
    if (isTodo) {
      const statusSet = record?._statusSet || []
      const isPendingProcessGroup = statusSet.includes('parse') || statusSet.includes('parsing')
      const hasAutoArchived = statusSet.includes('auto_archived')
      const hasPendingReview = statusSet.includes('pending_confirm_review')
      const hasPendingNew = statusSet.includes('pending_confirm_new')
      const isUncertainGroup = statusSet.includes('pending_confirm_uncertain')
      const matchInfo = record?._matchInfo
      const { patientId: matchedPatientId, candidate: matchedCandidate } = getGroupRecommendedPatient(matchInfo)
      const matchedPatientNameRaw = matchedCandidate?.name || matchedCandidate?.patient_name
      const recommendedArchiveLabel = getRecommendedArchiveLabel(matchedPatientNameRaw, matchInfo?.match_score)

      if (isPendingProcessGroup) {
        actions.push(
          <Button
            key="pending"
            size="small"
            icon={<LoadingOutlined />}
            onClick={(event) => { event.stopPropagation(); toggleGroup(record) }}
          >
            {renderGroupPrimaryActionLabel('查看')}
          </Button>
        )
      } else if (hasAutoArchived || hasPendingReview || isUncertainGroup) {
        actions.push(
          <Button
            key="confirm"
            size="small"
            type="primary"
            icon={<CheckCircleOutlined />}
            loading={autoArchivingGroupIds.has(record._groupId)}
            disabled={!matchedPatientId}
            onClick={(event) => { event.stopPropagation(); handleAutoArchiveGroup(record._groupId) }}
          >
            {renderGroupPrimaryActionLabel(recommendedArchiveLabel)}
          </Button>
        )
      } else if (hasPendingNew && !isUncertainGroup) {
        actions.push(
          <Button
            key="create"
            size="small"
            type="primary"
            icon={<UserAddOutlined />}
            onClick={(event) => { event.stopPropagation(); handleCreatePatientForGroup(record._groupId) }}
          >
            {renderGroupPrimaryActionLabel('新建患者')}
          </Button>
        )
      } else {
        actions.push(
          <Button
            key="manual"
            size="small"
            type="primary"
            icon={<TeamOutlined />}
            onClick={(event) => { event.stopPropagation(); openManualArchiveForGroup(record._groupId) }}
          >
            {renderGroupPrimaryActionLabel('手动选择')}
          </Button>
        )
      }
      const moreItems = isPendingProcessGroup ? [] : [
        { key: 'auto', icon: <CheckCircleOutlined />, label: recommendedArchiveLabel, disabled: !matchedPatientId, onClick: () => handleAutoArchiveGroup(record._groupId) },
        { key: 'manual', icon: <TeamOutlined />, label: '手动选择', onClick: () => openManualArchiveForGroup(record._groupId) },
      ]
      if (!isPendingProcessGroup && !isUncertainGroup) {
        moreItems.splice(1, 0, {
          key: 'new_patient',
          icon: <UserAddOutlined />,
          label: '新建患者',
          onClick: () => handleCreatePatientForGroup(record._groupId),
        })
      }
      if (moreItems.length) {
        actions.push(
          <Dropdown key="more" trigger={['click']} menu={{ items: moreItems }}>
            <Button size="small" icon={<MoreOutlined />} onClick={(event) => event.stopPropagation()} />
          </Dropdown>
        )
      }
    }
    if (isArchived && record?._patientId) {
      if (record?._patientDeleted) {
        actions.push(
          <Tag key="deleted" color="red" style={{ marginLeft: 4, cursor: 'default' }} onClick={(event) => event.stopPropagation()}>
            患者已删除
          </Tag>
        )
      } else {
        actions.push(
          <Button
            key="detail"
            size="small"
            type="link"
            icon={<UserOutlined />}
            aria-label="查看患者"
            onClick={(event) => { event.stopPropagation(); navigate(`/patient/detail/${record._patientId}`) }}
            style={{ paddingInline: expandDetailLabel ? 8 : 4 }}
          >
            <span
              style={{
                display: 'inline-block',
                maxWidth: expandDetailLabel ? 72 : 0,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                opacity: expandDetailLabel ? 1 : 0,
                marginLeft: expandDetailLabel ? 4 : 0,
                transition: 'max-width 0.2s ease, opacity 0.2s ease, margin-left 0.2s ease',
              }}
            >
              查看患者
            </span>
          </Button>
        )
      }
    }
    return actions
  }, [
    autoArchivingGroupIds,
    handleAutoArchiveGroup,
    handleCreatePatientForGroup,
    navigate,
    openManualArchiveForGroup,
  ])

  // ─── 分组行自定义渲染（必须在 columns 之前定义） ───
  const renderGroupRow = useCallback((record) => {
    if (!record._isGroup) return null
    const isExpanded = expandedGroups.includes(record.key)
    const isTodo = record._groupType === 'todo'
    const isArchived = record._groupType === 'archived'
    const isHovered = hoveredGroupKey === record.key
    const isAutoArchiving = autoArchivingGroupIds.has(record._groupId)

    const statusSet = record._statusSet || []
    const hasAutoArchived = statusSet.includes('auto_archived')
    const hasPendingReview = statusSet.includes('pending_confirm_review')
    const hasPendingNew = statusSet.includes('pending_confirm_new')
    const isUncertainGroup = statusSet.includes('pending_confirm_uncertain')
    const matchInfo = record._matchInfo
    const { patientId: matchedPatientId, candidate: matchedCandidate } = getGroupRecommendedPatient(matchInfo)
    const matchedPatientNameRaw = matchedCandidate?.name || matchedCandidate?.patient_name
    const matchedPatientName = matchedPatientNameRaw ? maskName(matchedPatientNameRaw) : ''
    const recommendedArchiveLabel = getRecommendedArchiveLabel(matchedPatientNameRaw, matchInfo?.match_score)

    const hoverActions = getGroupActionNodes(record)

    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 0',
          cursor: 'pointer',
          width: '100%',
        }}
        onClick={() => toggleGroup(record)}
        onMouseEnter={() => handleGroupMouseEnter(record)}
        onMouseLeave={() => setHoveredGroupKey(null)}
      >
        <Space size={8} style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
          {isExpanded
            ? <CaretDownOutlined style={{ fontSize: 12, color: token.colorTextSecondary }} />
            : <CaretRightOutlined style={{ fontSize: 12, color: token.colorTextSecondary }} />
          }
          <Tooltip title={record._badge?.tip}>
            <span style={{ fontSize: 14 }}>{record._badge?.icon}</span>
          </Tooltip>
          <Text strong style={{ fontSize: 14 }}>{record._label}</Text>
          <Tag style={{ marginLeft: 4 }}>{record._count}份</Tag>
          {record._loading && <LoadingOutlined spin style={{ fontSize: 12, color: token.colorPrimary }} />}
          {isHovered && isTodo && (hasAutoArchived || hasPendingReview || isUncertainGroup) && (
            matchedCandidate ? (
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>
                推荐归档到：
                <Popover
                  placement="bottomLeft"
                  arrow={false}
                  overlayInnerStyle={{ padding: 0 }}
                  content={
                    <div style={{ width: 280, padding: '12px 16px' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Text strong style={{ fontSize: 14 }}>{matchedPatientName}</Text>
                        {matchInfo?.match_score != null && (
                          <Tag color="blue" style={{ marginLeft: 8 }}>匹配 {formatMatchScorePercent(matchInfo.match_score)}</Tag>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 12, color: token.colorTextSecondary, fontSize: 12, marginBottom: 8 }}>
                        {matchedCandidate.gender && <span>{matchedCandidate.gender}</span>}
                        {matchedCandidate.age && <span>{String(matchedCandidate.age).endsWith('岁') ? matchedCandidate.age : `${matchedCandidate.age}岁`}</span>}
                        {(matchedCandidate.patient_code || matchedCandidate.patientCode) && (
                          <span>编号: {matchedCandidate.patient_code || matchedCandidate.patientCode}</span>
                        )}
                      </div>
                      {(matchedCandidate.key_evidence?.length > 0 || matchedCandidate.keyEvidence?.length > 0) && (
                        <div style={{ fontSize: 12, color: appThemeToken.colorTextSecondary, marginBottom: 8 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>匹配依据：</Text>
                          {(matchedCandidate.key_evidence || matchedCandidate.keyEvidence || []).slice(0, 3).map((e, i) => (
                            <Tag key={i} style={{ fontSize: 12, marginTop: 4 }}>{e}</Tag>
                          ))}
                        </div>
                      )}
                      {matchedCandidate.id && (
                        <Button
                          type="link"
                          size="small"
                          style={{ padding: 0, fontSize: 12 }}
                          onClick={(e) => { e.stopPropagation(); navigate(`/patient/detail/${matchedCandidate.id}`) }}
                        >
                          查看患者病历 →
                        </Button>
                      )}
                    </div>
                  }
                >
                  <span
                    style={{ color: token.colorPrimary, cursor: 'pointer', borderBottom: `1px dashed ${token.colorPrimary}` }}
                    onClick={(e) => { e.stopPropagation(); if (matchedCandidate.id) navigate(`/patient/detail/${matchedCandidate.id}`) }}
                  >
                    {matchedPatientName}
                  </span>
                </Popover>
              </Text>
            ) : record._loading ? (
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>
                <LoadingOutlined spin style={{ fontSize: 12, marginRight: 4 }} />加载匹配信息...
              </Text>
            ) : null
          )}
        </Space>
        <Space size={8} onClick={(e) => e.stopPropagation()}
          style={{ opacity: isHovered || isAutoArchiving ? 1 : 0, transition: 'opacity 0.2s', flexShrink: 0, marginLeft: 8 }}
        >
          {hoverActions}
        </Space>
      </div>
    )
  }, [expandedGroups, getGroupActionNodes, handleGroupMouseEnter, hoveredGroupKey, isFilterActive, toggleGroup, token.colorPrimary, token.colorTextSecondary])

  const renderPatientGroupCard = useCallback((record) => {
    const isActive = activeGroupKey === record.key
    const isVirtualPendingGroup = record._groupType === 'pending_parse'
    const isHovered = hoveredGroupKey === record.key
    const actions = isVirtualPendingGroup
      ? []
      : getGroupActionNodes(record, { expandDetailLabel: isHovered })
    return (
      <div
        key={record.key}
        role="button"
        tabIndex={0}
        onClick={() => setActiveGroupKey(record.key)}
        onMouseEnter={() => handleGroupMouseEnter(record)}
        onMouseLeave={() => setHoveredGroupKey(null)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setActiveGroupKey(record.key)
          }
        }}
        style={{
          border: `1px solid ${isActive ? token.colorPrimary : token.colorBorder}`,
          borderRadius: 8,
          padding: '10px 12px',
          background: isActive ? token.colorPrimaryBg : token.colorBgContainer,
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <Space size={8} style={{ flexWrap: 'wrap' }}>
          <Tooltip title={record._badge?.tip}>
            <span style={{ fontSize: 14 }}>{record._badge?.icon}</span>
          </Tooltip>
          <Text strong ellipsis={{ tooltip: record._label }} style={{ fontSize: 14, maxWidth: '100%' }}>
            {record._label}
          </Text>
          <Tag style={{ marginInlineEnd: 0 }}>{record._count || 0}份</Tag>
          {record._loading && <LoadingOutlined spin style={{ fontSize: 12, color: token.colorPrimary }} />}
        </Space>
        {actions.length > 0 && (
          <Space size={8} wrap onClick={(event) => event.stopPropagation()}>
            {actions}
          </Space>
        )}
      </div>
    )
  }, [activeGroupKey, getGroupActionNodes, handleGroupMouseEnter, hoveredGroupKey, token.colorBgContainer, token.colorBorder, token.colorPrimary, token.colorPrimaryBg])

  /**
   * 渲染可拖拽列宽的表头内容。
   *
   * @param {React.ReactNode} titleNode 表头原始内容
   * @param {string} columnKey 列 key
   * @returns {React.ReactNode}
   */
  const renderResizableColumnTitle = useCallback((titleNode, columnKey) => (
    <div style={{ position: 'relative', paddingRight: FILE_LIST_GROUP_PANEL_SPLITTER_WIDTH }}>
      {titleNode}
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={`调整列宽-${columnKey}`}
        onMouseDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
          const startX = event.clientX
          const startWidth = Number(columnWidths[columnKey] || FILE_LIST_COLUMN_DEFAULT_WIDTHS[columnKey] || 140)
          setResizingColumnKey(columnKey)

          const handleMouseMove = (moveEvent) => {
            const bounds = FILE_LIST_COLUMN_WIDTH_BOUNDS[columnKey] || { min: 100, max: 600 }
            const delta = moveEvent.clientX - startX
            const nextWidth = Math.max(bounds.min, Math.min(bounds.max, startWidth + delta))
            setColumnWidths((prev) => ({ ...prev, [columnKey]: nextWidth }))
          }

          const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            setResizingColumnKey('')
          }

          document.addEventListener('mousemove', handleMouseMove)
          document.addEventListener('mouseup', handleMouseUp)
          document.body.style.cursor = 'col-resize'
          document.body.style.userSelect = 'none'
        }}
        style={{
          position: 'absolute',
          right: -6,
          top: -8,
          height: 'calc(100% + 16px)',
          width: FILE_LIST_GROUP_PANEL_SPLITTER_WIDTH,
          cursor: 'col-resize',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2,
        }}
      >
        <span
          style={{
            width: 2,
            height: '60%',
            borderRadius: 999,
            background: resizingColumnKey === columnKey ? token.colorPrimary : token.colorBorder,
            opacity: resizingColumnKey === columnKey ? 1 : 0.6,
            transition: 'all 0.2s ease',
          }}
        />
      </span>
    </div>
  ), [columnWidths, resizingColumnKey, token.colorBorder, token.colorPrimary])

  // ─── Table 列定义（扁平模式：分组行通过 colSpan 跨列） ───
  const columns = useMemo(() => {
    const COL_COUNT = viewMode === 'table' ? 8 : 6

    return [
      {
        title: renderResizableColumnTitle((
          <Space size={4}>
            <span>文件名</span>
            <SortIcon field="file_name" />
            <FilterIcon filterKey="fileName" hasFilter={!!columnFilters.fileName} />
          </Space>
        ), 'file_name'),
        dataIndex: 'file_name',
        key: 'file_name',
        width: columnWidths.file_name || FILE_LIST_COLUMN_DEFAULT_WIDTHS.file_name,
        ellipsis: true,
        onCell: (record) => {
          if (record._isGroup) return { colSpan: COL_COUNT }
          return {}
        },
        render: (name, record) => {
          if (record._isGroup) return renderGroupRow(record)
          const icon = record.file_type === 'pdf'
            ? <FilePdfOutlined style={{ color: appThemeToken.colorError, fontSize: 16 }} />
            : <FileImageOutlined style={{ color: appThemeToken.colorPrimary, fontSize: 16 }} />
          return (
            <Space size={8} style={{ paddingLeft: record._indent ? 24 : 0 }}>
              {icon}
              <div style={{ overflow: 'hidden' }}>
                <Tooltip title={name}>
                  <Text strong ellipsis style={{ display: 'block', fontSize: 14 }}>{name}</Text>
                </Tooltip>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {formatFileSize(record.file_size)}
                </Text>
              </div>
            </Space>
          )
        },
      },
      ...(viewMode === 'table'
        ? [
            {
              title: renderResizableColumnTitle('文档摘要', 'document_metadata_summary'),
              key: 'document_metadata_summary',
              width: columnWidths.document_metadata_summary || FILE_LIST_COLUMN_DEFAULT_WIDTHS.document_metadata_summary,
              onCell: (record) => (record._isGroup ? { colSpan: 0 } : {}),
              render: (_, record) => {
                if (record._isGroup) return null
                const summaryText = formatPatientSummary(record.document_metadata_summary)
                return (
                  <Tooltip title={summaryText}>
                    <Text ellipsis style={{ display: 'block', fontSize: 12 }}>
                      {summaryText}
                    </Text>
                  </Tooltip>
                )
              },
            },
            {
              title: renderResizableColumnTitle('绑定摘要', 'bound_patient_summary'),
              key: 'bound_patient_summary',
              width: columnWidths.bound_patient_summary || FILE_LIST_COLUMN_DEFAULT_WIDTHS.bound_patient_summary,
              onCell: (record) => (record._isGroup ? { colSpan: 0 } : {}),
              render: (_, record) => {
                if (record._isGroup) return null
                const boundSummary = formatPatientSummary(record.bound_patient_summary || record.patient_info)
                return (
                  <Tooltip title={boundSummary}>
                    <Text ellipsis style={{ display: 'block', fontSize: 12 }}>
                      {boundSummary}
                    </Text>
                  </Tooltip>
                )
              },
            },
          ]
        : []),
      {
        title: renderResizableColumnTitle((
          <Space size={4}>
            <span>文件类型</span>
            <FilterIcon filterKey="fileType" hasFilter={columnFilters.fileType.length > 0} />
          </Space>
        ), 'document_type'),
        dataIndex: 'document_sub_type',
        key: 'document_type',
        width: columnWidths.document_type || FILE_LIST_COLUMN_DEFAULT_WIDTHS.document_type,
        onCell: (record) => record._isGroup ? { colSpan: 0 } : {},
        render: (subType, record) => {
          if (record._isGroup) return null
          const typeText = subType || record.document_type || '未分类'
          return (
            <Tooltip title={typeText}>
              <span
                style={{
                  ...getMetaChipStyle('neutral', 'outline'),
                  maxWidth: META_CHIP_TEXT_MAX_WIDTH,
                }}
              >
                {typeText}
              </span>
            </Tooltip>
          )
        },
      },
      {
        title: renderResizableColumnTitle((
          <Space size={4}>
            <span>处理阶段</span>
            <FilterIcon filterKey="taskStatus" hasFilter={columnFilters.taskStatus.length > 0} />
          </Space>
        ), 'task_status'),
        dataIndex: 'task_status',
        key: 'task_status',
        width: columnWidths.task_status || FILE_LIST_COLUMN_DEFAULT_WIDTHS.task_status,
        onCell: (record) => record._isGroup ? { colSpan: 0 } : {},
        render: (status, record) => {
          if (record._isGroup) return null
          return <StatusProgressBar status={status} record={record} pollingParseIds={pollingParseIds} matchingDocIds={matchingDocIds} />
        },
      },
      {
        title: renderResizableColumnTitle((
          <Space size={4}>
            <span>状态信息</span>
            <FilterIcon filterKey="statusInfo" hasFilter={columnFilters.statusInfo.length > 0} />
          </Space>
        ), 'status_info'),
        key: 'status_info',
        width: columnWidths.status_info || FILE_LIST_COLUMN_DEFAULT_WIDTHS.status_info,
        onCell: (record) => record._isGroup ? { colSpan: 0 } : {},
        render: (_, record) => {
          if (record._isGroup) return null
          const ts = record.task_status
          const config = getStatusInfoConfig(record)
          if (config) return (
            <Tooltip title={config.text}>
              <span
                style={{
                  ...getMetaChipStyle(config.semantic, 'soft'),
                  maxWidth: META_CHIP_TEXT_MAX_WIDTH,
                  ...getStatusInfoTwoLineClampStyle(),
                }}
              >
                {config.text}
              </span>
            </Tooltip>
          )
          if (ts === 'uploading') return (
            <span
              style={{
                ...getMetaChipStyle('processing', 'soft'),
                maxWidth: META_CHIP_TEXT_MAX_WIDTH,
                ...getStatusInfoTwoLineClampStyle(),
              }}
            >
              上传中
            </span>
          )
          return <span style={{ color: appThemeToken.colorTextTertiary }}>--</span>
        },
      },
      {
        title: renderResizableColumnTitle((
          <Space size={4}>
            <span>上传时间</span>
            <SortIcon field="created_at" />
            <FilterIcon filterKey="dateRange" hasFilter={!!columnFilters.dateRange} />
          </Space>
        ), 'created_at'),
        dataIndex: 'created_at',
        key: 'created_at',
        width: columnWidths.created_at || FILE_LIST_COLUMN_DEFAULT_WIDTHS.created_at,
        onCell: (record) => record._isGroup ? { colSpan: 0 } : {},
        render: (time, record) => {
          if (record._isGroup) return null
          return <Text style={{ fontSize: 12 }}>{formatTime(time)}</Text>
        },
      },
      {
        title: renderResizableColumnTitle('操作', 'actions'),
        key: 'actions',
        width: columnWidths.actions || FILE_LIST_COLUMN_DEFAULT_WIDTHS.actions,
        fixed: 'right',
        onCell: (record) => record._isGroup ? { colSpan: 0 } : { onClick: (e) => e.stopPropagation() },
        render: (_, record) => {
          if (record._isGroup) return null
          const isStarting = startingParseIds.has(record.id)
          const isPolling = pollingParseIds.has(record.id)
          const isMatching = matchingDocIds.has(record.id)
          const isParsingStatus = record.task_status === 'parsing' || isPolling
          const isMatchingStatus = isMatching || record.task_status === 'ai_matching'
          const canArchive = ['extracted', 'parsed', 'pending_confirm_new', 'pending_confirm_review',
            'pending_confirm_uncertain', 'auto_archived'].includes(record.task_status)
          const canAiMatch = ['parsed', 'extracted', 'pending_confirm_new', 'pending_confirm_review',
            'pending_confirm_uncertain', 'auto_archived'].includes(record.task_status) && !isMatchingStatus

          const isArchived = record.task_status === 'archived'

          const menuItems = [
            { key: 'reparse', icon: isParsingStatus ? <LoadingOutlined spin /> : <ReloadOutlined />, label: isParsingStatus ? '识别中...' : (isStarting ? '启动中...' : '重新识别'), disabled: isParsingStatus || isStarting, onClick: () => handleParseDocument(record.id) },
            { key: 'ai_match', icon: isMatchingStatus ? <LoadingOutlined spin /> : <RobotOutlined />, label: isMatchingStatus ? 'AI匹配中...' : 'AI匹配', disabled: !canAiMatch, onClick: () => handleAiMatchPatient(record.id) },
            { type: 'divider' },
            { key: 'archive', icon: <FolderOpenOutlined />, label: '归档', disabled: !canArchive && !isArchived, children: [
              { key: 'new_patient', icon: <UserAddOutlined />, label: '新建患者', disabled: !canArchive, onClick: () => handleCreatePatientFromDoc(record) },
              { key: 'confirm_rec', icon: <CheckCircleOutlined />, label: '确认推荐', disabled: !canArchive, onClick: () => handleConfirmRecommendedArchive(record) },
              { key: 'manual_select', icon: <TeamOutlined />, label: '手动选择', disabled: !canArchive, onClick: () => handleArchivePatient(record.id) },
            ]},
            { key: 'unbind', icon: <DisconnectOutlined />, label: '解绑', disabled: !isArchived, onClick: () => handleUnbindDocument(record.id, record.file_name) },
            { type: 'divider' },
            { key: 'download', icon: <DownloadOutlined />, label: '下载', onClick: () => handleDownload(record) },
            { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true, onClick: () => handleDeleteDocument(record.id, record.file_name) },
          ]
          return (
            <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
              <Button type="text" size="small" icon={<MoreOutlined />} />
            </Dropdown>
          )
        },
      },
    ]
  }, [columnFilters, pollingParseIds, matchingDocIds, startingParseIds, sorter, expandedGroups, viewMode,
    handleFileClick, handleParseDocument, handleAiMatchPatient, handleDeleteDocument, handleUnbindDocument,
    handleDownload, handleCreatePatientFromDoc, handleConfirmRecommendedArchive, handleArchivePatient,
    renderGroupRow, renderResizableColumnTitle])

  // ─── 选中文件行：按分组聚合，支持“按分组全选” ───
  const groupFileKeysMap = useMemo(() => {
    const map = new Map()
    treeTableData.forEach((r) => {
      if (r._isGroup) {
        map.set(r.key, [])
      } else if (r._isFile) {
        const parentKey = r._groupId ? `group:${r._groupId}` : (r._patientId ? `patient:${r._patientId}` : null)
        if (!parentKey) return
        if (!map.has(parentKey)) map.set(parentKey, [])
        map.get(parentKey).push(r.key)
      }
    })
    return map
  }, [treeTableData])

  /**
   * 文件列表主容器固定高度，确保页面主体背景稳定铺满。
   */
  const FILE_LIST_MAIN_CONTAINER_HEIGHT = toViewportHeight(PAGE_LAYOUT_HEIGHTS.fileList.containerOffset)
  /**
   * 小于该行数时不启用纵向固定滚动区，避免少量数据时滚动条轨道常驻。
   */
  const FILE_LIST_MIN_ROWS_FOR_VERTICAL_SCROLL = 6
  /**
   * 仅在数据量较大时启用纵向滚动，保持与其他页面一致的滚动条体验。
   */
  const fileListTableScrollY = displayDataSource.length > FILE_LIST_MIN_ROWS_FOR_VERTICAL_SCROLL
    ? FILE_LIST_TABLE_SCROLL_Y
    : undefined
  const tableScrollX = useMemo(() => {
    const widthSum = columns.reduce((acc, item) => acc + (Number(item?.width) || 0), 0)
    const selectionColumnBuffer = 72
    const minWidth = viewMode === 'table' ? 1320 : 920
    return Math.max(minWidth, widthSum + selectionColumnBuffer)
  }, [columns, viewMode])

  const tableRowSelection = useMemo(() => ({
    selectedRowKeys,
    onChange: setSelectedRowKeys,
    /**
     * 自定义选择列单元格：组行渲染“组内全选”，文件行使用默认勾选框。
     */
    renderCell: (checked, record, index, originNode) => {
      if (!record._isGroup) return originNode

      const groupFileKeys = groupFileKeysMap.get(record.key) || []
      const groupSelectedCount = groupFileKeys.filter((key) => selectedRowKeys.includes(key)).length
      const groupAllSelected = groupFileKeys.length > 0 && groupSelectedCount === groupFileKeys.length
      const groupIndeterminate = groupSelectedCount > 0 && !groupAllSelected
      const isExpanded = expandedGroups.includes(record.key)

      return (
        <Checkbox
          checked={groupAllSelected}
          indeterminate={groupIndeterminate}
          disabled={!isExpanded || groupFileKeys.length === 0}
          onChange={(event) => {
            const shouldSelect = event.target.checked
            setSelectedRowKeys((previous) => {
              const next = new Set(previous)
              if (shouldSelect) {
                groupFileKeys.forEach((key) => next.add(key))
              } else {
                groupFileKeys.forEach((key) => next.delete(key))
              }
              return Array.from(next)
            })
          }}
          onClick={(event) => event.stopPropagation()}
        />
      )
    },
    getCheckboxProps: (record) => ({
      disabled: !!record._isGroup,
    }),
  }), [expandedGroups, groupFileKeysMap, selectedRowKeys])

  const getTableRowProps = useCallback((record) => ({
    style: record._isGroup
      ? { cursor: 'pointer', background: token.colorFillTertiary }
      : { cursor: 'pointer', background: record._indent ? token.colorPrimaryBg : appThemeToken.colorBgContainer },
    onClick: (event) => {
      if (record._isGroup) {
        toggleGroup(record)
      } else if (record._isFile) {
        if (event.target.closest('.ant-dropdown-trigger, .ant-btn, .ant-checkbox')) return
        handleFileClick(record)
      }
    },
  }), [handleFileClick, toggleGroup, token.colorFillTertiary, token.colorPrimaryBg])

  /**
   * 启动患者视图左右栏分隔条拖拽，允许用户调整左栏宽度。
   *
   * @param {React.MouseEvent<HTMLDivElement>} event 鼠标按下事件
   */
  const handleGroupPanelResizeMouseDown = useCallback((event) => {
    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startWidth = patientGroupPanelWidth
    setIsGroupSplitterDragging(true)

    const handleMouseMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX
      const nextWidth = Math.max(
        FILE_LIST_GROUP_PANEL_MIN_WIDTH,
        Math.min(FILE_LIST_GROUP_PANEL_MAX_WIDTH, startWidth + delta)
      )
      setPatientGroupPanelWidth(nextWidth)
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setIsGroupSplitterDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [patientGroupPanelWidth])

  // ─── 渲染 ───
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: FILE_LIST_MAIN_CONTAINER_HEIGHT }}>
      {/* 筛选 overlay：固定定位，表格重渲染时位置不变，避免闪烁 */}
      {openFilterKey && overlayPosition && createPortal(
        <>
          <div
            role="presentation"
            style={{ position: 'fixed', inset: 0, zIndex: 1040 }}
            onClick={() => closeFilterOverlay(openFilterKey)}
          />
          <div
            style={{
              position: 'fixed',
              left: overlayPosition.left,
              top: overlayPosition.top,
              zIndex: 1050,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <FilterDropdownOverlayContent
              filterKey={openFilterKey}
              tempFilters={tempFilters}
              setTempFilters={setTempFilters}
              onApply={applyFilter}
              onReset={resetFilter}
              options={
                openFilterKey === 'dateRange'
                  ? null
                  : openFilterKey === 'fileType'
                    ? availableFileTypeCategories
                    : openFilterKey === 'taskStatus'
                      ? availableTaskStatusOptions
                      : availableStatusInfoOptions
              }
            />
          </div>
        </>,
        document.body
      )}
      {/* 合并后的主容器：顶部操作区 + 分割线 + 列表区 */}
      <div style={{
        background: appThemeToken.colorBgContainer,
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        padding: '12px 14px 10px',
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          position: 'relative',
        }}>
          <Space size={12}>
            <Segmented
              size="middle"
              value={viewMode}
              onChange={handleViewModeChange}
              options={[
                { label: '患者视图', value: 'patient' },
                { label: '表格视图', value: 'table' },
              ]}
            />
          </Space>
          <Space size={12}>
            <Input
              placeholder="搜索文件名..."
              prefix={<SearchOutlined style={{ color: token.colorTextSecondary }} />}
              allowClear
              value={columnFilters.fileName}
              onChange={(e) => setColumnFilters((prev) => ({ ...prev, fileName: e.target.value }))}
              onPressEnter={() => {
                setPagination((prev) => ({ ...prev, current: 1 }))
              }}
              style={{ width: 240 }}
            />
            <Button icon={<ReloadOutlined />} onClick={() => refreshAll({ forceTree: true })} loading={treeLoading}>
              刷新
            </Button>
            <Button type="primary" icon={<UploadOutlined />} onClick={() => setUploadModalVisible(true)}>
              上传
            </Button>
          </Space>

          {/* 顶部悬浮批量操作条 */}
          {selectedRowKeys.length > 0 && (
            <div style={{
              position: 'absolute', top: '50%', left: 10, transform: 'translateY(-50%)', zIndex: 10,
              background: appThemeToken.colorBgContainer, padding: '6px 16px',
              display: 'flex', alignItems: 'center', gap: 8,
              borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              border: `1px solid ${token.colorBorder}`,
            }}>
              <Space size={8}>
                <Text strong style={{ whiteSpace: 'nowrap' }}>已选中: {selectedRowKeys.length}</Text>
                <div style={{ width: 1, height: 20, background: token.colorBorder }} />
                <Button
                  icon={<ReloadOutlined />}
                  loading={batchReidentifyLoading}
                  onClick={handleBatchParseArchive}
                >
                  重新识别
                </Button>
                <Button
                  type="primary"
                  icon={<FolderOpenOutlined />}
                  onClick={handleBatchConfirmRecommendedArchive}
                  loading={batchConfirmArchiveLoading}
                >
                  确认推荐
                </Button>
                <Button
                  icon={<UserAddOutlined />}
                  onClick={handleBatchCreatePatientFromSelection}
                >
                  新建患者
                </Button>
                <Button
                  icon={<TeamOutlined />}
                  onClick={() => {
                    if (!selectedRowKeys.length) return message.warning('请先选择文档')
                    setSelectedBatchPatient(null)
                    setBatchPatientSearchValue('')
                    setBatchPatientSearchResults([])
                    setBatchPatientSearchLoading(true)
                    setBatchManualArchiveVisible(true)
                  }}
                >
                  手动选择
                </Button>
                <Button danger icon={<DeleteOutlined />} onClick={handleBatchDelete} loading={batchDeleteLoading}>
                  删除
                </Button>
                <Button
                  type="text"
                  icon={<CloseOutlined />}
                  onClick={() => setSelectedRowKeys([])}
                  style={{ color: token.colorTextSecondary }}
                />
              </Space>
            </div>
          )}
        </div>

        <div style={{ borderTop: `1px solid ${appThemeToken.colorBorder}`, marginTop: 10, marginInline: -14 }} />

        {viewMode === 'patient' ? (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
              paddingTop: 10,
              display: 'flex',
              gap: 0,
            }}
          >
            <div
              style={{
                width: patientGroupPanelWidth,
                minWidth: FILE_LIST_GROUP_PANEL_MIN_WIDTH,
                maxWidth: FILE_LIST_GROUP_PANEL_MAX_WIDTH,
                border: `1px solid ${token.colorBorder}`,
                borderRadius: 8,
                background: token.colorBgContainer,
                padding: 10,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {patientGroupList.length ? (
                patientGroupList.map((record) => renderPatientGroupCard(record))
              ) : (
                <Text type="secondary" style={{ padding: 8 }}>当前筛选条件下暂无可选分组</Text>
              )}
            </div>
            <div
              role="separator"
              aria-label="调整患者分组栏宽度"
              aria-orientation="vertical"
              onMouseDown={handleGroupPanelResizeMouseDown}
              onMouseEnter={() => setIsGroupSplitterHover(true)}
              onMouseLeave={() => setIsGroupSplitterHover(false)}
              style={{
                width: FILE_LIST_GROUP_PANEL_SPLITTER_WIDTH,
                cursor: 'col-resize',
                borderRadius: 999,
                background: isGroupSplitterDragging ? token.colorPrimaryBorder : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 2,
                  height: 48,
                  borderRadius: 999,
                  background: isGroupSplitterDragging
                    ? token.colorPrimary
                    : (isGroupSplitterHover ? token.colorBorderSecondary : token.colorBorder),
                  opacity: isGroupSplitterDragging || isGroupSplitterHover ? 1 : 0.45,
                  transition: 'all 0.2s ease',
                }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
              <Table
                columns={columns}
                dataSource={displayDataSource}
                rowKey="key"
                size="middle"
                loading={fileListLoading}
                pagination={tablePagination}
                rowSelection={tableRowSelection}
                onRow={getTableRowProps}
                scroll={{ x: tableScrollX, y: fileListTableScrollY }}
                virtual={displayDataSource.length > 80}
                sticky
                className="table-scrollbar-unified"
                style={{ background: 'transparent' }}
              />
            </div>
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
              paddingTop: 10,
            }}
          >
            <Table
              columns={columns}
              dataSource={displayDataSource}
              rowKey="key"
              size="middle"
              loading={fileListLoading}
              pagination={tablePagination}
              rowSelection={tableRowSelection}
              onRow={getTableRowProps}
              scroll={{ x: tableScrollX, y: fileListTableScrollY }}
              virtual={displayDataSource.length > 80}
              sticky
              className="table-scrollbar-unified"
              style={{ background: 'transparent' }}
            />
          </div>
        )}
      </div>

      {/* ─── 弹窗/抽屉 ─── */}

      {/* 上传弹窗 */}
      <Modal
        title="上传文件"
        open={uploadModalVisible}
        onCancel={() => setUploadModalVisible(false)}
        footer={null}
        width={modalWidthPreset.narrow}
        styles={modalBodyPreset}
        centered
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 0' }}>
          <Button block size="large" icon={<FileTextOutlined />} onClick={() => fileInputRef.current?.click()}>
            选择文件
          </Button>
          <Button block size="large" icon={<FolderOpenOutlined />} onClick={() => folderInputRef.current?.click()}>
            选择文件夹
          </Button>
          <Text type="secondary" style={{ textAlign: 'center', fontSize: 12 }}>
            支持 PDF、JPG、JPEG、PNG，单个文件最大 50MB
          </Text>
        </div>
        <input ref={fileInputRef} type="file" style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png" multiple onChange={handleFileInputChange} />
        <input ref={folderInputRef} type="file" style={{ display: 'none' }} onChange={handleFolderInputChange} {...{ webkitdirectory: '', directory: '' }} />
      </Modal>

      {/* 上传面板 */}
      <UploadPanel
        visible={uploadManager.panelVisible}
        onClose={() => uploadManager.setPanelVisible(false)}
        tasks={uploadManager.tasks}
        stats={uploadManager.stats}
        isUploading={uploadManager.isUploading}
        isPaused={uploadManager.isPaused}
        onStartUpload={uploadManager.startUpload}
        onPauseUpload={uploadManager.pauseUpload}
        onResumeUpload={uploadManager.resumeUpload}
        onRetryTask={uploadManager.retryTask}
        onCancelTask={uploadManager.cancelTask}
        onRemoveTask={uploadManager.removeTask}
        onRetryAllFailed={uploadManager.retryAllFailed}
        onClearCompleted={uploadManager.clearCompleted}
        onClearAll={uploadManager.clearAll}
      />

      {/* 上传悬浮球：面板关闭时显示，点击重新打开面板 */}
      {!uploadManager.panelVisible && (
        <UploadFloatingButton
          tasks={uploadManager.tasks}
          stats={uploadManager.stats}
          isUploading={uploadManager.isUploading}
          isPaused={uploadManager.isPaused}
          onClick={() => uploadManager.setPanelVisible(true)}
        />
      )}

      {/* 文档详情弹窗 */}
      <DocumentDetailModal
        ref={detailModalRef}
        visible={detailModalVisible}
        document={selectedDocument}
        patientId={selectedDocument?.patientId}
        onClose={handleDetailModalClose}
        onReExtract={handleReExtract}
        onChangePatient={handleChangePatient}
        onArchivePatient={handleArchivePatient}
        onExtractSuccess={() => refreshAll({ forceTree: true })}
        onRefresh={() => refreshAll({ forceTree: true })}
        onDeleteSuccess={() => { setDetailModalVisible(false); setSelectedDocument(null); refreshAll({ forceTree: true }) }}
        refreshTrigger={detailRefreshTrigger}
        showTaskStatus
      />

      {/* 创建患者抽屉 */}
      <CreatePatientDrawer
        open={createPatientDrawerOpen}
        onClose={() => { setCreatePatientDrawerOpen(false); setCreatePatientPrefillValues(null) }}
        documentIds={createPatientDocIds}
        prefillValues={createPatientPrefillValues}
        mode={createPatientMode}
        groupId={createPatientGroupId}
        onSubmit={async (patientData) => createPatient(patientData)}
        onSuccess={async (result) => {
          setCreatePatientDrawerOpen(false)
          setCreatePatientPrefillValues(null)
          const patient = result?.response?.data || result?.patient || null
          const patientId = patient?.id || result?.patientId
          if (!patientId) {
            message.error('患者创建成功，但未获取到患者 ID，无法归档')
            refreshAll({ forceTree: true })
            return
          }
          if (createPatientMode === 'group' && createPatientGroupId) {
            try {
              const res = await confirmGroupArchive(createPatientGroupId, patientId, true)
              if (res?.success)
                message.success(`新建患者「${patient?.name || '未知'}」并归档完成：成功 ${res.data?.archived_count || 0} 个文档`)
              else message.error(res?.message || '新建患者成功但归档失败')
            } catch {
              message.error('归档失败')
            }
          } else if (createPatientMode === 'docs' && createPatientDocIds.length) {
            try {
              let archivedCount = 0
              const errors = []
              for (const documentId of createPatientDocIds) {
                try {
                  const res = await archiveDocument(documentId, patientId, true)
                  if (res?.success) archivedCount += 1
                  else errors.push({ documentId, message: res?.message || '归档失败' })
                } catch (error) {
                  errors.push({ documentId, message: error?.message || '归档失败' })
                }
              }
              if (archivedCount === createPatientDocIds.length) message.success(`新建患者「${patient?.name || '未知'}」并归档完成：成功 ${archivedCount} 个文档`)
              else if (archivedCount > 0) message.warning(`新建患者成功，归档成功 ${archivedCount} 个，失败 ${errors.length} 个`)
              else message.error('新建患者成功但归档失败')
            } catch {
              message.error('归档失败')
            }
          }
          setSelectedRowKeys([])
          refreshAll({ forceTree: true })
        }}
      />

      {/* 患者匹配弹窗（需要始终压在文档详情之上） */}
      <Modal
        title={matchModalMode === 'archive' ? '手动选择' : '更换归档患者'}
        open={patientMatchVisible}
        onCancel={() => { setPatientMatchVisible(false); setSelectedMatchDocument(null) }}
        footer={null}
        width={modalWidthPreset.standard}
        styles={modalBodyPreset}
        centered
        zIndex={1400}
      >
        {matchInfoLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
        ) : selectedMatchDocument ? (
          <div>
            <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="文件名">{selectedMatchDocument.fileName}</Descriptions.Item>
              <Descriptions.Item label="类型">{selectedMatchDocument.documentSubType || selectedMatchDocument.documentType || '--'}</Descriptions.Item>
            </Descriptions>

            {selectedMatchDocument.candidates?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>AI 推荐候选：</Text>
                <List
                  size="small"
                  dataSource={selectedMatchDocument.candidates}
                  renderItem={(c) => (
                    <List.Item
                      style={{ cursor: 'pointer', background: selectedMatchPatient?.id === c.id ? token.colorPrimaryBg : undefined }}
                      onClick={() => { setSelectedMatchPatient(c); setPatientSearchValue(c.name) }}
                      extra={
                        <Button
                          type="primary"
                          size="small"
                          onClick={(e) => { e.stopPropagation(); handleConfirmMatch(selectedMatchDocument.id, c.id) }}
                        >
                          选择
                        </Button>
                      }
                    >
                      <List.Item.Meta
                        title={`${c.name || '未知'} ${c.gender || ''} ${c.age || ''}`}
                        description={`匹配度: ${formatMatchScorePercent(c.similarity || 0)}`}
                      />
                    </List.Item>
                  )}
                />
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>搜索患者：</Text>
              <Input.Search
                placeholder="输入姓名或编号搜索"
                value={patientSearchValue}
                onChange={(e) => handlePatientSearch(e.target.value)}
                loading={patientSearchLoading}
                allowClear
              />
            </div>

            {showSearchResults && (
              <List
                size="small"
                bordered
                style={{ maxHeight: 200, overflow: 'auto' }}
                dataSource={patientSearchResults}
                locale={{ emptyText: '未找到匹配的患者' }}
                renderItem={(p) => (
                  <List.Item
                    style={{ cursor: 'pointer', background: selectedMatchPatient?.id === p.id ? token.colorPrimaryBg : token.colorBgContainer }}
                    onClick={() => { setSelectedMatchPatient(p); setPatientSearchValue(p.name); setShowSearchResults(false) }}
                  >
                    <List.Item.Meta title={p.name ? maskName(p.name) : '-'} description={`${p.gender || '--'} | ${p.age ? p.age + '岁' : '--'}`} />
                  </List.Item>
                )}
              />
            )}

            {selectedMatchPatient && (
              <div style={{ marginTop: 12, textAlign: 'right' }}>
                <Button
                  type="primary"
                  loading={archivingLoading}
                  onClick={handleConfirmPatientMatch}
                >
                  确认{matchModalMode === 'archive' ? '归档' : '更换'}到：{selectedMatchPatient.name ? maskName(selectedMatchPatient.name) : '-'}
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      {/* 分组手动选择归档弹窗 */}
      <Modal
        title="手动选择（按组）"
        open={groupManualArchiveVisible}
        onCancel={() => setGroupManualArchiveVisible(false)}
        onOk={handleConfirmGroupManualArchive}
        okButtonProps={{ disabled: !selectedGroupPatient?.id }}
        width={modalWidthPreset.standard}
        styles={modalBodyPreset}
        centered
      >
        <Alert type="info" showIcon message="将把该分组下所有文档归档到你选择的患者" style={{ marginBottom: 12 }} />
        <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
          可直接在下方列表中点选；也可输入关键词筛选
        </Text>
        <Input.Search
          placeholder="输入姓名以筛选（不输入则显示最近更新的患者）"
          value={groupPatientSearchValue}
          onChange={(e) => handleGroupPatientSearch(e.target.value)}
          loading={groupPatientSearchLoading}
          allowClear
        />
        <div style={{ marginTop: 12, maxHeight: 320, overflow: 'auto', border: `1px solid ${token.colorBorder}`, borderRadius: 6 }}>
          <List
            size="small"
            dataSource={groupPatientSearchResults}
            locale={{
              emptyText: groupPatientSearchLoading ? '加载中…' : (groupPatientSearchValue.trim() ? '未找到匹配的患者' : '暂无可选患者'),
            }}
            renderItem={(p) => (
              <List.Item
                style={{ cursor: 'pointer', background: selectedGroupPatient?.id === p.id ? token.colorPrimaryBg : token.colorBgContainer }}
                onClick={() => setSelectedGroupPatient(p)}
              >
                <List.Item.Meta title={p.name ? maskName(p.name) : '-'} description={`${p.gender || '--'} | ${p.age ? p.age + '岁' : '--'} | ${p.patient_code || '--'}`} />
                {selectedGroupPatient?.id === p.id && <CheckCircleOutlined style={{ color: token.colorPrimary }} />}
              </List.Item>
            )}
          />
        </div>
      </Modal>

      {/* 批量手动选择归档弹窗 */}
      <Modal
        title="手动选择（批量）"
        open={batchManualArchiveVisible}
        onCancel={() => setBatchManualArchiveVisible(false)}
        onOk={handleConfirmBatchManualArchive}
        okButtonProps={{ disabled: !selectedBatchPatient?.id }}
        confirmLoading={batchProcessing}
        width={modalWidthPreset.standard}
        styles={modalBodyPreset}
        centered
      >
        <Alert type="info" showIcon message="将把你选中的所有文档归档到你选择的患者" style={{ marginBottom: 12 }} />
        <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
          可直接在下方列表中点选；也可输入关键词筛选
        </Text>
        <Input.Search
          placeholder="输入姓名以筛选（不输入则显示最近更新的患者）"
          value={batchPatientSearchValue}
          onChange={(e) => handleBatchPatientSearch(e.target.value)}
          loading={batchPatientSearchLoading}
          allowClear
        />
        <div style={{ marginTop: 12, maxHeight: 320, overflow: 'auto', border: `1px solid ${token.colorBorder}`, borderRadius: 6 }}>
          <List
            size="small"
            dataSource={batchPatientSearchResults}
            locale={{
              emptyText: batchPatientSearchLoading ? '加载中…' : (batchPatientSearchValue.trim() ? '未找到匹配的患者' : '暂无可选患者'),
            }}
            renderItem={(p) => (
              <List.Item
                style={{ cursor: 'pointer', background: selectedBatchPatient?.id === p.id ? token.colorPrimaryBg : token.colorBgContainer }}
                onClick={() => setSelectedBatchPatient(p)}
              >
                <List.Item.Meta title={p.name ? maskName(p.name) : '-'} description={`${p.gender || '--'} | ${p.age ? p.age + '岁' : '--'} | ${p.patient_code || '--'}`} />
                {selectedBatchPatient?.id === p.id && <CheckCircleOutlined style={{ color: token.colorPrimary }} />}
              </List.Item>
            )}
          />
        </div>
      </Modal>
    </div>
  )
}

export default FileList
