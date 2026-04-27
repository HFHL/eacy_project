import React from 'react'
import { Card, Empty, Typography } from 'antd'
import './styles.css'

const { Title, Text } = Typography

export default function ExtractionV2() {
  return (
    <div className="extraction-v2-page">
      <Card>
        <Title level={4}>V2 抽取测试</Title>
        <Empty description={<Text type="secondary">接口已移除，当前仅保留空状态 UI。</Text>} />
      </Card>
    </div>
  )
}
