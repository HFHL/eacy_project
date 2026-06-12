import { getCurrentValuePayload } from './ehrDataAdapter'

const isPlainObject = (value) => (
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  !(value instanceof Date)
)

const stableStringify = (value) => {
  if (value === undefined) return '__undefined__'
  if (!isPlainObject(value) && !Array.isArray(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

export const valuesEqual = (a, b) => stableStringify(a) === stableStringify(b)

export const collectLeafValues = (value, prefix = '', result = {}) => {
  if (Array.isArray(value)) {
    if (value.length === 0 && prefix) {
      result[prefix] = []
      return result
    }
    value.forEach((item, index) => {
      collectLeafValues(item, prefix ? `${prefix}.${index}` : String(index), result)
    })
    return result
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value).filter(([key]) => !String(key).startsWith('_'))
    if (entries.length === 0 && prefix) {
      result[prefix] = {}
      return result
    }
    entries.forEach(([key, item]) => {
      collectLeafValues(item, prefix ? `${prefix}.${key}` : key, result)
    })
    return result
  }

  if (prefix) result[prefix] = value
  return result
}

export const collectDeletedLeafPaths = (previousValue, nextValue, prefix = '', result = []) => {
  if (previousValue === undefined || previousValue === null) return result

  if (Array.isArray(previousValue)) {
    if (!Array.isArray(nextValue)) {
      Object.keys(collectLeafValues(previousValue, prefix)).forEach((path) => result.push(path))
      return result
    }
    previousValue.forEach((item, index) => {
      collectDeletedLeafPaths(item, nextValue[index], prefix ? `${prefix}.${index}` : String(index), result)
    })
    return result
  }

  if (isPlainObject(previousValue)) {
    const entries = Object.entries(previousValue).filter(([key]) => !String(key).startsWith('_'))
    if (!isPlainObject(nextValue) && !Array.isArray(nextValue)) {
      Object.keys(collectLeafValues(previousValue, prefix)).forEach((path) => result.push(path))
      return result
    }
    entries.forEach(([key, item]) => {
      const childNext = nextValue && typeof nextValue === 'object' ? nextValue[key] : undefined
      collectDeletedLeafPaths(item, childNext, prefix ? `${prefix}.${key}` : key, result)
    })
    return result
  }

  if (prefix && nextValue === undefined) result.push(prefix)
  return result
}

export const inferEhrValuePayload = (fieldPath, value) => {
  const fieldKey = String(fieldPath || '').split('.').filter(Boolean).at(-1) || fieldPath
  if (value instanceof Date) {
    return {
      field_key: fieldKey,
      value_type: 'datetime',
      value_datetime: value.toISOString(),
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return {
      field_key: fieldKey,
      value_type: 'number',
      value_number: value,
    }
  }
  if (typeof value === 'boolean' || Array.isArray(value) || isPlainObject(value)) {
    return {
      field_key: fieldKey,
      value_type: 'json',
      value_json: value,
    }
  }
  return {
    field_key: fieldKey,
    value_type: 'text',
    value_text: value == null ? '' : String(value),
  }
}

export const recordInstanceParams = (options = {}) => {
  if (!options || typeof options !== 'object') return undefined
  const recordInstanceId = options.record_instance_id || options.recordInstanceId
  return recordInstanceId ? { record_instance_id: recordInstanceId } : undefined
}

export const normalizeHistoryEvent = (event = {}) => ({
  id: event.id,
  field_path: event.field_path,
  field_key: event.field_key,
  change_type: event.event_type === 'manual_edit' ? 'manual' : event.event_type,
  event_type: event.event_type,
  new_value: getCurrentValuePayload(event),
  value: getCurrentValuePayload(event),
  source: event.source_document_id ? 'document' : event.created_by ? 'manual' : 'system',
  source_document_id: event.source_document_id || null,
  source_event_id: event.source_event_id || null,
  source_page: event.source_page ?? null,
  source_text: event.source_text || null,
  source_location: event.source_location || null,
  extraction_run_id: event.extraction_run_id || null,
  review_status: event.review_status || '',
  created_at: event.created_at || '',
  operator: event.created_by || event.selected_by || '',
  timestamp: event.created_at || event.updated_at || '',
  confidence: event.confidence,
  note: event.note,
})
