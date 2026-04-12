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
  Button,
  Space,
  Typography,
  Tooltip
} from 'antd'
import { EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons'
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

  useEffect(() => {
    setEditValue(value)
    setEditConfidence(confidence)
  }, [value, confidence])

  // 处理保存
  const handleSave = () => {
    onSave?.(field.fieldId, editValue, editConfidence)
    setIsEditing(false)
  }

  // 处理取消
  const handleCancel = () => {
    setEditValue(value)
    setEditConfidence(confidence)
    setIsEditing(false)
    onCancel?.()
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
            style={{ width: '100%' }}
            placeholder={`请输入${field.fieldName}`}
          />
        )
      
      case 'textarea':
        return (
          <TextArea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            rows={3}
            placeholder={`请输入${field.fieldName}`}
          />
        )
      
      case 'datepicker':
        return (
          <DatePicker
            value={editValue ? dayjs(editValue) : null}
            onChange={(date) => setEditValue(date ? date.format('YYYY-MM-DD') : '')}
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
            checkedChildren="是"
            unCheckedChildren="否"
          />
        )
      
      default:
        return (
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
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
      default:
        return <Text>{value}</Text>
    }
  }

  return (
    <div className="field-editor">
      <div className="field-header">
        <Space>
          <Text strong>{field.fieldName}</Text>
          {field.unit && <Text type="secondary">({field.unit})</Text>}
          {confidence !== undefined && (
            <ConfidenceIndicator confidence={confidence} />
          )}
        </Space>
        {editable && !isEditing && (
          <Tooltip title="编辑字段">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => setIsEditing(true)}
            />
          </Tooltip>
        )}
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
            
            <Space size="small">
              <Button
                type="primary"
                size="small"
                icon={<CheckOutlined />}
                onClick={handleSave}
              >
                保存
              </Button>
              <Button
                size="small"
                icon={<CloseOutlined />}
                onClick={handleCancel}
              >
                取消
              </Button>
            </Space>
          </div>
        ) : (
          <div className="field-display-mode">
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