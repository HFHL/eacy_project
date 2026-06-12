import React from 'react'
import { Space, Tag, Typography } from 'antd'

import ArrayMixedValueRenderer from './ArrayMixedValueRenderer'
import ArrayObjectValueRenderer from './ArrayObjectValueRenderer'
import ObjectValueRenderer from './ObjectValueRenderer'
import RenderIssueBlock from './RenderIssueBlock'
import {
  buildCountLabel,
  buildTypeLabel,
  formatScalarText,
  inferValueKind,
  isPlainObject,
  isScalar,
  unwrapFieldValue,
} from './nestedValueUtils'
import {
  inferSchemaKind,
  normalizeDetailSchemaNode,
} from './nestedSchemaUtils'

const { Text } = Typography

const resolveEffectiveSchemaNode = (normalizedSchemaNode, normalizedValue, schemaKind) => {
  const mismatch =
    (schemaKind === 'array' && !Array.isArray(normalizedValue))
    || (schemaKind === 'object' && !isPlainObject(normalizedValue))
    || (schemaKind === 'scalar' && !isScalar(normalizedValue))
  return normalizedSchemaNode && !mismatch ? normalizedSchemaNode : null
}

const StructuredValueRenderer = ({
  value,
  schemaNode = null,
  label,
  path,
  depth = 0,
  expandMode,
  customExpandedKeys,
  onTogglePanel,
  showDiagnostics,
}) => {
  const normalizedValue = unwrapFieldValue(value)
  const normalizedSchemaNode = normalizeDetailSchemaNode(schemaNode)
  const valueKind = inferValueKind(normalizedValue)
  const schemaKind = inferSchemaKind(normalizedSchemaNode)
  const effectiveSchemaNode = resolveEffectiveSchemaNode(normalizedSchemaNode, normalizedValue, schemaKind)
  const isSchemaMismatch = Boolean(normalizedSchemaNode && !effectiveSchemaNode)
  const panelMarginLeft = depth * 10
  const renderNodeHeader = (
    <Space size={6} wrap>
      <Text strong>{label || '字段详情'}</Text>
      <Tag>{buildTypeLabel(normalizedValue)}</Tag>
      <Tag color="blue">{buildCountLabel(normalizedValue)}</Tag>
      {showDiagnostics ? <Text code>{path || '(root)'}</Text> : null}
    </Space>
  )
  const renderNested = (nextProps) => (
    <StructuredValueRenderer
      expandMode={expandMode}
      customExpandedKeys={customExpandedKeys}
      onTogglePanel={onTogglePanel}
      showDiagnostics={showDiagnostics}
      {...nextProps}
    />
  )

  if (isScalar(normalizedValue)) {
    return (
      <div style={{ marginBottom: 10, marginLeft: panelMarginLeft }}>
        <div style={{ marginBottom: 6 }}>{renderNodeHeader}</div>
        <Text>{formatScalarText(normalizedValue)}</Text>
      </div>
    )
  }

  if (Array.isArray(normalizedValue) && valueKind === 'arrayObject') {
    return (
      <ArrayObjectValueRenderer
        normalizedValue={normalizedValue}
        effectiveSchemaNode={effectiveSchemaNode}
        renderNodeHeader={renderNodeHeader}
        panelMarginLeft={panelMarginLeft}
        path={path}
        depth={depth}
        showDiagnostics={showDiagnostics}
        isSchemaMismatch={isSchemaMismatch}
        schemaKind={schemaKind}
        valueKind={valueKind}
        renderNested={renderNested}
      />
    )
  }

  if (Array.isArray(normalizedValue) && valueKind === 'arrayScalar') {
    return (
      <div style={{ marginBottom: 12, marginLeft: panelMarginLeft }}>
        <div style={{ marginBottom: 8 }}>{renderNodeHeader}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {normalizedValue.length === 0
            ? <Tag>0 条</Tag>
            : normalizedValue.map((item, index) => (
              <Tag key={`${path}-${index}`}>{formatScalarText(item)}</Tag>
            ))}
        </div>
      </div>
    )
  }

  if (Array.isArray(normalizedValue) && valueKind === 'arrayMixed') {
    return (
      <ArrayMixedValueRenderer
        normalizedValue={normalizedValue}
        effectiveSchemaNode={effectiveSchemaNode}
        renderNodeHeader={renderNodeHeader}
        panelMarginLeft={panelMarginLeft}
        path={path}
        depth={depth}
        expandMode={expandMode}
        customExpandedKeys={customExpandedKeys}
        onTogglePanel={onTogglePanel}
        renderNested={renderNested}
      />
    )
  }

  if (isPlainObject(normalizedValue)) {
    return (
      <ObjectValueRenderer
        normalizedValue={normalizedValue}
        effectiveSchemaNode={effectiveSchemaNode}
        renderNodeHeader={renderNodeHeader}
        panelMarginLeft={panelMarginLeft}
        path={path}
        depth={depth}
        expandMode={expandMode}
        customExpandedKeys={customExpandedKeys}
        onTogglePanel={onTogglePanel}
        showDiagnostics={showDiagnostics}
        isSchemaMismatch={isSchemaMismatch}
        schemaKind={schemaKind}
        valueKind={valueKind}
        renderNested={renderNested}
      />
    )
  }

  return (
    <div style={{ marginBottom: 8, marginLeft: panelMarginLeft }}>
      <RenderIssueBlock
        title="无法识别的数据结构"
        detail="当前节点无法归类为对象或数组，请检查抽取结果结构。"
        path={path}
      />
    </div>
  )
}

export default StructuredValueRenderer
