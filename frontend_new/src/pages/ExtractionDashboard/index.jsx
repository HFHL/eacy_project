import React from 'react'
import { Card, Empty, Typography } from 'antd'

const { Title, Text } = Typography

export default function ExtractionDashboard() {
  return (
    <Card>
      <Title level={4}>AI 抽取工作流</Title>
      <Empty description={<Text type="secondary">接口已移除，当前仅保留空状态 UI。</Text>} />
    </Card>
  )
}
