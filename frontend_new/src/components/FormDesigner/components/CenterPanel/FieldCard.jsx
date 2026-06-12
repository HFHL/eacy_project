/**
 * FieldCard - 字段卡片组件
 * 中间面板：设计画布中的单个字段卡片
 */

import React, { useState } from 'react'
import { Button, Space, Typography } from 'antd'
import { CopyOutlined, DeleteOutlined, HolderOutlined } from '@ant-design/icons'

import ContextMenu, { createFieldMenuItems } from '../ContextMenu'
import { appThemeToken } from '../../../../styles/themeTokens'
import { EditableFieldName } from './fieldCard/EditableFieldName'
import { FieldInputPreview } from './fieldCard/FieldInputPreview'

const { Text } = Typography

const FieldCard = ({
  field = {},
  index = 0,
  selected = false,
  onSelect = null,
  onEdit = null,
  onDelete = null,
  onCopy = null,
  onFieldNameChange = null,
  onOptionsChange = null,
  onChildSelect = null,
  onAddTableChild = null,
  onAddTableRow = null,
  onDeleteTableChild = null,
  onAddMatrixRow = null,
  onAddMatrixCol = null,
  onCopyMatrixRow = null,
  onDeleteMatrixRow = null,
  onMatrixConfigChange = null,
  onTableChildNameChange = null,
  onReorderTableChildren = null,
  readonly = false,
  dragHandleProps = null,
}) => {
  const [hovered, setHovered] = useState(false)
  const [nameHovered, setNameHovered] = useState(false)
  const safeField = field || {}

  const contextMenuItems = createFieldMenuItems({
    onEdit,
    onCopy,
    onDelete,
    readonly,
  })

  const handleClick = (event) => {
    event.stopPropagation()
    onSelect?.()
  }

  const handleFieldNameChange = (newName) => {
    onFieldNameChange?.(safeField.id, newName)
  }

  const handleOptionEdit = (optionIndex, newValue) => {
    if (!onOptionsChange || !safeField.options) return
    const newOptions = [...safeField.options]
    newOptions[optionIndex] = newValue
    onOptionsChange(safeField.id, newOptions)
  }

  const handleOptionDelete = (optionIndex) => {
    if (!onOptionsChange || !safeField.options) return
    onOptionsChange(
      safeField.id,
      safeField.options.filter((_, currentIndex) => currentIndex !== optionIndex),
    )
  }

  const handleOptionCopy = (optionIndex) => {
    if (!onOptionsChange || !safeField.options) return
    const newOptions = [...safeField.options]
    const optionToCopy = safeField.options[optionIndex]
    newOptions.splice(optionIndex + 1, 0, `${optionToCopy}_副本`)
    onOptionsChange(safeField.id, newOptions)
  }

  const handleAddOption = () => {
    if (!onOptionsChange) return
    const currentOptions = safeField.options || []
    onOptionsChange(safeField.id, [
      ...currentOptions,
      `选项${currentOptions.length + 1}`,
    ])
  }

  const handleMatrixRowEdit = (rowIdx, newValue) => {
    if (!onMatrixConfigChange) return
    const currentConfig = safeField.config || { rows: [], cols: [] }
    const newRows = [...(currentConfig.rows || ['题目1', '题目2'])]
    newRows[rowIdx] = newValue
    onMatrixConfigChange(safeField.id, { ...currentConfig, rows: newRows })
  }

  const handleMatrixColEdit = (colIdx, newValue) => {
    if (!onMatrixConfigChange) return
    const currentConfig = safeField.config || { rows: [], cols: [] }
    const newCols = [...(currentConfig.cols || ['选项1', '选项2', '选项3'])]
    newCols[colIdx] = newValue
    onMatrixConfigChange(safeField.id, { ...currentConfig, cols: newCols })
  }

  const handleTableChildNameEdit = (newName, childPath = []) => {
    onTableChildNameChange?.(safeField.id, null, newName, childPath)
  }

  return (
    <ContextMenu items={contextMenuItems} disabled={readonly}>
      <div
        className={`field-card-preview ${selected ? 'selected' : ''} ${hovered ? 'hovered' : ''}`}
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          padding: '16px 20px',
          marginBottom: 16,
          background: selected ? appThemeToken.colorPrimaryBg : appThemeToken.colorBgContainer,
          borderRadius: 8,
          border: selected ? `2px solid ${appThemeToken.colorPrimary}` : `1px solid ${appThemeToken.colorBorder}`,
          boxShadow: hovered ? '0 4px 12px rgba(0, 0, 0, 0.1)' : 'none',
          transition: 'all 0.2s',
          cursor: 'pointer',
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 12,
            gap: 8,
          }}
        >
          {dragHandleProps && !readonly && (
            <span
              style={{
                cursor: 'grab',
                color: appThemeToken.colorTextTertiary,
                display: 'flex',
                alignItems: 'center',
              }}
              {...dragHandleProps.attributes}
              {...dragHandleProps.listeners}
            >
              <HolderOutlined />
            </span>
          )}

          <Text strong style={{ color: appThemeToken.colorTextTertiary, fontSize: 14, minWidth: 20 }}>
            {index + 1}
          </Text>

          <div
            onMouseEnter={() => setNameHovered(true)}
            onMouseLeave={() => setNameHovered(false)}
          >
            <EditableFieldName
              value={safeField.name || '未命名字段'}
              onChange={handleFieldNameChange}
              isHovered={nameHovered}
              unit={safeField.unit}
            />
          </div>

          {hovered && !readonly && (
            <Space size={4} style={{ marginLeft: 'auto' }}>
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={(event) => {
                  event.stopPropagation()
                  onCopy?.()
                }}
              />
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={(event) => {
                  event.stopPropagation()
                  onDelete?.()
                }}
              />
            </Space>
          )}
        </div>

        <div style={{ paddingLeft: dragHandleProps ? 24 : 0 }}>
          <FieldInputPreview
            field={safeField}
            isHovered={hovered}
            onOptionEdit={handleOptionEdit}
            onOptionDelete={handleOptionDelete}
            onOptionCopy={handleOptionCopy}
            onAddOption={handleAddOption}
            onChildSelect={(childPath = []) => {
              const childId = childPath[childPath.length - 1] || null
              onChildSelect?.(safeField.id, childId, childPath)
            }}
            onAddTableChild={(tablePath = []) => onAddTableChild?.(safeField.id, tablePath)}
            onAddTableRow={() => onAddTableRow?.(safeField.id)}
            onDeleteTableChild={(childIdx, childPath = []) => {
              onDeleteTableChild?.(safeField.id, childIdx, childPath)
            }}
            onAddMatrixRow={() => onAddMatrixRow?.(safeField.id)}
            onAddMatrixCol={() => onAddMatrixCol?.(safeField.id)}
            onCopyMatrixRow={(rowIdx) => onCopyMatrixRow?.(safeField.id, rowIdx)}
            onDeleteMatrixRow={(rowIdx) => onDeleteMatrixRow?.(safeField.id, rowIdx)}
            onMatrixRowEdit={handleMatrixRowEdit}
            onMatrixColEdit={handleMatrixColEdit}
            onTableChildNameEdit={handleTableChildNameEdit}
            onReorderTableChildren={(newChildren, tablePath = []) => {
              onReorderTableChildren?.(safeField.id, newChildren, tablePath)
            }}
          />
        </div>
      </div>
    </ContextMenu>
  )
}

export default FieldCard
