import React from 'react'
import { Collapse, Space, Tag, Typography } from 'antd'

import { buildTypeLabel } from './nestedValueUtils'

const { Text } = Typography

const getArrayActiveKeys = (panelItems, expandMode, customExpandedKeys) => {
  if (expandMode === 'all') return panelItems.map((item) => item.key)
  if (expandMode === 'none') return []
  return panelItems.filter((item) => customExpandedKeys.includes(item.key)).map((item) => item.key)
}

const ArrayMixedValueRenderer = ({
  normalizedValue,
  effectiveSchemaNode,
  renderNodeHeader,
  panelMarginLeft,
  path,
  depth,
  expandMode,
  customExpandedKeys,
  onTogglePanel,
  renderNested,
}) => {
  const panelItems = normalizedValue.map((item, index) => {
    const panelKey = `${path}[${index}]`
    const isExpanded = expandMode === 'all' || (expandMode === 'custom' && customExpandedKeys.includes(panelKey))
    return {
      key: panelKey,
      label: (
        <Space size={6}>
          <Text>{`第 ${index + 1} 项`}</Text>
          <Tag>{buildTypeLabel(item)}</Tag>
        </Space>
      ),
      children: renderNested({
        value: item,
        schemaNode: effectiveSchemaNode?.items || null,
        label: `第 ${index + 1} 项`,
        path: panelKey,
        depth: depth + 1,
      }),
      forceRender: isExpanded,
    }
  })

  return (
    <div style={{ marginBottom: 12, marginLeft: panelMarginLeft }}>
      <div style={{ marginBottom: 8 }}>{renderNodeHeader}</div>
      <Collapse
        size="small"
        items={panelItems}
        activeKey={getArrayActiveKeys(panelItems, expandMode, customExpandedKeys)}
        onChange={(keys) => {
          const changedKeys = Array.isArray(keys) ? keys : [keys]
          panelItems.forEach((item) => {
            const shouldOpen = changedKeys.includes(item.key)
            const isOpen = expandMode === 'all' || (expandMode === 'custom' && customExpandedKeys.includes(item.key))
            if (shouldOpen !== isOpen) onTogglePanel(item.key)
          })
        }}
      />
    </div>
  )
}

export default ArrayMixedValueRenderer
