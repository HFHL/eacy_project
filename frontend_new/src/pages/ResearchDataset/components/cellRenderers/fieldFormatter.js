export const formatFieldValue = (value) => {
  if (value === null || value === undefined || value === '') return '--'
  if (Array.isArray(value)) {
    if (value.length === 0) return '--'
    if (value.length === 1) return String(formatFieldValue(value[0]))
    return `${value.length} 条记录`
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}
