import React from 'react'
import { Alert, Button, Space, Spin, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'

const { Text } = Typography

export const FIXED_SCHEMA_PANEL_HEIGHT = 'clamp(500px, calc(100vh - 260px), 760px)'

export const SchemaEhrLoadingState = () => (
  <div style={{
    height: 500,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: 16,
  }}>
    <Spin size="large" />
    <Text type="secondary">正在加载Schema配置...</Text>
  </div>
)

export const SchemaEhrErrorState = ({ error, onReload }) => (
  <Alert
    message="Schema加载失败"
    description={
      <Space direction="vertical">
        <Text>{error}</Text>
        <Button
          icon={<ReloadOutlined />}
          onClick={onReload}
          size="small"
        >
          重新加载
        </Button>
      </Space>
    }
    type="error"
    showIcon
    style={{ margin: 16 }}
  />
)
