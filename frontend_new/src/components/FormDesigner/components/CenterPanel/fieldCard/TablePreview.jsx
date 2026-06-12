import React from 'react'
import { Button, Space, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'

import { appThemeToken } from '../../../../../styles/themeTokens'
import { TableChildrenList } from './TableChildrenList'

const { Text } = Typography

export const TablePreview = ({
  field,
  isHovered,
  onAddTableChild,
  onAddTableRow,
  onChildSelect,
  onDeleteTableChild,
  onReorderTableChildren,
  onTableChildNameEdit,
}) => {
  const multiRow = !!(field?.multiRow ?? (field?.config?.tableRows === 'multiRow'))
  const tableChildren = Array.isArray(field?.children) ? field.children : []

  return (
    <div
      style={{
        border: `1px solid ${appThemeToken.colorBorder}`,
        borderRadius: 4,
        padding: 12,
        background: appThemeToken.colorFillTertiary,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: appThemeToken.colorFillTertiary,
          padding: '8px 12px',
          marginBottom: 12,
          borderRadius: 4,
          fontSize: 14,
          color: appThemeToken.colorTextSecondary,
        }}
      >
        <Text style={{ fontSize: 14 }}>
          {multiRow ? '固定表格（多行）' : '固定表格（单行）'}
        </Text>
        {isHovered && (
          <Space size={8}>
            <Button
              type="link"
              size="small"
              icon={<PlusOutlined />}
              onClick={(event) => {
                event.stopPropagation()
                onAddTableChild?.()
              }}
            >
              添加列
            </Button>
            {multiRow && (
              <Button
                type="link"
                size="small"
                icon={<PlusOutlined />}
                onClick={(event) => {
                  event.stopPropagation()
                  onAddTableRow?.()
                }}
              >
                新增一行
              </Button>
            )}
          </Space>
        )}
      </div>

      <TableChildrenList
        tableChildren={tableChildren}
        isHovered={isHovered}
        tablePath={[]}
        onChildSelect={(childPath) => onChildSelect?.(childPath)}
        onTableChildNameEdit={(newName, childPath) => onTableChildNameEdit?.(newName, childPath)}
        onDeleteTableChild={(childIdx, childPath) => onDeleteTableChild?.(childIdx, childPath)}
        onReorderTableChildren={(newChildren, tablePath) => onReorderTableChildren?.(newChildren, tablePath)}
        onAddTableChild={(tablePath) => onAddTableChild?.(tablePath)}
      />
    </div>
  )
}
