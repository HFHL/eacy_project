import React, { useEffect, useRef, useState } from 'react'
import { Button, Checkbox, Input, Radio, Space } from 'antd'
import { CopyOutlined, MinusCircleOutlined } from '@ant-design/icons'

import { appThemeToken } from '../../../../../styles/themeTokens'

export const EditableOption = ({
  option,
  index,
  onEdit,
  onDelete,
  onCopy,
  type = 'radio',
}) => {
  const optionLabel = typeof option === 'object' ? option.label : option
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(optionLabel)
  const [optionHovered, setOptionHovered] = useState(false)
  const inputRef = useRef(null)
  const isComposingRef = useRef(false)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const handleBlur = () => {
    setEditing(false)
    if (value !== optionLabel) {
      onEdit?.(index, value)
    }
  }

  const handleKeyDown = (event) => {
    if (isComposingRef.current) return
    if (event.key === 'Enter') {
      handleBlur()
    } else if (event.key === 'Escape') {
      setValue(optionLabel)
      setEditing(false)
    }
  }

  return (
    <div
      className="editable-option-item"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 8px',
        marginLeft: -8,
        borderRadius: 4,
        background: optionHovered ? appThemeToken.colorFillTertiary : 'transparent',
        transition: 'background 0.2s',
      }}
      onMouseEnter={() => setOptionHovered(true)}
      onMouseLeave={() => setOptionHovered(false)}
    >
      {type === 'radio' ? (
        <Radio disabled value={option} />
      ) : (
        <Checkbox disabled value={option} />
      )}

      {editing ? (
        <Input
          ref={inputRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => { isComposingRef.current = true }}
          onCompositionEnd={() => { isComposingRef.current = false }}
          size="small"
          style={{ width: 150, borderColor: appThemeToken.colorPrimary }}
          onClick={(event) => event.stopPropagation()}
        />
      ) : (
        <span
          style={{
            cursor: 'text',
            padding: '2px 6px',
            borderRadius: 4,
            border: optionHovered ? `1px dashed ${appThemeToken.colorPrimary}` : '1px dashed transparent',
            transition: 'border 0.2s',
            minWidth: 60,
          }}
          onClick={(event) => {
            event.stopPropagation()
            setEditing(true)
          }}
        >
          {optionLabel}
        </span>
      )}

      {optionHovered && !editing && (
        <Space size={4} style={{ marginLeft: 'auto' }}>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined style={{ fontSize: 12 }} />}
            onClick={(event) => {
              event.stopPropagation()
              onCopy?.(index)
            }}
            style={{ padding: '0 4px', height: 20 }}
          />
          <Button
            type="text"
            size="small"
            danger
            icon={<MinusCircleOutlined style={{ fontSize: 12 }} />}
            onClick={(event) => {
              event.stopPropagation()
              onDelete?.(index)
            }}
            style={{ padding: '0 4px', height: 20 }}
          />
        </Space>
      )}
    </div>
  )
}
