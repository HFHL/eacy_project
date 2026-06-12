import React from 'react'
import { Col, Space, Tag, Tooltip, Typography } from 'antd'
import { FileSearchOutlined, LockOutlined } from '@ant-design/icons'
import { appThemeToken } from '../../../styles/themeTokens'

const { Text } = Typography

const FieldLabelColumn = ({
  fieldName,
  fieldSchema,
  isReadOnly,
  isSensitive,
  onSourceIconClick,
  required,
  showSourceIcon,
  unit,
}) => (
  <Col flex="180px">
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <Tooltip
        title={fieldSchema.description}
        placement="topLeft"
        mouseEnterDelay={0.3}
      >
        <Text
          strong
          style={{
            fontSize: 14,
            color: appThemeToken.colorText,
            lineHeight: '22px',
            cursor: fieldSchema.description ? 'help' : 'default',
          }}
        >
          {fieldName}
          {required && <span style={{ color: appThemeToken.colorError, marginLeft: 2 }}>*</span>}
        </Text>
      </Tooltip>

      {unit && (
        <Tag size="small" color="blue" style={{ fontSize: 12, marginLeft: 4 }}>
          {unit}
        </Tag>
      )}
    </div>

    <Space size={4} style={{ marginTop: 2 }}>
      {isSensitive && (
        <Tooltip title="敏感信息（已脱敏）">
          <LockOutlined style={{ fontSize: 12, color: appThemeToken.colorWarning }} />
        </Tooltip>
      )}

      {isReadOnly && (
        <Tooltip title="只读字段">
          <LockOutlined style={{ fontSize: 12, color: appThemeToken.colorTextTertiary }} />
        </Tooltip>
      )}

      {showSourceIcon && (
        <Tooltip title="查看溯源">
          <FileSearchOutlined
            style={{ fontSize: 12, color: appThemeToken.colorPrimary, cursor: 'pointer' }}
            onClick={(event) => {
              event.stopPropagation()
              onSourceIconClick()
            }}
          />
        </Tooltip>
      )}
    </Space>
  </Col>
)

export default FieldLabelColumn
