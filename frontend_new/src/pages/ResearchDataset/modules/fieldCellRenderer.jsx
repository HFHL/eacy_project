import React from 'react'
import { Tooltip } from 'antd'

const getLeafFromFieldName = (name) => {
  if (!name) return null
  const text = String(name)
  if (text.includes('/')) return text.split('/').slice(-1)[0].trim()
  if (text.includes('.')) return text.split('.').slice(-1)[0].trim()
  return text.trim()
}

const toShortString = (value, max = 80) => {
  if (value === null || value === undefined) return ''
  const text = String(value).replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max)}...` : text
}

const summarizeObjectValue = (value, fieldData, fieldName) => {
  if (!value || typeof value !== 'object') return ''
  if (Object.prototype.hasOwnProperty.call(value, 'value') && typeof value.value !== 'object') {
    return toShortString(value.value, 80)
  }

  const preferredKeys = [
    fieldData?.field_name,
    getLeafFromFieldName(fieldName),
    'name',
    'type',
    'label',
    'id',
  ].filter(Boolean)
  for (const key of preferredKeys) {
    if (Object.prototype.hasOwnProperty.call(value, key) && typeof value[key] !== 'object') {
      return toShortString(value[key], 80)
    }
  }

  const parts = []
  for (const [key, item] of Object.entries(value)) {
    if (item === null || item === undefined) continue
    if (typeof item === 'object') continue
    parts.push(`${key}:${toShortString(item, 36)}`)
    if (parts.length >= 3) break
  }
  if (parts.length) return parts.join(' | ')

  try {
    return toShortString(JSON.stringify(value), 80)
  } catch (_error) {
    return '...'
  }
}

const formatDisplayValue = (value, fieldData, fieldName) => {
  if (Array.isArray(value)) {
    if (value.length === 0) return '0条'
    const first = value[0]
    const firstText = typeof first === 'object'
      ? summarizeObjectValue(first, fieldData, fieldName)
      : toShortString(first, 40)
    return value.length > 1 ? `${firstText} +${value.length - 1}` : firstText
  }
  if (typeof value === 'object') {
    return summarizeObjectValue(value, fieldData, fieldName) || '...'
  }
  return toShortString(value, 80)
}

const getFullValueText = (value) => {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) {
    return value.map(item => {
      if (item === null || item === undefined) return ''
      if (typeof item === 'object') {
        try {
          return JSON.stringify(item)
        } catch (_error) {
          return String(item)
        }
      }
      return String(item)
    }).join(', ')
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch (_error) {
      return String(value)
    }
  }
  return String(value)
}

export const renderProjectFieldCell = ({
  fieldData,
  fieldName,
  record,
  token,
  getConfidenceColor,
  onViewFieldSource,
}) => {
  if (!fieldData || fieldData.value === null || fieldData.value === undefined || fieldData.value === '') {
    return (
      <div style={{ textAlign: 'center', height: 22, lineHeight: '22px' }}>
        <span style={{ color: token.colorTextTertiary, fontSize: 12 }}>-</span>
      </div>
    )
  }

  const source = fieldData.source || '病历系统'
  const confidence = fieldData.confidence !== undefined && fieldData.confidence !== null ? fieldData.confidence : 1.0
  const bgColor = getConfidenceColor(confidence)
  const fullValue = getFullValueText(fieldData.value)

  return (
    <Tooltip
      title={
        <div style={{ maxWidth: 300, wordBreak: 'break-word' }}>
          <div style={{ marginBottom: 4 }}>{fullValue}</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>来源: {source} | 置信度: {(confidence * 100).toFixed(0)}%</div>
        </div>
      }
      placement="topLeft"
    >
      <div
        style={{
          background: `${bgColor}15`,
          border: `1px solid ${bgColor}40`,
          borderRadius: 4,
          padding: '4px 8px',
          cursor: 'pointer',
          minHeight: 28,
          lineHeight: '20px',
          wordBreak: 'break-word'
        }}
        onClick={() => onViewFieldSource(record.patientId, fieldName, fieldData, record, { fieldPath: fieldName })}
      >
        <span style={{ fontSize: 14 }}>
          {formatDisplayValue(fieldData.value, fieldData, fieldName)}
        </span>
      </div>
    </Tooltip>
  )
}
