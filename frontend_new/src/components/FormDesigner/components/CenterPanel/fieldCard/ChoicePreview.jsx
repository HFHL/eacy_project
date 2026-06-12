import React from 'react'
import { Button } from 'antd'
import { PlusOutlined } from '@ant-design/icons'

import { EditableOption } from './EditableOption'

export const ChoicePreview = ({
  isHovered,
  onAddOption,
  onOptionCopy,
  onOptionDelete,
  onOptionEdit,
  options,
  type = 'radio',
}) => (
  <div>
    <div style={{ marginBottom: 4 }}>
      {options.map((option, idx) => (
        <EditableOption
          key={idx}
          option={option}
          index={idx}
          onEdit={onOptionEdit}
          onDelete={onOptionDelete}
          onCopy={onOptionCopy}
          type={type}
        />
      ))}
    </div>
    {isHovered && (
      <Button
        type="link"
        size="small"
        icon={<PlusOutlined />}
        onClick={(event) => {
          event.stopPropagation()
          onAddOption?.()
        }}
        style={{ padding: '0 8px', marginTop: 4 }}
      >
        添加选项
      </Button>
    )}
  </div>
)
