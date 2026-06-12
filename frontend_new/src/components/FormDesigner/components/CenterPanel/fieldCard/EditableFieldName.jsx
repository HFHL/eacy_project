import React, { useEffect, useRef, useState } from 'react'
import { Input } from 'antd'

import { appThemeToken } from '../../../../../styles/themeTokens'

export const EditableFieldName = ({
  value,
  onChange,
  isHovered,
  unit,
}) => {
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState(value)
  const inputRef = useRef(null)
  const isComposingRef = useRef(false)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  useEffect(() => {
    setInputValue(value)
  }, [value])

  const handleBlur = () => {
    setEditing(false)
    if (inputValue !== value && inputValue.trim()) {
      onChange?.(inputValue.trim())
    } else {
      setInputValue(value)
    }
  }

  const handleKeyDown = (event) => {
    if (isComposingRef.current) return
    if (event.key === 'Enter') {
      handleBlur()
    } else if (event.key === 'Escape') {
      setInputValue(value)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => { isComposingRef.current = true }}
        onCompositionEnd={() => { isComposingRef.current = false }}
        size="small"
        style={{
          width: 200,
          fontWeight: 600,
          borderColor: appThemeToken.colorPrimary,
        }}
        onClick={(event) => event.stopPropagation()}
      />
    )
  }

  return (
    <span
      style={{
        fontWeight: 600,
        color: appThemeToken.colorText,
        fontSize: 14,
        padding: '2px 8px',
        borderRadius: 4,
        cursor: 'text',
        border: isHovered ? `1px dashed ${appThemeToken.colorPrimary}` : '1px dashed transparent',
        background: isHovered ? appThemeToken.colorPrimaryBg : 'transparent',
        transition: 'all 0.2s',
      }}
      onClick={(event) => {
        event.stopPropagation()
        setEditing(true)
      }}
    >
      {unit ? `${value} [${unit}]` : value}
    </span>
  )
}
