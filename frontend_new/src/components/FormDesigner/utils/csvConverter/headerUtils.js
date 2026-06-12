import { CSV_COLUMNS, CSV_COLUMN_ALIASES } from '../../core/constants.js'
import { HEADER_KEYWORDS, LEVEL_HEADERS } from './constants.js'

export const normalizeHeaderToken = (token) => (
  String(token || '')
    .replace(/^\ufeff/, '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .toLowerCase()
)

export const normalizeHeaders = (headers) => (
  headers.map((header, index) => {
    const text = String(header || '').trim()
    return index === 0 ? text.replace(/^\ufeff/, '') : text
  })
)

export const isHeaderRow = (headers) => (
  headers.some((header) => {
    const normalized = normalizeHeaderToken(header)
    if (!normalized) return false
    for (const keyword of HEADER_KEYWORDS) {
      if (normalizeHeaderToken(keyword) === normalized) return true
    }
    return false
  })
)

export const extractHeaderAndRows = (csvData) => {
  const firstRow = normalizeHeaders(csvData[0] || [])
  if (isHeaderRow(firstRow)) {
    return { headers: firstRow, rows: csvData.slice(1) }
  }
  const secondRow = normalizeHeaders(csvData[1] || [])
  if (isHeaderRow(secondRow)) {
    return { headers: secondRow, rows: csvData.slice(2) }
  }
  throw new Error('CSV表头格式不正确')
}

export const validateCSVHeaders = (headers) => {
  const requiredHeaders = [
    CSV_COLUMNS.FOLDER,
    CSV_COLUMNS.LEVEL1,
    CSV_COLUMNS.DISPLAY_TYPE,
  ]
  const missingHeaders = requiredHeaders.filter((required) => headers.get(required) === undefined)
  if (missingHeaders.length > 0) {
    throw new Error(`CSV缺少必需的列: ${missingHeaders.join(', ')}`)
  }
}

export const buildHeaderIndex = (headers) => {
  const normalizedIndex = new Map()
  headers.forEach((header, index) => {
    normalizedIndex.set(normalizeHeaderToken(header), index)
  })

  const columnIndex = new Map()
  const register = (key, label) => {
    const index = normalizedIndex.get(normalizeHeaderToken(label))
    if (index !== undefined && columnIndex.get(key) === undefined) {
      columnIndex.set(key, index)
    }
  }

  for (const [key, canonicalName] of Object.entries(CSV_COLUMNS)) {
    if (key === 'LEVEL2_10') continue
    register(canonicalName, canonicalName)
    const aliases = CSV_COLUMN_ALIASES[key] || []
    aliases.forEach((alias) => register(canonicalName, alias))
  }

  LEVEL_HEADERS.forEach((header) => register(header, header))
  return columnIndex
}

export const getValue = (row, headerIndex, key) => {
  const index = headerIndex.get(key)
  if (index === undefined || index >= row.length) return ''
  return String(row[index] || '').trim()
}
