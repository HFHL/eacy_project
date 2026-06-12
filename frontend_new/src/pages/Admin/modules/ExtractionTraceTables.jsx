import React from 'react'
import { Alert, Table, Tooltip, Typography } from 'antd'

const { Text } = Typography

export const FieldSpecsTable = ({ specs = [] }) => (
  <Table
    size="small"
    rowKey={(row) => row.field_path}
    pagination={{ pageSize: 15, size: 'small' }}
    dataSource={specs}
    columns={[
      { title: '字段路径', dataIndex: 'field_path', ellipsis: true, width: 260 },
      { title: '标题', dataIndex: 'field_title', width: 160, ellipsis: true },
      { title: '类型', dataIndex: 'value_type', width: 90 },
      { title: '表单', dataIndex: 'record_form_key', width: 180, ellipsis: true },
    ]}
  />
)

export const ExtractedFieldsTable = ({ fields = [] }) => {
  if (!fields.length) return <Alert type="info" showIcon message="暂无物化字段" />

  return (
    <Table
      size="small"
      rowKey="id"
      pagination={{ pageSize: 10, size: 'small' }}
      dataSource={fields}
      columns={[
        { title: '字段路径', dataIndex: 'field_path', width: 240, ellipsis: true },
        {
          title: '值',
          dataIndex: 'value',
          ellipsis: true,
          render: (value) => {
            const text = value == null ? '—' : (typeof value === 'string' ? value : JSON.stringify(value))
            return (
              <Tooltip title={text}>
                <Text>{text.length > 60 ? `${text.slice(0, 60)}…` : text}</Text>
              </Tooltip>
            )
          },
        },
        { title: '证据', dataIndex: 'source_text', ellipsis: true },
        { title: '页', dataIndex: 'source_page', width: 60 },
      ]}
    />
  )
}
