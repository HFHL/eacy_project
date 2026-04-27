import React from 'react'
import { Card, Empty, Typography } from 'antd'
import './index.css'

const { Title, Text } = Typography

export default function ExtractionDebugger() {
  return (
    <div className="extraction-debugger">
      <Card>
        <Title level={4}>AI 抽取调试器</Title>
        <Empty description={<Text type="secondary">接口已移除，当前仅保留空状态 UI。</Text>} />
      </Card>
    </div>
  )
}
