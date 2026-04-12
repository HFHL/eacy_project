import React, { useMemo } from 'react'
import { Collapse, Descriptions, Space, Tag, Typography } from 'antd'

const { Text } = Typography

const isNil = (v) => v === null || v === undefined
const isPrimitive = (v) =>
  isNil(v) || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'

const safeToString = (v) => {
  if (isNil(v)) return ''
  if (typeof v === 'string') return v
  try {
    return String(v)
  } catch {
    return ''
  }
}

const defaultKeySort = (a, b) => String(a).localeCompare(String(b), 'zh-CN')

/**
 * 将任意嵌套结构化数据（object/array/primitive）以“表单式”方式展示：
 * - object -> Descriptions（字段-值）
 * - array(primitives) -> Tag 列表
 * - array(objects) -> Collapse 每条记录一折叠项
 * - primitive -> Text
 */
export default function StructuredDataView({
  data,
  depth = 0,
  maxDepth = 6,
  columns = 2,
  dense = true,
  keySort = defaultKeySort
}) {
  const style = useMemo(
    () => ({
      background: dense ? '#fff' : 'transparent',
      border: dense ? '1px solid #f0f0f0' : 'none',
      borderRadius: 6,
      padding: dense ? 12 : 0
    }),
    [dense]
  )

  if (isNil(data)) {
    return <Text type="secondary" style={{ fontStyle: 'italic' }}>（空）</Text>
  }

  if (depth >= maxDepth) {
    return <Text type="secondary">（已折叠：层级过深）</Text>
  }

  if (isPrimitive(data)) {
    return <Text>{safeToString(data)}</Text>
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <Text type="secondary" style={{ fontStyle: 'italic' }}>（空数组）</Text>
    }

    const allPrimitive = data.every((x) => isPrimitive(x))
    if (allPrimitive) {
      return (
        <Space size={[6, 6]} wrap>
          {data.map((x, idx) => (
            <Tag key={idx} style={{ marginInlineEnd: 0 }}>
              {isNil(x) ? '（空）' : safeToString(x)}
            </Tag>
          ))}
        </Space>
      )
    }

    const items = data.map((x, idx) => ({
      key: String(idx),
      label: `第 ${idx + 1} 条`,
      children: <StructuredDataView data={x} depth={depth + 1} maxDepth={maxDepth} columns={columns} dense={dense} keySort={keySort} />
    }))

    return (
      <div style={style}>
        <Collapse size="small" items={items} />
      </div>
    )
  }

  // object
  const entries = Object.entries(data || {})
    .filter(([k, v]) => !String(k).startsWith('_') && v !== undefined)
    .sort(([a], [b]) => keySort(a, b))

  if (entries.length === 0) {
    return <Text type="secondary" style={{ fontStyle: 'italic' }}>（空对象）</Text>
  }

  return (
    <div style={style}>
      <Descriptions
        size="small"
        column={columns}
        layout="vertical"
        styles={{
          label: { color: '#8c8c8c', fontSize: 12 },
          content: { color: '#262626' }
        }}
      >
        {entries.map(([k, v]) => (
          <Descriptions.Item key={String(k)} label={String(k)}>
            <StructuredDataView
              data={v}
              depth={depth + 1}
              maxDepth={maxDepth}
              columns={columns}
              dense={false}
              keySort={keySort}
            />
          </Descriptions.Item>
        ))}
      </Descriptions>
    </div>
  )
}

