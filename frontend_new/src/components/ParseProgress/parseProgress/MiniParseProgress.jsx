import React from 'react'
import { Progress, Space, Spin, Typography } from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons'

import { appThemeToken } from '../../../styles/themeTokens'

const { Text } = Typography

export function MiniParseProgress({ documentId, status, progress = 0 }) {
  if (status === 'completed') {
    return (
      <Space size={4}>
        <CheckCircleOutlined style={{ color: appThemeToken.colorSuccess }} />
        <Text type="success">已完成</Text>
      </Space>
    )
  }

  if (status === 'failed') {
    return (
      <Space size={4}>
        <CloseCircleOutlined style={{ color: appThemeToken.colorError }} />
        <Text type="danger">失败</Text>
      </Space>
    )
  }

  if (status === 'parsing') {
    return (
      <Space size={4}>
        <Spin size="small" />
        <Progress
          percent={progress}
          size="small"
          style={{ width: 80 }}
          showInfo={false}
        />
        <Text type="secondary">{progress}%</Text>
      </Space>
    )
  }

  return (
    <Space size={4}>
      <ClockCircleOutlined style={{ color: appThemeToken.colorTextTertiary }} />
      <Text type="secondary">待解析</Text>
    </Space>
  )
}
