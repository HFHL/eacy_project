import React, { useMemo, useState } from 'react'
import {
  Button,
  Cascader,
  Checkbox,
  DatePicker,
  Divider,
  Input,
  InputNumber,
  Radio,
  Select,
  Slider,
  Space,
  Tag,
  Typography,
  Upload,
} from 'antd'
import { EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { maskSensitiveField } from '@/utils/sensitiveUtils'
import { RESTRICTED_DISPLAY_TYPES } from '../../FormDesigner/core/constants'
import { appThemeToken } from '../../../styles/themeTokens'
import { RADIO_OPTIONS_THRESHOLD } from './fieldRendererUtils'

const { Text } = Typography
const { TextArea } = Input

const TextInput = ({ value, onChange, disabled, placeholder }) => (
  <Input
    value={value}
    onChange={(event) => onChange(event.target.value)}
    disabled={disabled}
    placeholder={placeholder || '请输入'}
    style={{ width: '100%' }}
  />
)

const SensitiveInput = ({ value, onChange, disabled, fieldName }) => {
  const [revealed, setRevealed] = useState(false)
  const maskedDisplay = useMemo(
    () => (value ? maskSensitiveField(String(value), fieldName || '') : ''),
    [fieldName, value]
  )

  return (
    <Input
      value={revealed ? value : maskedDisplay}
      onChange={(event) => {
        if (revealed) onChange(event.target.value)
      }}
      onFocus={() => setRevealed(true)}
      onBlur={() => setRevealed(false)}
      disabled={disabled}
      placeholder="请输入"
      readOnly={!revealed}
      style={{ width: '100%', cursor: revealed ? 'text' : 'pointer', fontFamily: revealed ? 'inherit' : 'monospace' }}
      suffix={!disabled && (
        <span
          style={{ cursor: 'pointer', color: appThemeToken.colorTextTertiary }}
          onMouseDown={(event) => {
            event.preventDefault()
            setRevealed((current) => !current)
          }}
        >
          {revealed ? <EyeInvisibleOutlined /> : <EyeOutlined />}
        </span>
      )}
    />
  )
}

const TextAreaInput = ({ value, onChange, disabled, placeholder }) => (
  <TextArea
    value={value}
    onChange={(event) => onChange(event.target.value)}
    disabled={disabled}
    placeholder={placeholder || '请输入'}
    rows={3}
    style={{ width: '100%' }}
  />
)

const NumberInput = ({ value, onChange, disabled, fieldSchema }) => (
  <InputNumber
    value={value}
    onChange={onChange}
    disabled={disabled}
    placeholder="请输入数字"
    style={{ width: '100%' }}
    addonAfter={fieldSchema['x-unit']}
    min={typeof fieldSchema.minimum === 'number' ? fieldSchema.minimum : undefined}
    max={typeof fieldSchema.maximum === 'number' ? fieldSchema.maximum : undefined}
  />
)

const FileInput = ({ value, onChange, disabled, fieldSchema }) => {
  const fileType = fieldSchema['x-file-type']
  const acceptMap = {
    image: '.jpg,.jpeg,.png,.gif,.webp',
    pdf: '.pdf',
    dicom: '.dcm',
    pathology: '.svs,.tif,.tiff',
    any: undefined,
  }

  return (
    <Space.Compact style={{ width: '100%' }}>
      <Input value={value} placeholder="请选择文件" disabled={disabled} readOnly />
      <Upload
        accept={acceptMap[fileType] || acceptMap.any}
        showUploadList={false}
        beforeUpload={(file) => {
          onChange?.(file?.name || '')
          return false
        }}
        disabled={disabled}
      >
        <Button disabled={disabled}>选择文件</Button>
      </Upload>
    </Space.Compact>
  )
}

const DateInput = ({ value, onChange, disabled }) => (
  <DatePicker
    value={value ? dayjs(value) : null}
    onChange={(date) => onChange(date ? date.format('YYYY-MM-DD') : '')}
    disabled={disabled}
    placeholder="请选择日期"
    style={{ width: '100%' }}
    format="YYYY-MM-DD"
  />
)

const DateTimeInput = ({ value, onChange, disabled }) => (
  <DatePicker
    showTime
    value={value ? dayjs(value) : null}
    onChange={(date) => onChange(date ? date.format('YYYY-MM-DD HH:mm:ss') : '')}
    disabled={disabled}
    placeholder="请选择日期时间"
    style={{ width: '100%' }}
    format="YYYY-MM-DD HH:mm:ss"
  />
)

const SelectInput = ({ value, onChange, disabled, options, multiple, placeholder = '请选择' }) => (
  <Select
    value={value}
    onChange={onChange}
    disabled={disabled}
    options={options}
    placeholder={placeholder}
    style={{ width: '100%' }}
    mode={multiple ? 'multiple' : undefined}
    allowClear
    showSearch
    filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
  />
)

const RadioInput = ({ value, onChange, disabled, options }) => (
  <Radio.Group value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
    <Space wrap>
      {options.map((option) => (
        <Radio key={option.value} value={option.value}>
          {option.label}
        </Radio>
      ))}
    </Space>
  </Radio.Group>
)

const CheckboxGroupInput = ({ value, onChange, disabled, options }) => {
  if (options.length > RADIO_OPTIONS_THRESHOLD) {
    return (
      <SelectInput
        multiple
        value={value || []}
        onChange={onChange}
        disabled={disabled}
        options={options}
        placeholder="请选择（可多选）"
      />
    )
  }

  return (
    <Checkbox.Group
      value={value || []}
      onChange={onChange}
      disabled={disabled}
      options={options}
    />
  )
}

const CheckboxInput = ({ value, onChange, disabled, label }) => (
  <Checkbox
    checked={value === true || value === 'true' || value === '是'}
    onChange={(event) => onChange(event.target.checked)}
    disabled={disabled}
  >
    {label || '是'}
  </Checkbox>
)

const RestrictedTypeNotice = ({ type }) => (
  <div style={{ padding: '10px 12px', border: `1px dashed ${appThemeToken.colorWarning}`, borderRadius: 6, background: 'rgba(250, 173, 20, 0.1)' }}>
    <Space size={8}>
      <Tag color="orange">受限类型</Tag>
      <Text>{type} 暂未纳入运行时基础能力集</Text>
    </Space>
  </div>
)

const ParagraphDisplay = ({ fieldSchema, fieldName }) => (
  <Typography.Paragraph style={{ marginBottom: 0, color: appThemeToken.colorTextSecondary }}>
    {fieldSchema.description || fieldSchema.title || fieldName}
  </Typography.Paragraph>
)

const DividerDisplay = () => <Divider style={{ margin: '8px 0' }} />

export const FieldInputControl = ({
  displayType,
  fieldName,
  fieldSchema,
  isSensitive,
  onChange,
  options,
  value,
  disabled,
}) => {
  const commonProps = {
    value,
    onChange,
    disabled,
    fieldSchema,
  }

  if (isSensitive && ['text', 'textarea'].includes(displayType)) {
    return <SensitiveInput value={value} onChange={onChange} disabled={disabled} fieldName={fieldName} />
  }

  switch (displayType) {
    case 'textarea':
      return <TextAreaInput {...commonProps} />
    case 'number':
      return <NumberInput {...commonProps} />
    case 'date':
      return <DateInput {...commonProps} />
    case 'datetime':
      return <DateTimeInput {...commonProps} />
    case 'select':
      return <SelectInput {...commonProps} options={options} />
    case 'radio':
      return options.length > RADIO_OPTIONS_THRESHOLD
        ? <SelectInput {...commonProps} options={options} />
        : <RadioInput {...commonProps} options={options} />
    case 'checkbox':
      return options.length > 0
        ? <CheckboxGroupInput {...commonProps} options={options} />
        : <CheckboxInput {...commonProps} label={fieldName} />
    case 'multiselect':
      return <SelectInput {...commonProps} options={options} multiple />
    case 'file':
      return <FileInput {...commonProps} />
    case 'slider':
      return <Slider value={typeof value === 'number' ? value : 0} onChange={onChange} disabled={disabled} />
    case 'cascader':
      return <Cascader value={value} onChange={onChange} disabled={disabled} options={options} placeholder="请选择" style={{ width: '100%' }} changeOnSelect />
    case 'multi_text':
    case 'matrix_radio':
    case 'matrix_checkbox':
    case 'randomization':
      return <RestrictedTypeNotice type={displayType} />
    case 'paragraph':
      return <ParagraphDisplay fieldSchema={fieldSchema} fieldName={fieldName} />
    case 'divider':
      return <DividerDisplay />
    case 'text':
    default:
      return RESTRICTED_DISPLAY_TYPES.includes(displayType)
        ? <RestrictedTypeNotice type={displayType} />
        : <TextInput {...commonProps} />
  }
}
