/**
 * 字段编辑器组件
 * 支持多种字段类型的原位编辑：文本、数字、日期、选择框等
 */
import React, { useState, useEffect } from 'react'
import {
  Input, 
  InputNumber, 
  DatePicker, 
  Select, 
  Radio, 
  Checkbox, 
  Switch,
  Space,
  Typography
} from 'antd'
import dayjs from 'dayjs'
import ConfidenceIndicator from './ConfidenceIndicator'

const { Text } = Typography
const { TextArea } = Input

const FieldEditor = ({ 
  field, 
  value, 
  confidence,
  editable = true,
  onSave,
  onCancel 
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)
  const [editConfidence, setEditConfidence] = useState(confidence)
  const [valueHovered, setValueHovered] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    setEditValue(value)
    setEditConfidence(confidence)
  }, [value, confidence])

  useEffect(() => {
    if (!isEditing) setPickerOpen(false)
  }, [isEditing])

  /**
   * 提交字段编辑（仅前端暂存，不直接落库）
   * 真正落库仍由弹窗底部“保存修改”统一触发。
   */
  const handleSave = () => {
    const valueChanged = editValue !== value
    const confidenceChanged = editConfidence !== confidence
    if (valueChanged || confidenceChanged) {
      onSave?.(field.fieldId, editValue, editConfidence)
    }
    setIsEditing(false)
  }

  /**
   * 取消编辑并恢复原值。
   */
  const handleCancel = () => {
    setEditValue(value)
    setEditConfidence(confidence)
    setIsEditing(false)
    onCancel?.()
  }

  /**
   * 点击字段值区域进入编辑模式。
   */
  const handleEnterEditMode = () => {
    if (!editable || isEditing) return
    setIsEditing(true)
    if ((field.uiComponentHint || 'text') === 'datepicker') {
      setPickerOpen(true)
    }
  }

  /**
   * 失焦确认：当焦点离开当前字段编辑区域，视为确认修改。
   */
  const handleEditorBlurCapture = (e) => {
    if (!isEditing) return
    if (pickerOpen) return
    const nextFocused = e.relatedTarget
    if (!nextFocused || !e.currentTarget.contains(nextFocused)) {
      handleSave()
    }
  }

  /**
   * 键盘取消：Esc 恢复原值并退出编辑。
   */
  const handleEditorKeyDownCapture = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      handleCancel()
    }
  }

  // 根据字段类型渲染编辑器
  const renderEditor = () => {
    const fieldType = field.uiComponentHint || 'text'
    
    switch (fieldType) {
      case 'number':
        return (
          <InputNumber
            value={editValue}
            onChange={setEditValue}
            onPressEnter={handleSave}
            style={{ width: '100%' }}
            placeholder={`请输入${field.fieldName}`}
          />
        )
      
      case 'textarea':
        return (
          <TextArea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault()
                handleSave()
              }
            }}
            rows={3}
            placeholder={`请输入${field.fieldName}`}
          />
        )
      
      case 'datepicker':
        return (
          <DatePicker
            autoFocus
            open={pickerOpen}
            value={editValue ? dayjs(editValue, 'YYYY-MM-DD') : null}
            format="YYYY-MM-DD"
            onChange={(date, dateString) => {
              const nextValue = dateString || ''
              setEditValue(nextValue)
              if (nextValue !== value || editConfidence !== confidence) {
                onSave?.(field.fieldId, nextValue, editConfidence)
              }
              setPickerOpen(false)
              setIsEditing(false)
            }}
            onOpenChange={(open) => {
              setPickerOpen(open)
            }}
            style={{ width: '100%' }}
            placeholder={`请选择${field.fieldName}`}
          />
        )
      
      case 'select':
        return (
          <Select
            value={editValue}
            onChange={setEditValue}
            style={{ width: '100%' }}
            placeholder={`请选择${field.fieldName}`}
            showSearch
            allowClear
            filterOption={(input, option) =>
              (option?.children ?? '').toLowerCase().includes(input.toLowerCase())
            }
            onBlur={handleSave}
          >
            {field.options?.map(option => (
              <Select.Option key={option.value} value={option.value}>
                {option.label}
              </Select.Option>
            ))}
          </Select>
        )
      
      case 'radio':
        return (
          <Radio.Group
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
          >
            {field.options?.map(option => (
              <Radio key={option.value} value={option.value}>
                {option.label}
              </Radio>
            ))}
          </Radio.Group>
        )
      
      case 'checkbox':
        return (
          <Checkbox.Group
            value={editValue ? editValue.split(',') : []}
            onChange={(values) => setEditValue(values.join(','))}
            onBlur={handleSave}
          >
            {field.options?.map(option => (
              <Checkbox key={option.value} value={option.value}>
                {option.label}
              </Checkbox>
            ))}
          </Checkbox.Group>
        )
      
      case 'switch':
        return (
          <Switch
            checked={editValue === 'true' || editValue === true}
            onChange={(checked) => setEditValue(checked.toString())}
            onBlur={handleSave}
            checkedChildren="是"
            unCheckedChildren="否"
          />
        )
      
      default:
        return (
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onPressEnter={handleSave}
            placeholder={`请输入${field.fieldName}`}
          />
        )
    }
  }

  // 渲染显示值
  const renderDisplayValue = () => {
    if (!value && value !== 0) {
      return <Text type="secondary">未填写</Text>
    }

    const fieldType = field.uiComponentHint || 'text'
    
    switch (fieldType) {
      case 'switch':
        return <Text>{value === 'true' || value === true ? '是' : '否'}</Text>
      case 'checkbox':
        return <Text>{value.split(',').join(', ')}</Text>
      case 'datepicker':
        return <Text>{value ? dayjs(value, 'YYYY-MM-DD').format('YYYY-MM-DD') : ''}</Text>
      default:
        return <Text>{value}</Text>
    }
  }

  return (
    <div
      className="field-editor"
      onBlurCapture={handleEditorBlurCapture}
      onKeyDownCapture={handleEditorKeyDownCapture}
    >
      <div className="field-header">
        <Space>
          <Text strong>{field.fieldName}</Text>
          {field.unit && <Text type="secondary">({field.unit})</Text>}
          {confidence !== undefined && (
            <ConfidenceIndicator confidence={confidence} />
          )}
        </Space>
      </div>

      <div className="field-content">
        {isEditing ? (
          <div className="field-edit-mode">
            <div style={{ marginBottom: 8 }}>
              {renderEditor()}
            </div>
            
            {/* 置信度调整 */}
            {confidence !== undefined && (
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
                  置信度：
                </Text>
                <InputNumber
                  value={editConfidence ? Math.round(editConfidence * 100) : 0}
                  onChange={(val) => setEditConfidence(val / 100)}
                  min={0}
                  max={100}
                  formatter={value => `${value}%`}
                  parser={value => value.replace('%', '')}
                  size="small"
                  style={{ width: 80 }}
                />
              </div>
            )}
          </div>
        ) : (
          <div
            className={`field-display-mode ${editable ? 'field-display-clickable' : ''}`}
            onClick={handleEnterEditMode}
            onMouseEnter={() => setValueHovered(true)}
            onMouseLeave={() => setValueHovered(false)}
            style={{
              borderColor: valueHovered && editable ? '#1677ff' : undefined
            }}
          >
            {renderDisplayValue()}
          </div>
        )}
      </div>

      {field.description && (
        <div className="field-description">
          <Text type="secondary" style={{ fontSize: 12 }}>
            {field.description}
          </Text>
        </div>
      )}
    </div>
  )
}

export default FieldEditor