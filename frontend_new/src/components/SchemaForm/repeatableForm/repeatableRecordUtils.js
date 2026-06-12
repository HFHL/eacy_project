import { orderedPropertyEntries } from '../SchemaFormContext'

/**
 * 生成稳定行标识。
 * @returns {string}
 */
export function createRowUid() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }
  return `row_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

/**
 * 确保重复行对象存在 `_row_uid`。
 * @param {Record<string, any>} record
 * @returns {Record<string, any>}
 */
export function ensureRecordRowUid(record) {
  const target = (record && typeof record === 'object') ? record : {}
  const current = String(target._row_uid || '').trim()
  if (!current) {
    target._row_uid = createRowUid()
  }
  return target
}

export function stripRecordIdentity(value) {
  if (Array.isArray(value)) return value.map((item) => stripRecordIdentity(item))
  if (!value || typeof value !== 'object') return value

  const output = {}
  for (const [key, child] of Object.entries(value)) {
    if (['_row_uid', '_record_instance_id', '_rowKey', '_key'].includes(key)) continue
    output[key] = stripRecordIdentity(child)
  }
  return output
}

export function cloneRecordForInsert(record) {
  return { ...stripRecordIdentity(record), _row_uid: createRowUid() }
}

export function getRecordTitle(record, itemSchema, index) {
  if (!record || !itemSchema?.properties) return `记录 ${index + 1}`

  for (const [key, fieldSchema] of orderedPropertyEntries(itemSchema.properties, itemSchema)) {
    if (fieldSchema['x-primary'] && record[key]) return record[key]
  }

  for (const [key, fieldSchema] of orderedPropertyEntries(itemSchema.properties, itemSchema)) {
    if (fieldSchema.type === 'string' && record[key]) {
      return record[key].length > 30 ? `${record[key].substring(0, 30)}...` : record[key]
    }
  }

  return `记录 ${index + 1}`
}

export function createEmptyRecord(itemSchema) {
  if (!itemSchema?.properties) return {}

  const record = { _row_uid: createRowUid() }
  for (const [key, fieldSchema] of orderedPropertyEntries(itemSchema.properties, itemSchema)) {
    if (fieldSchema.type === 'array') record[key] = []
    else if (fieldSchema.type === 'object') record[key] = {}
    else if (fieldSchema.type === 'number') record[key] = null
    else record[key] = ''
  }
  return record
}
