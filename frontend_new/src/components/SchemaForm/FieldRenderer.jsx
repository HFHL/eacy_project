/**
 * 字段渲染器组件
 * 根据Schema的x-display类型渲染不同的表单控件
 * 使用传统研究表单的一字段一行模式
 */
import React, { useCallback, useMemo } from 'react'
import { Col, Row } from 'antd'
import { useSchemaForm } from './SchemaFormContext'
import { appThemeToken } from '../../styles/themeTokens'
import { FieldInputControl } from './fieldRenderer/FieldInputControls'
import FieldLabelColumn from './fieldRenderer/FieldLabelColumn'
import {
  getDisplayType,
  getOptionsFromSchema,
  RADIO_OPTIONS_THRESHOLD,
} from './fieldRenderer/fieldRendererUtils'

/**
 * 字段渲染器主组件 - 一字段一行布局
 * 点击字段卡片任意位置选中+定位，点击值框直接可编辑
 */
const FieldRenderer = ({
  fieldName,
  fieldSchema,
  path,
  value,
  onChange,
  disabled = false,
  required = false,
  onSourceClick,
  isSelected = false,
  showSourceIcon = true,
}) => {
  const { enums } = useSchemaForm()

  const options = useMemo(
    () => getOptionsFromSchema(fieldSchema, enums),
    [enums, fieldSchema]
  )

  const displayType = useMemo(
    () => getDisplayType(fieldSchema, options.length),
    [fieldSchema, options.length]
  )

  const isReadOnly = fieldSchema['x-editable'] === false || disabled
  const isSensitive = fieldSchema['x-sensitive']
  const unit = fieldSchema['x-unit']

  const handleChange = useCallback((newValue) => {
    if (!isReadOnly && onChange) {
      onChange(newValue)
    }
  }, [isReadOnly, onChange])

  /**
   * 选中当前字段并触发溯源回调。
   *
   * @param {{ forceOpen?: boolean, trigger?: string }} [options] 触发选项。
   * @returns {void}
   */
  const handleSelectField = useCallback((options = {}) => {
    if (onSourceClick) {
      onSourceClick(path, fieldSchema, fieldName, options)
    }
  }, [fieldName, fieldSchema, onSourceClick, path])

  const cardStyle = useMemo(() => ({
    marginBottom: 12,
    padding: '10px 12px',
    background: isSelected ? appThemeToken.colorPrimaryBg : appThemeToken.colorFillTertiary,
    borderRadius: 6,
    border: isSelected ? `1px solid ${appThemeToken.colorPrimary}` : `1px solid ${appThemeToken.colorBorder}`,
    boxShadow: isSelected ? '0 0 0 2px rgba(24, 144, 255, 0.2)' : 'none',
    transition: 'all 0.2s',
    cursor: onSourceClick ? 'pointer' : 'default',
  }), [isSelected, onSourceClick])

  return (
    <div
      style={cardStyle}
      onClick={() => handleSelectField({ forceOpen: false, trigger: 'field-card' })}
      onMouseEnter={(event) => {
        if (!isSelected) {
          event.currentTarget.style.borderColor = appThemeToken.colorBorder
          event.currentTarget.style.background = appThemeToken.colorFillSecondary
        }
      }}
      onMouseLeave={(event) => {
        if (!isSelected) {
          event.currentTarget.style.borderColor = appThemeToken.colorBorder
          event.currentTarget.style.background = appThemeToken.colorFillTertiary
        }
      }}
    >
      <Row gutter={16} align="middle">
        <FieldLabelColumn
          fieldName={fieldName}
          fieldSchema={fieldSchema}
          isReadOnly={isReadOnly}
          isSensitive={isSensitive}
          onSourceIconClick={() => handleSelectField({ forceOpen: true, trigger: 'source-icon' })}
          required={required}
          showSourceIcon={showSourceIcon}
          unit={unit}
        />

        <Col flex="auto">
          <FieldInputControl
            displayType={displayType}
            fieldName={fieldName}
            fieldSchema={fieldSchema}
            isSensitive={isSensitive}
            onChange={handleChange}
            options={options}
            value={value}
            disabled={isReadOnly}
          />
        </Col>
      </Row>
    </div>
  )
}

export default FieldRenderer
export { getDisplayType, getOptionsFromSchema, RADIO_OPTIONS_THRESHOLD }
