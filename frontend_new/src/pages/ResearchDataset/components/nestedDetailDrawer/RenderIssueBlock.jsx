import React from 'react'
import { Alert, Space, Typography } from 'antd'

const { Text } = Typography

const RenderIssueBlock = ({ title, detail, path }) => (
  <Alert
    style={{ marginBottom: 12 }}
    type="warning"
    showIcon
    message={title}
    description={(
      <Space direction="vertical" size={2}>
        <Text type="secondary">{detail}</Text>
        <Text code>{path || '(root)'}</Text>
      </Space>
    )}
  />
)

export default RenderIssueBlock
