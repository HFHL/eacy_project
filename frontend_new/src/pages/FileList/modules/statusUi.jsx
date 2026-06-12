import React from 'react'
import { Tooltip } from 'antd'
import { LoadingOutlined } from '@ant-design/icons'
import { appThemeToken } from '../../../styles/themeTokens'
import { TASK_STATUS_DISPLAY_CONFIG } from './constants'

export const STATUS_PROGRESS_MAP = {
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

export const STAGE_LABELS = ['上传', '识别', '抽取', '匹配', '归档']

export const isLlmExtractionFailure = (record) =>
  record?.task_status === 'parse_failed' && typeof record?.parse_error === 'string' && record.parse_error.includes('LLM 抽取失败')

export const GROUP_PRIMARY_ACTION_TEXT_MAX_WIDTH = 132
export const META_CHIP_TEXT_MAX_WIDTH = 112

/**
 * 根据任务状态返回统一语义类型。
 *
 * @param {string | undefined | null} status 任务状态
 * @returns {'neutral' | 'processing' | 'success' | 'warning' | 'error'}
 */
export const getTaskStatusSemantic = (status) => {
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
export const getMetaChipStyle = (semantic, variant = 'soft') => {
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
export const getStatusInfoTwoLineClampStyle = () => ({
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
export const renderGroupPrimaryActionLabel = (label) => (
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

export const getStatusConfig = (status, record) => {
  if (isLlmExtractionFailure(record)) {
    return { color: 'error', text: '异常' }
  }
  return TASK_STATUS_DISPLAY_CONFIG[status] || { text: status || '未知' }
}

export const getStatusInfoConfig = (record) => {
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

export const StatusProgressBar = ({ status, record, pollingParseIds, matchingDocIds }) => {
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
