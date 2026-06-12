export const formatAnyValueForText = (value, maxLen = 200) => {
  if (value === null || value === undefined || value === '') return '-'
  let text = ''
  if (Array.isArray(value)) {
    text = value.map(item => formatAnyValueForText(item, maxLen)).join(', ')
  } else if (typeof value === 'object') {
    try {
      text = JSON.stringify(value)
    } catch (_error) {
      text = String(value)
    }
  } else {
    text = String(value)
  }
  return maxLen && text.length > maxLen ? `${text.slice(0, maxLen)}...` : text
}

export const isEmptyFieldValue = (value) => {
  if (value === null || value === undefined || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value || {}).length === 0
  return false
}

export const getLeafFieldName = (fieldPath) => {
  if (!fieldPath) return ''
  const parts = String(fieldPath)
    .split('/')
    .map(part => part.trim())
    .filter(Boolean)
    .filter(part => !/^\[\d+\]$/.test(part))
  return parts.length ? parts[parts.length - 1] : String(fieldPath)
}

export const stripIndexFromPath = (fieldPath) => String(fieldPath || '').replace(/\/\[\d+\]/g, '')

export const splitPathSegments = (fieldPath) => String(fieldPath || '')
  .split('/')
  .map(part => part.trim())
  .filter(Boolean)
  .filter(part => !/^\[\d+\]$/.test(part))

const parseExtendedConfig = (schemaNode) => {
  if (!schemaNode || typeof schemaNode !== 'object') return null
  const raw = schemaNode['x-extended-config']
  if (!raw) return null
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch (_error) {
      return null
    }
  }
  return typeof raw === 'object' ? raw : null
}

const isMultiRowTableSchema = (schemaNode) => {
  if (!schemaNode || typeof schemaNode !== 'object') return false
  const ext = parseExtendedConfig(schemaNode)
  if (schemaNode?.['x-display'] === 'table') {
    if (schemaNode?.['x-row-constraint'] === 'multi_row') return true
    if (schemaNode?.['x-table-config']?.multiRow === true) return true
    if (ext?.tableRows === 'multiRow') return true
  }
  if (schemaNode?.type === 'array' && schemaNode?.items?.type === 'object') return true
  return false
}

const resolveSchemaNodeByPath = (schema, fieldPath) => {
  if (!schema || typeof schema !== 'object' || !fieldPath) return null
  const segments = splitPathSegments(fieldPath)
  let node = schema
  for (const segment of segments) {
    if (!node || typeof node !== 'object') return null
    if (node.type === 'array' && node.items) {
      node = node.items
    }
    if (node.type === 'object' && node.properties && Object.prototype.hasOwnProperty.call(node.properties, segment)) {
      node = node.properties[segment]
    } else {
      return null
    }
  }
  return node
}

const inferFieldDisplayMeta = (schema, fieldPath, value) => {
  const schemaNode = resolveSchemaNodeByPath(schema, stripIndexFromPath(fieldPath))
  const schemaDisplay = schemaNode?.['x-display']
  const schemaRowConstraint = schemaNode?.['x-row-constraint']
  const schemaType = schemaNode?.type
  const isNestedTableBySchema = isMultiRowTableSchema(schemaNode)
  const isObjectArrayValue = Array.isArray(value) && value.every(item => item && typeof item === 'object' && !Array.isArray(item))

  return {
    schemaNode,
    schemaDisplay,
    schemaRowConstraint,
    schemaType,
    isNestedTable: isNestedTableBySchema || (schemaType === 'array' && isObjectArrayValue)
  }
}

const createFieldOrderIndex = (groupConfig) => {
  const dbFields = Array.isArray(groupConfig?.db_fields) ? groupConfig.db_fields : []
  const orderIndex = new Map()
  dbFields.forEach((fieldPath, index) => {
    if (typeof fieldPath !== 'string') return
    const normalized = stripIndexFromPath(fieldPath)
    const leaf = getLeafFieldName(normalized)
    if (!orderIndex.has(normalized)) orderIndex.set(normalized, index)
    if (leaf && !orderIndex.has(leaf)) orderIndex.set(leaf, index)
  })
  return orderIndex
}

