import React from 'react'
import { DatePicker, Input, InputNumber, Select, Space, Tag, Typography } from 'antd'

import { appThemeToken } from '../../../../../styles/themeTokens'

const { Text } = Typography

export const SimpleFieldPreview = ({ field = {} }) => {
  const { displayType = 'text', unit } = field || {}

  switch (displayType) {
    case 'text':
      return <Input placeholder="请输入" disabled size="small" style={{ maxWidth: 100, background: appThemeToken.colorFillTertiary }} />
    case 'number':
      return (
        <Space size={4}>
          <InputNumber placeholder="请输入" disabled size="small" style={{ width: 80, background: appThemeToken.colorFillTertiary }} />
          {unit && <Text type="secondary" style={{ fontSize: 12 }}>{unit}</Text>}
        </Space>
      )
    case 'date':
      return <DatePicker placeholder="选择日期" disabled size="small" style={{ width: 110 }} />
    case 'select':
      return <Select placeholder="请选择" disabled size="small" style={{ width: 100 }} />
    case 'table': {
      const isMultiRow = field?.multiRow ?? (field?.config?.tableRows === 'multiRow')
      const nestedChildren = Array.isArray(field?.children) ? field.children : []
      return (
        <div
          style={{
            width: '100%',
            border: `1px solid ${appThemeToken.colorBorderSecondary}`,
            borderRadius: 4,
            background: appThemeToken.colorFillTertiary,
            padding: '6px 8px',
          }}
        >
          <div style={{ fontSize: 12, color: appThemeToken.colorTextSecondary, marginBottom: 4 }}>
            子表格（{isMultiRow ? '多行' : '单行'}）
          </div>
          {nestedChildren.length > 0 ? (
            <Space size={4} wrap>
              {nestedChildren.map((nestedField, idx) => (
                <Tag key={nestedField.id || `${nestedField.name}_${idx}`} color="blue" style={{ marginInlineEnd: 0 }}>
                  {nestedField.name}
                </Tag>
              ))}
            </Space>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>暂无列定义</Text>
          )}
        </div>
      )
    }
    default:
      return <Input placeholder="请输入" disabled size="small" style={{ maxWidth: 100, background: appThemeToken.colorFillTertiary }} />
  }
}
