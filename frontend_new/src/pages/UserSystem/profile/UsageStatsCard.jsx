import React from 'react'
import { Card, Col, Descriptions, Divider, Progress, Row, Space, Typography } from 'antd'
import { BarChartOutlined } from '@ant-design/icons'

import { appThemeToken } from '../../../styles/themeTokens'

const { Text } = Typography

const UsageMetric = ({ color, label, value }) => (
  <div style={{ textAlign: 'center', padding: 16 }}>
    <div style={{ fontSize: 24, fontWeight: 'bold', color }}>
      {value}
    </div>
    <div style={{ color: appThemeToken.colorTextTertiary, marginTop: 4 }}>{label}</div>
  </div>
)

export const UsageStatsCard = ({ usageStats }) => (
  <Card
    title={(
      <Space>
        <BarChartOutlined />
        <Text strong>使用统计</Text>
      </Space>
    )}
  >
    <Row gutter={24}>
      <Col span={8}>
        <UsageMetric
          color={appThemeToken.colorPrimary}
          label="管理患者"
          value={usageStats.patientsManaged}
        />
      </Col>
      <Col span={8}>
        <UsageMetric
          color={appThemeToken.colorSuccess}
          label="创建项目"
          value={usageStats.projectsCreated}
        />
      </Col>
      <Col span={8}>
        <UsageMetric
          color={appThemeToken.colorWarning}
          label="上传文档"
          value={usageStats.documentsUploaded}
        />
      </Col>
    </Row>

    <Divider />

    <Row gutter={24}>
      <Col span={12}>
        <Descriptions size="small" column={1}>
          <Descriptions.Item label="本月活跃天数">{usageStats.monthlyActive}天</Descriptions.Item>
          <Descriptions.Item label="总登录次数">{usageStats.totalSessions}次</Descriptions.Item>
        </Descriptions>
      </Col>
      <Col span={12}>
        <div>
          <Text strong style={{ fontSize: 12 }}>本月活跃度</Text>
          <Progress
            percent={Math.round((usageStats.monthlyActive / 30) * 100)}
            size="small"
            strokeColor={appThemeToken.colorSuccess}
            style={{ marginTop: 8 }}
          />
        </div>
      </Col>
    </Row>
  </Card>
)
