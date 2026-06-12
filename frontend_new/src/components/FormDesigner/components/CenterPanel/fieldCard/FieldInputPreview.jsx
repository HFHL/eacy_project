import React from 'react'
import { DatePicker, Input, InputNumber, Select, Slider, Space, Typography } from 'antd'

import { appThemeToken } from '../../../../../styles/themeTokens'
import { ChoicePreview } from './ChoicePreview'
import { MatrixPreview } from './MatrixPreview'
import { TablePreview } from './TablePreview'

const { Text } = Typography

const toSelectOptions = (options) => options.map((option) => ({
  value: typeof option === 'object' ? option.value : option,
  label: typeof option === 'object' ? option.label : option,
}))

const getDefaultOptions = (field) => {
  const options = Array.isArray(field?.options) ? field.options : []
  return options.length > 0 ? options : ['选项1', '选项2', '选项3']
}

const getFilePrompt = (fileSubtype = 'any') => {
  switch (fileSubtype) {
    case 'image':
      return { icon: '🖼️', prompt: '点击上传图片' }
    case 'pdf':
      return { icon: '📄', prompt: '请上传PDF文件' }
    case 'dicom':
      return { icon: '🏥', prompt: '请上传DICOM影像文件（.dcm, .dicom）' }
    case 'pathology':
      return { icon: '🔬', prompt: '请上传病理切片文件（.svs, .scn, .ndpi）' }
    case 'any':
    default:
      return {
        icon: '📁',
        prompt: '点击上传文件至此，支持压缩包（rar|zip）、视频（mp4|mov|avi）、office（doc|docx|xls|xlsx|pdf）、图片（jpg|jpeg|png）文件',
      }
  }
}

export const FieldInputPreview = ({
  field = {},
  isHovered = false,
  onOptionEdit,
  onOptionDelete,
  onOptionCopy,
  onAddOption,
  onChildSelect,
  onAddTableChild,
  onAddTableRow,
  onDeleteTableChild,
  onAddMatrixRow,
  onAddMatrixCol,
  onMatrixRowEdit,
  onMatrixColEdit,
  onCopyMatrixRow,
  onDeleteMatrixRow,
  onTableChildNameEdit,
  onReorderTableChildren,
}) => {
  const { displayType = 'text', unit } = field || {}
  const defaultOptions = getDefaultOptions(field)

  switch (displayType) {
    case 'text':
      return <Input placeholder="请输入" disabled style={{ maxWidth: 400, background: appThemeToken.colorFillTertiary }} />
    case 'textarea':
      return (
        <Input.TextArea
          placeholder="请输入"
          disabled
          rows={2}
          style={{ maxWidth: 400, background: appThemeToken.colorFillTertiary }}
        />
      )
    case 'number':
      return (
        <Space>
          <InputNumber placeholder="请输入" disabled style={{ width: 150, background: appThemeToken.colorFillTertiary }} />
          {unit && <Text type="secondary">{unit}</Text>}
        </Space>
      )
    case 'date':
      return <DatePicker placeholder="请选择日期" disabled style={{ maxWidth: 200 }} />
    case 'radio':
      return (
        <ChoicePreview
          options={defaultOptions}
          isHovered={isHovered}
          onOptionEdit={onOptionEdit}
          onOptionDelete={onOptionDelete}
          onOptionCopy={onOptionCopy}
          onAddOption={onAddOption}
          type="radio"
        />
      )
    case 'checkbox':
      return (
        <ChoicePreview
          options={defaultOptions}
          isHovered={isHovered}
          onOptionEdit={onOptionEdit}
          onOptionDelete={onOptionDelete}
          onOptionCopy={onOptionCopy}
          onAddOption={onAddOption}
          type="checkbox"
        />
      )
    case 'select':
      return (
        <Select
          placeholder="请选择"
          disabled
          style={{ width: 200 }}
          options={toSelectOptions(defaultOptions)}
        />
      )
    case 'multiselect':
      return (
        <Select
          mode="multiple"
          placeholder="请选择"
          disabled
          style={{ width: 300 }}
          options={toSelectOptions(defaultOptions)}
        />
      )
    case 'slider':
      return (
        <div style={{ width: 300, padding: '0 10px' }}>
          <Slider disabled defaultValue={0} />
        </div>
      )
    case 'matrix_radio':
    case 'matrix_checkbox':
      return (
        <MatrixPreview
          displayType={displayType}
          field={field}
          isHovered={isHovered}
          onAddMatrixRow={onAddMatrixRow}
          onAddMatrixCol={onAddMatrixCol}
          onMatrixRowEdit={onMatrixRowEdit}
          onMatrixColEdit={onMatrixColEdit}
          onCopyMatrixRow={onCopyMatrixRow}
          onDeleteMatrixRow={onDeleteMatrixRow}
        />
      )
    case 'table':
      return (
        <TablePreview
          field={field}
          isHovered={isHovered}
          onChildSelect={onChildSelect}
          onAddTableChild={onAddTableChild}
          onAddTableRow={onAddTableRow}
          onDeleteTableChild={onDeleteTableChild}
          onTableChildNameEdit={onTableChildNameEdit}
          onReorderTableChildren={onReorderTableChildren}
        />
      )
    case 'file': {
      const { icon, prompt } = getFilePrompt(field?.fileSubtype)
      return (
        <div
          style={{
            border: `1px dashed ${appThemeToken.colorBorder}`,
            borderRadius: 4,
            padding: '20px 12px',
            background: appThemeToken.colorFillTertiary,
            textAlign: 'center',
            color: appThemeToken.colorTextTertiary,
            maxWidth: 300,
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
          <div style={{ fontSize: 12, lineHeight: 1.5 }}>{prompt}</div>
        </div>
      )
    }
    case 'paragraph':
      return (
        <div
          style={{
            padding: 12,
            background: appThemeToken.colorFillTertiary,
            borderRadius: 4,
            color: appThemeToken.colorTextSecondary,
            fontSize: 14,
          }}
        >
          段落说明文字内容...
        </div>
      )
    case 'divider':
      return (
        <div
          style={{
            borderTop: `1px solid ${appThemeToken.colorBorderSecondary}`,
            margin: '8px 0',
            width: '100%',
          }}
        />
      )
    case 'cascader':
      return <Select placeholder="请选择省/市/区" disabled style={{ width: 250 }} />
    case 'randomization': {
      const randomOptions = Array.isArray(field.options) && field.options.length > 0
        ? field.options
        : ['试验组', '对照组']
      return (
        <ChoicePreview
          options={randomOptions}
          isHovered={isHovered}
          onOptionEdit={onOptionEdit}
          onOptionDelete={onOptionDelete}
          onOptionCopy={onOptionCopy}
          onAddOption={onAddOption}
          type="radio"
        />
      )
    }
    default:
      return <Input placeholder="请输入" disabled style={{ maxWidth: 400, background: appThemeToken.colorFillTertiary }} />
  }
}
