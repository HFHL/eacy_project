import React from 'react'
import {
  Checkbox,
  DatePicker,
  Input,
  InputNumber,
  Radio,
  Select,
  Switch,
} from 'antd'
import dayjs from 'dayjs'

const { TextArea } = Input

const FieldInputControl = ({
  editValue,
  field,
  onDateCommit,
  onPickerOpenChange,
  onSave,
  onValueChange,
  pickerOpen,
}) => {
  const fieldType = field.uiComponentHint || 'text'
  const placeholder = `${fieldType === 'datepicker' ? '请选择' : '请输入'}${field.fieldName}`

  switch (fieldType) {
    case 'number':
      return (
        <InputNumber
          value={editValue}
          onChange={onValueChange}
          onPressEnter={onSave}
          style={{ width: '100%' }}
          placeholder={placeholder}
        />
      )

    case 'textarea':
      return (
        <TextArea
          value={editValue}
          onChange={(event) => onValueChange(event.target.value)}
          onPressEnter={(event) => {
            if (!event.shiftKey) {
              event.preventDefault()
              onSave()
            }
          }}
          rows={3}
          placeholder={placeholder}
        />
      )

    case 'datepicker':
      return (
        <DatePicker
          autoFocus
          open={pickerOpen}
          value={editValue ? dayjs(editValue, 'YYYY-MM-DD') : null}
          format="YYYY-MM-DD"
          onChange={(_, dateString) => onDateCommit(dateString || '')}
          onOpenChange={onPickerOpenChange}
          style={{ width: '100%' }}
          placeholder={placeholder}
        />
      )

    case 'select':
      return (
        <Select
          value={editValue}
          onChange={onValueChange}
          style={{ width: '100%' }}
          placeholder={`请选择${field.fieldName}`}
          showSearch
          allowClear
          filterOption={(input, option) => (
            (option?.children ?? '').toLowerCase().includes(input.toLowerCase())
          )}
          onBlur={onSave}
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
        <Radio.Group value={editValue} onChange={(event) => onValueChange(event.target.value)} onBlur={onSave}>
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
          onChange={(values) => onValueChange(values.join(','))}
          onBlur={onSave}
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
          onChange={(checked) => onValueChange(checked.toString())}
          onBlur={onSave}
          checkedChildren="是"
          unCheckedChildren="否"
        />
      )

    default:
      return (
        <Input
          value={editValue}
          onChange={(event) => onValueChange(event.target.value)}
          onPressEnter={onSave}
          placeholder={placeholder}
        />
      )
  }
}

export default FieldInputControl
