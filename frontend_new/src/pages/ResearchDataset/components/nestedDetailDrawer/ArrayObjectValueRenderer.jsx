import React from 'react'
import { Table, Tag, Typography } from 'antd'

import {
  extractComplexObjectPayload,
  formatScalarText,
  isPlainObject,
  isScalar,
  unwrapFieldValue,
} from './nestedValueUtils'
import {
  alignObjectBySchema,
  getSchemaPropertyEntries,
  normalizeDetailSchemaNode,
} from './nestedSchemaUtils'
import RenderIssueBlock from './RenderIssueBlock'

const { Text } = Typography

const ArrayObjectValueRenderer = ({
  normalizedValue,
  effectiveSchemaNode,
  renderNodeHeader,
  panelMarginLeft,
  path,
  depth,
  showDiagnostics,
  isSchemaMismatch,
  schemaKind,
  valueKind,
  renderNested,
}) => {
  const schemaItem = effectiveSchemaNode?.items && typeof effectiveSchemaNode.items === 'object'
    ? normalizeDetailSchemaNode(effectiveSchemaNode.items)
    : null
  const schemaEntries = getSchemaPropertyEntries(schemaItem)
  const keySet = new Set(schemaEntries.map(([fieldKey]) => fieldKey))
  normalizedValue.forEach((row) => {
    const normalizedRow = unwrapFieldValue(row)
    if (!isPlainObject(normalizedRow)) return
    Object.keys(normalizedRow).forEach((fieldKey) => keySet.add(fieldKey))
  })

  const tableColumns = [...keySet].map((fieldKey) => ({
    title: fieldKey,
    dataIndex: fieldKey,
    key: fieldKey,
    ellipsis: true,
    render: (cellValue) => {
      const normalizedCell = unwrapFieldValue(cellValue)
      if (isScalar(normalizedCell)) return formatScalarText(normalizedCell)
      return <Tag color="purple">{Array.isArray(normalizedCell) ? `${normalizedCell.length} 条` : '对象'}</Tag>
    },
  }))
  const tableRows = normalizedValue.map((row, index) => {
    const normalizedRow = unwrapFieldValue(row)
    if (schemaItem && isPlainObject(normalizedRow)) {
      return { __rowKey: `${path}[${index}]`, ...alignObjectBySchema(schemaItem, normalizedRow) }
    }
    if (isPlainObject(normalizedRow)) {
      return { __rowKey: `${path}[${index}]`, ...normalizedRow }
    }
    return { __rowKey: `${path}[${index}]`, value: normalizedRow }
  })
  const hasExpandableRows = tableRows.some((record) => {
    const candidate = { ...record }
    delete candidate.__rowKey
    return Object.values(candidate).some((item) => !isScalar(unwrapFieldValue(item)))
  })
  const expandableConfig = hasExpandableRows ? {
    rowExpandable: (record) => {
      const candidate = { ...record }
      delete candidate.__rowKey
      return Object.values(candidate).some((item) => !isScalar(unwrapFieldValue(item)))
    },
    expandedRowRender: (record, rowIndex) => {
      const rowData = { ...record }
      delete rowData.__rowKey
      const complexPayload = extractComplexObjectPayload(rowData)
      return Object.keys(complexPayload).length > 0
        ? renderNested({
          value: complexPayload,
          schemaNode: schemaItem,
          label: `记录 ${rowIndex + 1}`,
          path: `${path}[${rowIndex}]`,
          depth: depth + 1,
        })
        : <Text type="secondary">该行无可展开的嵌套字段。</Text>
    },
  } : undefined

  return (
    <div style={{ marginBottom: 12, marginLeft: panelMarginLeft }}>
      <div style={{ marginBottom: 8 }}>{renderNodeHeader}</div>
      {showDiagnostics && isSchemaMismatch ? (
        <RenderIssueBlock
          title="Schema 与数据结构不一致，已自动切换自适应渲染"
          detail={`Schema 期望 ${schemaKind}，实际值为 ${valueKind}。`}
          path={path}
        />
      ) : null}
      <Table
        size="small"
        bordered
        rowKey={(row) => row.__rowKey}
        columns={tableColumns}
        dataSource={tableRows}
        pagination={false}
        scroll={{ x: 'max-content' }}
        expandable={expandableConfig}
      />
    </div>
  )
}

export default ArrayObjectValueRenderer