const getFieldOrderValue = (fieldPath, orderIndex) => {
  const normalized = stripIndexFromPath(fieldPath)
  const leaf = getLeafFieldName(normalized)
  if (orderIndex.has(normalized)) return orderIndex.get(normalized)
  if (leaf && orderIndex.has(leaf)) return orderIndex.get(leaf)
  return Number.MAX_SAFE_INTEGER
}

const isObjectArray = (value) => {
  return Array.isArray(value) && value.every((item) => item && typeof item === 'object' && !Array.isArray(item))
}

export const getTemplateGroupConfig = (templateFieldGroups, groupData, groupName) => {
  const groupId = groupData?.group_id
  if (groupId) {
    const byId = (templateFieldGroups || []).find(group => group.group_id === groupId)
    if (byId) return byId
  }
  if (groupName) {
    const byName = (templateFieldGroups || []).find(group => group.group_name === groupName)
    if (byName) return byName
  }
  return null
}

export const normalizeGroupForDisplay = (groupData, groupConfig = null, templateSchemaJson = null) => {
  const fields = groupData?.fields || {}
  const orderIndex = createFieldOrderIndex(groupConfig)
  const fieldEntries = Object.entries(fields)
    .filter(([, data]) => data && typeof data === 'object')
    .sort(([pathA], [pathB]) => {
      const a = getFieldOrderValue(pathA, orderIndex)
      const b = getFieldOrderValue(pathB, orderIndex)
      if (a !== b) return a - b
      return String(pathA).localeCompare(String(pathB), 'zh-CN')
    })

  const indexedRowMap = new Map()
  const scalarCells = []
  const groupRepeatableByTemplate = Boolean(groupConfig?.is_repeatable)

  fieldEntries.forEach(([fieldPath, fieldData]) => {
    const value = fieldData?.value
    const leafName = getLeafFieldName(fieldPath)
    const indices = [...String(fieldPath).matchAll(/\[(\d+)\]/g)].map(match => Number(match[1]))
    const meta = inferFieldDisplayMeta(templateSchemaJson, fieldPath, value)

    if (groupRepeatableByTemplate && indices.length === 0 && isObjectArray(value)) {
      value.forEach((rowItem, rowIndex) => {
        const rowObj = indexedRowMap.get(rowIndex) || { rowIndex, cells: [], nestedTables: {} }
        Object.entries(rowItem || {}).forEach(([subFieldName, subValue]) => {
          if (isObjectArray(subValue)) {
            rowObj.nestedTables[subFieldName] = subValue
            return
          }
          rowObj.cells.push({
            fieldPath: `${fieldPath}/[${rowIndex}]/${subFieldName}`,
            fieldName: subFieldName,
            fieldData: { ...fieldData, value: subValue },
            value: subValue,
            meta: inferFieldDisplayMeta(templateSchemaJson, `${fieldPath}/${subFieldName}`, subValue),
          })
        })
        indexedRowMap.set(rowIndex, rowObj)
      })
      return
    }

    if (groupRepeatableByTemplate && indices.length > 0) {
      const rowIndex = indices[0]
      const rowObj = indexedRowMap.get(rowIndex) || { rowIndex, cells: [], nestedTables: {} }
      if (meta.isNestedTable && Array.isArray(value)) {
        rowObj.nestedTables[leafName || '明细'] = value
      } else if (indices.length > 1) {
        const tableKey = splitPathSegments(fieldPath).slice(-2, -1)[0] || '明细'
        const innerIndex = indices[1]
        if (!Array.isArray(rowObj.nestedTables[tableKey])) rowObj.nestedTables[tableKey] = []
        if (!rowObj.nestedTables[tableKey][innerIndex]) rowObj.nestedTables[tableKey][innerIndex] = {}
        rowObj.nestedTables[tableKey][innerIndex][leafName] = value
      } else {
        rowObj.cells.push({ fieldPath, fieldName: leafName, fieldData, value, meta })
      }
      indexedRowMap.set(rowIndex, rowObj)
      return
    }

    if (meta.isNestedTable && Array.isArray(value)) {
      scalarCells.push({ fieldPath, fieldName: leafName, fieldData, value, meta })
      return
    }

    if (!groupRepeatableByTemplate && indices.length > 0) {
      const rowIndex = indices[0]
      const rowObj = indexedRowMap.get(rowIndex) || { rowIndex, cells: [], nestedTables: {} }
      rowObj.cells.push({ fieldPath, fieldName: leafName, fieldData, value, meta })
      indexedRowMap.set(rowIndex, rowObj)
      return
    }

    scalarCells.push({ fieldPath, fieldName: leafName, fieldData, value, meta })
  })

  const rows = Array.from(indexedRowMap.values())
    .sort((a, b) => a.rowIndex - b.rowIndex)
    .map((row) => ({
      rowIndex: row.rowIndex,
      cells: (row.cells || [])
        .filter(cell => cell && cell.fieldName)
        .sort((a, b) => {
          const orderA = getFieldOrderValue(a.fieldPath, orderIndex)
          const orderB = getFieldOrderValue(b.fieldPath, orderIndex)
          if (orderA !== orderB) return orderA - orderB
          return String(a.fieldName).localeCompare(String(b.fieldName), 'zh-CN')
        }),
      nestedTables: row.nestedTables || {}
    }))
    .filter(row => row.cells.length > 0 || Object.keys(row.nestedTables || {}).length > 0)

  const orderedScalarCells = scalarCells
    .filter(cell => cell && cell.fieldName)
    .sort((a, b) => {
      const orderA = getFieldOrderValue(a.fieldPath, orderIndex)
      const orderB = getFieldOrderValue(b.fieldPath, orderIndex)
      if (orderA !== orderB) return orderA - orderB
      return String(a.fieldName).localeCompare(String(b.fieldName), 'zh-CN')
    })

  const tableFieldOrder = []
  const nestedTableOrder = []
  rows.forEach((row) => {
    row.cells.forEach((cell) => {
      if (!tableFieldOrder.includes(cell.fieldName)) tableFieldOrder.push(cell.fieldName)
    })
    Object.keys(row.nestedTables || {}).forEach((tableName) => {
      if (!nestedTableOrder.includes(tableName)) nestedTableOrder.push(tableName)
    })
  })

  const rowsForTable = rows.map((row) => {
    const cellMap = {}
    row.cells.forEach((cell) => {
      cellMap[cell.fieldName] = cell
    })
    return {
      ...cellMap,
      _rowIndex: row.rowIndex,
      _cellMap: cellMap,
      _nestedTables: row.nestedTables || {},
    }
  })

  const filledCount = fieldEntries.filter(([, data]) => !isEmptyFieldValue(data?.value)).length
  const totalCount = fieldEntries.length
  const previewText = rows.length > 0
    ? rows
        .slice(0, 2)
        .map(row => row.cells.slice(0, 2).map(cell => formatAnyValueForText(cell.value, 20)).filter(Boolean).join('；'))
        .filter(Boolean)
        .join(' ｜ ')
    : scalarCells
        .filter(cell => !isEmptyFieldValue(cell.value))
        .slice(0, 3)
        .map(cell => formatAnyValueForText(cell.value, 20))
        .join('；')

  return {
    rows,
    rowsForTable,
    tableFieldOrder,
    nestedTableOrder,
    scalarCells: orderedScalarCells,
    rowCount: rows.length,
    filledCount,
    totalCount,
    hasData: rows.length > 0 || orderedScalarCells.some(cell => !isEmptyFieldValue(cell.value)),
    previewText: previewText || '暂无数据'
  }
}
