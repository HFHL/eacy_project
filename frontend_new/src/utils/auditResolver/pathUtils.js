export function toAuditPath(dotPath) {
  if (!dotPath || typeof dotPath !== 'string') return ''
  return dotPath.split('.').join(' / ')
}

export function toAuditPathWithoutIndex(dotPath) {
  if (!dotPath || typeof dotPath !== 'string') return ''
  const parts = dotPath.split('.').filter((part) => !/^\d+$/.test(part))
  return parts.join(' / ')
}

export function normalizePathKey(path) {
  if (!path || typeof path !== 'string') return ''
  return path
    .replace(/\[(\d+|\*)\]/g, '')
    .replace(/\s*[./]\s*/g, '/')
    .replace(/\/\d+(?=\/|$)/g, '')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '')
}

export function getNestedValue(obj, dotPath) {
  if (!obj || typeof obj !== 'object') return undefined
  const parts = dotPath.split('.')
  let cur = obj
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = cur[part]
  }
  return cur
}

export function hasNestedKey(obj, dotPath) {
  if (!obj || typeof obj !== 'object') return false
  const parts = dotPath.split('.')
  let cur = obj
  for (let index = 0; index < parts.length - 1; index++) {
    if (cur == null || typeof cur !== 'object') return false
    cur = cur[parts[index]]
  }
  if (cur == null || typeof cur !== 'object') return false
  return parts[parts.length - 1] in cur
}

export function formatAuditDisplayValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) {
    if (value.length === 0) return '（空数组）'
    const first = value[0]
    if (typeof first === 'object' && first !== null) {
      return `（数组，共 ${value.length} 项）`
    }
    const preview = value.slice(0, 5).map((item) => String(item)).join('，')
    return value.length > 5 ? `${preview}… (+${value.length - 5})` : preview
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, item]) => item != null && item !== '')
    if (entries.length === 0) return '—'
    const preview = entries.slice(0, 5).map(([key, item]) => `${key}: ${String(item)}`).join('，')
    return entries.length > 5 ? `${preview}…` : preview
  }
  return String(value) || '—'
}
