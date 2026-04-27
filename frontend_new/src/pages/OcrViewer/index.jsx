import React from 'react'
import { Card, Empty, Typography } from 'antd'
import './styles.css'

const { Title, Text } = Typography

export default function OcrViewer() {
  return (
    <Card>
      <Title level={4}>OCR 坐标溯源</Title>
      <Empty description={<Text type="secondary">接口已移除，当前仅保留空状态 UI。</Text>} />
    </Card>
  )
}
