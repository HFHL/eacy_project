import React, { useEffect, useRef, useState } from 'react'
import { Input } from 'antd'

import { appThemeToken } from '../../../../../styles/themeTokens'

export const EditableGroupTitle = ({ value, onChange, isHovered }) => {
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
          width: 280,
          fontSize: 14,
          fontWeight: 500,
          borderColor: appThemeToken.colorBorder,
        }}
        onClick={(event) => event.stopPropagation()}
      />
    )
  }

  return (
    <div
      className="group-title"
      style={{
        cursor: 'text',
        borderRadius: 6,
        border: isHovered ? `1px solid ${appThemeToken.colorBorder}` : '1px solid transparent',
        background: isHovered ? appThemeToken.colorFillTertiary : 'transparent',
        transition: 'all 0.2s',
      }}
      onClick={(event) => {
        event.stopPropagation()
        setEditing(true)
      }}
    >
      {value}
    </div>
  )
}
