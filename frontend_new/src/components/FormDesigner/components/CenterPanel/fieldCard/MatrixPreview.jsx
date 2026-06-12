import React, { useState } from 'react'
import { Button, Checkbox, Radio, Space, Table } from 'antd'
import { CopyOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'

import { EditableText } from './EditableText'

const MatrixRowCell = ({
  isHovered,
  onCopyMatrixRow,
  onDeleteMatrixRow,
  onMatrixRowEdit,
  rowIdx,
  text,
}) => {
  const [rowHovered, setRowHovered] = useState(false)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        minWidth: 120,
      }}
      onMouseEnter={() => setRowHovered(true)}
      onMouseLeave={() => setRowHovered(false)}
    >
      <EditableText
        value={text}
        onChange={(newValue) => onMatrixRowEdit?.(rowIdx, newValue)}
        textStyle={{ fontWeight: 500 }}
        hoverBorder={isHovered}
      />
      {rowHovered && isHovered && (
        <Space size={2} style={{ marginLeft: 'auto', flexShrink: 0 }}>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined style={{ fontSize: 12 }} />}
            onClick={(event) => {
              event.stopPropagation()
              onCopyMatrixRow?.(rowIdx)
            }}
            style={{ padding: '0 4px', height: 20 }}
          />
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined style={{ fontSize: 12 }} />}
            onClick={(event) => {
              event.stopPropagation()
              onDeleteMatrixRow?.(rowIdx)
            }}
            style={{ padding: '0 4px', height: 20 }}
          />
        </Space>
      )}
    </div>
  )
}

export const MatrixPreview = ({
  displayType,
  field,
  isHovered,
  onAddMatrixCol,
  onAddMatrixRow,
  onCopyMatrixRow,
  onDeleteMatrixRow,
  onMatrixColEdit,
  onMatrixRowEdit,
}) => {
  const isRadioMatrix = displayType === 'matrix_radio'
  const matrixConfig = field?.config || {}
  const matrixRows = matrixConfig.rows || ['题目1', '题目2']
  const matrixCols = matrixConfig.cols || ['选项1', '选项2', '选项3']

  return (
    <div>
      <Table
        columns={[
          {
            title: '',
            dataIndex: 'row',
            key: 'row',
            width: 150,
            render: (text, record, rowIdx) => (
              <MatrixRowCell
                text={text}
                rowIdx={rowIdx}
                isHovered={isHovered}
                onMatrixRowEdit={onMatrixRowEdit}
                onCopyMatrixRow={onCopyMatrixRow}
                onDeleteMatrixRow={onDeleteMatrixRow}
              />
            ),
          },
          ...matrixCols.map((col, colIdx) => ({
            title: (
              <EditableText
                value={col}
                onChange={(newValue) => onMatrixColEdit?.(colIdx, newValue)}
                hoverBorder={isHovered}
              />
            ),
            dataIndex: `col${colIdx}`,
            key: `col${colIdx}`,
            width: 100,
            render: () => (isRadioMatrix ? <Radio disabled /> : <Checkbox disabled />),
          })),
        ]}
        dataSource={matrixRows.map((row, idx) => ({ key: idx, row }))}
        pagination={false}
        size="small"
        bordered
        style={{ maxWidth: 500 }}
      />
      {isHovered && (
        <Space style={{ marginTop: 8 }}>
          <Button
            type="link"
            size="small"
            icon={<PlusOutlined />}
            onClick={(event) => {
              event.stopPropagation()
              onAddMatrixRow?.()
            }}
          >
            新增题目
          </Button>
          <Button
            type="link"
            size="small"
            icon={<PlusOutlined />}
            onClick={(event) => {
              event.stopPropagation()
              onAddMatrixCol?.()
            }}
          >
            添加选项
          </Button>
        </Space>
      )}
    </div>
  )
}
