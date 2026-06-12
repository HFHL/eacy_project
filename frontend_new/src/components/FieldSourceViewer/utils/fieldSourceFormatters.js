export const formatDisplayValue = (value) => {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'string') return value || '-'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '-'
    const preview = value.slice(0, 2).map((item, idx) => (
      typeof item === 'object'
        ? `[${idx + 1}] ${Object.values(item).filter((part) => part != null).slice(0, 2).join(', ') || '...'}`
        : String(item)
    )).join('; ')
    return value.length > 2 ? `${preview} (+${value.length - 2})` : preview
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, itemValue]) => itemValue != null && itemValue !== '')
    if (entries.length === 0) return '-'
    const preview = entries.slice(0, 2).map(([key, itemValue]) => (
      `${key}: ${typeof itemValue === 'object' ? '...' : String(itemValue).slice(0, 15)}`
    )).join('; ')
    return entries.length > 2 ? `${preview} (+${entries.length - 2})` : preview
  }
  return String(value)
}

export const formatLogValue = (value) => {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value.length > 80 ? `${value.slice(0, 80)}…` : value
  if (Array.isArray(value) || typeof value === 'object') {
    const json = JSON.stringify(value, null, 0)
    return json.length > 100 ? `${json.slice(0, 100)}…` : json
  }
  return String(value)
}

export const getChangeTypeLabel = (changeType) => {
  const map = {
    initial_extract: '首次抽取',
    merge_dedupe: '合并去重',
    merge: '合并',
    conflict_resolve: '冲突解决',
    manual_edit: '手动编辑',
    schema_migration: '模板迁移',
  }
  return map[changeType] || changeType || '变更'
}

export const getChangeTypeColor = (changeType) => {
  const map = {
    initial_extract: 'green',
    merge_dedupe: 'blue',
    merge: 'cyan',
    conflict_resolve: 'orange',
    manual_edit: 'purple',
    schema_migration: 'default',
  }
  return map[changeType] || 'default'
}
