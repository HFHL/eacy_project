import React from 'react'
import { Card, Space, Typography } from 'antd'

import { FlowFunnelChart, SectionCard } from '../components'
import { DASHBOARD_SIZES } from '../styleTokens'

const { Text } = Typography

export const SHOW_DASHBOARD_HINTS = false

export const DocumentFlowSection = ({ flowStages }) => (
  <SectionCard
    title="我的文档"
    className="dashboard-doc-section-card"
    subtitle={SHOW_DASHBOARD_HINTS ? '上传、解析、待归档与归档状态一屏查看' : undefined}
  >
    <Card
      size="small"
      className="dashboard-doc-overview-card"
      style={{ borderRadius: DASHBOARD_SIZES.cardRadius }}
      styles={{ body: { padding: 16 } }}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <Text strong>流转总览</Text>
          {SHOW_DASHBOARD_HINTS ? <Text type="secondary">按文档阶段分布，点击即可跳转</Text> : null}
        </div>
        <FlowFunnelChart stages={flowStages} />
      </Space>
    </Card>
  </SectionCard>
)
