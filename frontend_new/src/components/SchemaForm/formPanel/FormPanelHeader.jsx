import React from 'react'
import { Space, Tag, Typography } from 'antd'
import { FormOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { appThemeToken } from '../../../styles/themeTokens'

const { Text } = Typography

const FormPanelHeader = ({ title, schemaNode, actions = null }) => {
  const mergeBinding = schemaNode?.['x-merge-binding']
  const sources = schemaNode?.['x-sources']

  return (
    <div style={{ height: 41, padding: '0 12px', borderBottom: `1px solid ${appThemeToken.colorBorder}`, background: appThemeToken.colorBgContainer, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
        <FormOutlined style={{ marginRight: 8, color: appThemeToken.colorPrimary, flexShrink: 0 }} />
        <Text strong style={{ fontSize: 14, color: appThemeToken.colorText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </Text>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{actions}</div>

      {false && (mergeBinding || sources) && (
        <Space wrap style={{ marginTop: 8 }}>
          {mergeBinding && (
            <Tag color="blue" icon={<InfoCircleOutlined />}>
              合并规则: {mergeBinding}
            </Tag>
          )}
          {sources?.primary && sources.primary.length > 0 && (
            <Tag color="green">
              主要来源: {sources.primary.join(', ')}
            </Tag>
          )}
          {sources?.secondary && sources.secondary.length > 0 && (
            <Tag color="orange">
              次要来源: {sources.secondary.join(', ')}
            </Tag>
          )}
        </Space>
      )}
    </div>
  )
}

export default FormPanelHeader
