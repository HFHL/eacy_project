/**
 * 患者详情页面常量定义
 */

// 置信度配置
export const CONFIDENCE_CONFIG = {
  high: { color: 'green', text: '高置信度' },
  medium: { color: 'orange', text: '中置信度' },
  low: { color: 'red', text: '低置信度' }
}

// 字段状态配置
export const FIELD_STATUS = {
  COMPLETED: 'completed',
  PARTIAL: 'partial', 
  INCOMPLETE: 'incomplete'
}

// 文档类型配置
export const DOCUMENT_TYPES = {
  PDF: 'PDF',
  IMAGE: 'Image',
  EXCEL: 'Excel'
}

// 文档状态
export const DOCUMENT_STATUS = {
  EXTRACTED: 'extracted',
  PENDING: 'pending',
  PROCESSING: 'processing'
}

// 冲突类型
export const CONFLICT_TYPES = {
  DATE_DIFF: '日期差异',
  VALUE_DIFF: '数值差异',
  TEXT_DIFF: '文本差异'
}

// 变更日志状态
export const CHANGE_LOG_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected'
}

// AI消息类型
export const AI_MESSAGE_TYPES = {
  AI: 'ai',
  USER: 'user'
}

// 字段类型
export const FIELD_TYPES = {
  FIELDS: 'fields',
  TABLE_FIELDS: 'table_fields'
}

// UI组件类型
export const UI_TYPES = {
  TEXT: 'text',
  TEXTAREA: 'textarea',
  NUMBER: 'number',
  SELECT: 'select',
  RADIO: 'radio',
  CHECKBOX: 'checkbox',
  DATE_PICKER: 'datepicker',
  DATE: 'date'
}

// 默认布局宽度
export const DEFAULT_LAYOUT = {
  EHR_LEFT_WIDTH: 250,
  EHR_RIGHT_WIDTH: Math.round(window.innerWidth * 0.5) // 默认占屏幕50%
}

// 展开状态默认配置
export const DEFAULT_EXPANDED_GROUPS = {
  basicInfo: true,
  medicalHistory: true,
  examination: false,
  treatment: false
}

export default {
  CONFIDENCE_CONFIG,
  FIELD_STATUS,
  DOCUMENT_TYPES,
  DOCUMENT_STATUS,
  CONFLICT_TYPES,
  CHANGE_LOG_STATUS,
  AI_MESSAGE_TYPES,
  FIELD_TYPES,
  UI_TYPES,
  DEFAULT_LAYOUT,
  DEFAULT_EXPANDED_GROUPS
}