import React, { useEffect, useRef, useState } from 'react'
import { Input } from 'antd'

import { appThemeToken } from '../../../../../styles/themeTokens'

export const EditableText = ({
  value,
  onChange,
  placeholder = '点击编辑',
  style = {},
  textStyle = {},
  hoverBorder = true,
}) => {
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState(value)
  const [textHovered, setTextHovered] = useState(false)
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
          width: 100,
          borderColor: appThemeToken.colorPrimary,
          ...style,
        }}
        onClick={(event) => event.stopPropagation()}
      />
    )
  }

  return (
    <span
      style={{
        padding: '2px 6px',
        borderRadius: 4,
        cursor: 'text',
        border: hoverBorder && textHovered ? `1px dashed ${appThemeToken.colorPrimary}` : '1px dashed transparent',
        background: textHovered ? appThemeToken.colorPrimaryBg : 'transparent',
        transition: 'all 0.2s',
        ...textStyle,
      }}
      onMouseEnter={() => setTextHovered(true)}
      onMouseLeave={() => setTextHovered(false)}
      onClick={(event) => {
        event.stopPropagation()
        setEditing(true)
      }}
    >
      {value || placeholder}
    </span>
  )
}
