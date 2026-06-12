import {
  formatScalarText,
  inferValueKind,
  isPlainObject,
  unwrapFieldValue,
} from './nestedValueUtils'

export const canRenderObjectAsParallelArrayTable = (objectValue) => {
  if (!isPlainObject(objectValue)) return false
  const entries = Object.entries(objectValue)
  if (entries.length === 0) return false

  let hasArrayColumn = false
  for (const [, rawFieldValue] of entries) {
    const fieldValue = unwrapFieldValue(rawFieldValue)
    const kind = inferValueKind(fieldValue)
    if (kind === 'arrayScalar') {
      hasArrayColumn = true
      continue
    }
    if (kind === 'scalar') continue
    return false
  }
  return hasArrayColumn
}

export const buildParallelArrayTableModel = (objectValue) => {
  const entries = Object.entries(objectValue).map(([fieldKey, rawFieldValue]) => ([
    fieldKey,
    unwrapFieldValue(rawFieldValue),
  ]))
  const arrayColumns = entries.filter(([, fieldValue]) => Array.isArray(fieldValue))
  const rowCount = arrayColumns.reduce((maxCount, [, fieldValue]) => Math.max(maxCount, fieldValue.length), 0)
  const columns = entries.map(([fieldKey]) => ({
    title: fieldKey,
    dataIndex: fieldKey,
    key: fieldKey,
    ellipsis: true,
    render: (cellValue) => formatScalarText(cellValue),
  }))
  const rows = Array.from({ length: rowCount }, (_unused, rowIndex) => {
    const rowRecord = { __rowKey: `row-${rowIndex}` }
    entries.forEach(([fieldKey, fieldValue]) => {
      rowRecord[fieldKey] = Array.isArray(fieldValue)
        ? fieldValue[rowIndex] ?? null
        : fieldValue
    })
    return rowRecord
  })
  return { columns, rows, rowCount }
}
