import { PROJECTS_ENDPOINT } from './constants'

export const isPlainObject = (value) => (
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  !(value instanceof Date)
)

export const inferCrfValuePayload = (fieldPath, value) => {
  const normalizedPath = String(fieldPath || '').replace(/^\/+/, '').replace(/\//g, '.')
  const fieldKey = normalizedPath.split('.').filter(Boolean).at(-1) || normalizedPath
  if (value instanceof Date) {
    return { field_key: fieldKey, value_type: 'datetime', value_datetime: value.toISOString() }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { field_key: fieldKey, value_type: 'number', value_number: value }
  }
  if (typeof value === 'boolean' || Array.isArray(value) || isPlainObject(value)) {
    return { field_key: fieldKey, value_type: 'json', value_json: value }
  }
  return { field_key: fieldKey, value_type: 'text', value_text: value == null ? '' : String(value) }
}

export const normalizeFieldPath = (fieldPath = '') => String(fieldPath)
  .replace(/^\/+/, '')
  .replace(/\//g, '.')
  .replace(/\[(\d+)\]/g, '.$1')
  .replace(/\[\*\]/g, '')
  .replace(/\.+/g, '.')
  .replace(/^\./, '')
  .replace(/\.$/, '')

export const crfFieldUrl = (projectId, projectPatientId, fieldPath, suffix = '') => (
  `${PROJECTS_ENDPOINT}/${projectId}/patients/${projectPatientId}/crf/fields/${encodeURIComponent(normalizeFieldPath(fieldPath))}${suffix}`
)

export const recordInstanceParams = (options = {}) => {
  if (!options || typeof options !== 'object') return undefined
  const recordInstanceId = options.record_instance_id || options.recordInstanceId
  return recordInstanceId ? { record_instance_id: recordInstanceId } : undefined
}

export const extractCurrentValue = (current = {}) => {
  if (current.value_json !== undefined && current.value_json !== null) return current.value_json
  if (current.value_number !== undefined && current.value_number !== null) return Number(current.value_number)
  if (current.value_date !== undefined && current.value_date !== null) return current.value_date
  if (current.value_datetime !== undefined && current.value_datetime !== null) return current.value_datetime
  if (current.value_text !== undefined && current.value_text !== null) return current.value_text
  return null
}
