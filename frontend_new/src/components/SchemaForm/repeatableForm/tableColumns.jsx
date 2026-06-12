import React from 'react'
import { Badge, Button, Popconfirm, Space, Tooltip, Typography } from 'antd'
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
} from '@ant-design/icons'
import { orderedPropertyEntries } from '../SchemaFormContext'
import { appThemeToken } from '../../../styles/themeTokens'
import CellWithSource from './CellWithSource'

const { Text } = Typography

export function getTableColumns(
  itemSchema,
  onEdit,
  onDelete,
  onCopy,
  onRowSource,
  disabled,
  basePath,
  showCellIcons = true
) {
  if (!itemSchema?.properties) return []

  const columns = []
  const nestedArrayFields = []

  for (const [fieldName, fieldSchema] of orderedPropertyEntries(itemSchema.properties, itemSchema)) {
    if (fieldSchema.type === 'array' && fieldSchema.items?.properties) {
      nestedArrayFields.push({ fieldName, fieldSchema })
    } else if (fieldSchema.type !== 'object' || !fieldSchema.properties) {
      columns.push({
        title: fieldName,
        dataIndex: fieldName,
        key: fieldName,
        ellipsis: true,
        width: 150,
        render: (value, record, index) => (
          <CellWithSource
            value={value}
            fieldSchema={fieldSchema}
            fieldName={fieldName}
            path={`${basePath}.${index}.${fieldName}`}
            rowUid={record?._row_uid || null}
            recordInstanceId={record?._record_instance_id || null}
            onSourceClick={onRowSource}
            showIcon={showCellIcons}
          />
        ),
      })
    }
  }

  for (const { fieldName } of nestedArrayFields) {
    columns.push({
      title: fieldName,
      dataIndex: fieldName,
      key: fieldName,
      width: 120,
      render: (value) => {
        const count = Array.isArray(value) ? value.length : 0
        return (
          <Space>
            <Badge count={count} size="small" style={{ backgroundColor: count > 0 ? appThemeToken.colorSuccess : appThemeToken.colorTextTertiary }} />
            <Text type="secondary">{count}条</Text>
          </Space>
        )
      },
    })
  }

  columns.push({
    title: '',
    key: '_action',
    width: 80,
    fixed: 'right',
    render: (_, record, index) => (
      <Space size={4} className="row-actions">
        <Tooltip title="编辑" placement="top">
          <Button type="text" size="small" icon={<EditOutlined style={{ fontSize: 14 }} />} onClick={(event) => { event.stopPropagation(); onEdit(index, record) }} disabled={disabled} style={{ padding: '2px 4px', height: 'auto' }} />
        </Tooltip>
        <Tooltip title="复制" placement="top">
          <Button type="text" size="small" icon={<CopyOutlined style={{ fontSize: 14 }} />} onClick={(event) => { event.stopPropagation(); onCopy(index) }} disabled={disabled} style={{ padding: '2px 4px', height: 'auto' }} />
        </Tooltip>
        <Popconfirm title="确定删除此记录？" onConfirm={() => onDelete(index)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
          <Tooltip title="删除" placement="top">
            <Button type="text" size="small" icon={<DeleteOutlined style={{ fontSize: 14 }} />} danger disabled={disabled} style={{ padding: '2px 4px', height: 'auto' }} />
          </Tooltip>
        </Popconfirm>
      </Space>
    ),
  })

  return { columns, nestedArrayFields }
}
