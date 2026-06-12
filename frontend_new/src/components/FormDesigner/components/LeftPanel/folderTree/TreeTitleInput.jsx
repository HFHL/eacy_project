import React from 'react'
import { Input } from 'antd'

export const TreeTitleInput = ({
  inputRef,
  isComposingRef,
  onCancel,
  onFinish,
  setValue,
  value,
  width,
}) => (
  <div
    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
    onClick={(event) => event.stopPropagation()}
  >
    <Input
      ref={inputRef}
      size="small"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onPressEnter={() => {
        if (!isComposingRef.current) onFinish()
      }}
      onBlur={onFinish}
      onKeyDown={(event) => {
        if (isComposingRef.current) return
        if (event.key === 'Escape') onCancel()
      }}
      onCompositionStart={() => {
        isComposingRef.current = true
      }}
      onCompositionEnd={() => {
        isComposingRef.current = false
      }}
      style={{ width }}
    />
  </div>
)
