import React from 'react'
import { Collapse, Descriptions, Space, Table, Tag, Typography } from 'antd'

import {
  buildCountLabel,
  buildTypeLabel,
  formatScalarText,
  isScalar,
  unwrapFieldValue,
} from './nestedValueUtils'
import {
  alignObjectBySchema,
  getSchemaPropertyEntries,
} from './nestedSchemaUtils'
import {
  buildParallelArrayTableModel,
  canRenderObjectAsParallelArrayTable,
} from './parallelArrayTableModel'
import RenderIssueBlock from './RenderIssueBlock'

const { Text } = Typography

const buildNormalizedObjectValue = (fieldKeys, schemaEntries, alignedBySchema, normalizedValue) => {
  return fieldKeys.reduce((accumulator, fieldKey) => {
    accumulator[fieldKey] = schemaEntries.length > 0
      ? (Object.prototype.hasOwnProperty.call(alignedBySchema, fieldKey)
        ? alignedBySchema[fieldKey]
        : unwrapFieldValue(normalizedValue[fieldKey]))
      : unwrapFieldValue(normalizedValue[fieldKey])
    return accumulator
  }, {})
}

const splitObjectItems = (fieldKeys, schemaEntries, normalizedObjectValue) => {
  const scalarItems = []
  const complexItems = []
  fieldKeys.forEach((fieldKey) => {
    const matchedSchema = schemaEntries.find(([schemaField]) => schemaField === fieldKey)?.[1] || null
    const fieldValue = normalizedObjectValue[fieldKey]
    if (isScalar(unwrapFieldValue(fieldValue))) {
      scalarItems.push({ key: fieldKey, label: fieldKey, children: formatScalarText(fieldValue) })
    } else {
      complexItems.push({ key: fieldKey, value: fieldValue, schemaNode: matchedSchema })
    }
  })
  return { scalarItems, complexItems }
}

const ObjectValueRenderer = ({
  normalizedValue,
  effectiveSchemaNode,
  renderNodeHeader,
  panelMarginLeft,
  path,
  depth,
  expandMode,
  customExpandedKeys,
  onTogglePanel,
  showDiagnostics,
  isSchemaMismatch,
  schemaKind,
  valueKind,
  renderNested,
}) => {
  const schemaEntries = getSchemaPropertyEntries(effectiveSchemaNode)
  const schemaFieldKeys = schemaEntries.map(([fieldKey]) => fieldKey)
  const extraFieldKeys = Object.keys(normalizedValue).filter((fieldKey) => !schemaFieldKeys.includes(fieldKey))
  const fieldKeys = schemaEntries.length > 0 ? [...schemaFieldKeys, ...extraFieldKeys] : Object.keys(normalizedValue)
  const alignedBySchema = schemaEntries.length > 0 ? alignObjectBySchema(effectiveSchemaNode, normalizedValue) : {}
  const normalizedObjectValue = buildNormalizedObjectValue(fieldKeys, schemaEntries, alignedBySchema, normalizedValue)

  if (canRenderObjectAsParallelArrayTable(normalizedObjectValue)) {
    const { columns, rows, rowCount } = buildParallelArrayTableModel(normalizedObjectValue)
    return (
      <div style={{ marginBottom: 12, marginLeft: panelMarginLeft }}>
        <div style={{ marginBottom: 8 }}>{renderNodeHeader}</div>
        <Table
          size="small"
          rowKey="__rowKey"
          columns={columns}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: rowCount === 0 ? '0 条' : '暂无数据' }}
        />
      </div>
    )
  }

  const { scalarItems, complexItems } = splitObjectItems(fieldKeys, schemaEntries, normalizedObjectValue)
  if (fieldKeys.length === 0) {
    return (
      <div style={{ marginBottom: 12, marginLeft: panelMarginLeft }}>
        <div style={{ marginBottom: 8 }}>{renderNodeHeader}</div>
        <Text type="secondary">无字段</Text>
      </div>
    )
  }

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
      {scalarItems.length > 0 ? <Descriptions size="small" bordered column={1} items={scalarItems} /> : null}
      {complexItems.map((item) => {
        const panelKey = `${path}.${item.key}`
        if (canRenderObjectAsParallelArrayTable(unwrapFieldValue(item.value))) {
          return (
            <div key={panelKey} style={{ marginTop: 10 }}>
              {renderNested({ value: item.value, schemaNode: item.schemaNode, label: item.key, path: panelKey, depth: depth + 1 })}
            </div>
          )
        }
        const isExpanded = expandMode === 'all' || (expandMode === 'custom' && customExpandedKeys.includes(panelKey))
        return (
          <Collapse
            key={panelKey}
            style={{ marginTop: 10 }}
            size="small"
            activeKey={isExpanded ? [panelKey] : []}
            items={[{
              key: panelKey,
              label: (
                <Space size={6}>
                  <Text>{item.key}</Text>
                  <Tag>{buildTypeLabel(item.value)}</Tag>
                  <Tag color="blue">{buildCountLabel(item.value)}</Tag>
                </Space>
              ),
              children: renderNested({ value: item.value, schemaNode: item.schemaNode, label: item.key, path: panelKey, depth: depth + 1 }),
              forceRender: isExpanded,
            }]}
            onChange={() => onTogglePanel(panelKey)}
          />
        )
      })}
    </div>
  )
}

export default ObjectValueRenderer
