import React from 'react'
import { Col, Progress, Row, Statistic } from 'antd'
import { appThemeToken } from '../../styles/themeTokens'

const UploadStats = ({ stats, totalProgress }) => (
  <div style={{
    padding: '16px',
    backgroundColor: appThemeToken.colorFillTertiary,
    borderRadius: '8px',
    marginBottom: '16px',
  }}>
    <Row gutter={16}>
      <Col span={6}>
        <Statistic title="总计" value={stats.total} valueStyle={{ fontSize: 20 }} />
      </Col>
      <Col span={6}>
        <Statistic
          title="成功"
          value={stats.success}
          valueStyle={{ fontSize: 20, color: appThemeToken.colorSuccess }}
        />
      </Col>
      <Col span={6}>
        <Statistic
          title="失败"
          value={stats.failed}
          valueStyle={{ fontSize: 20, color: appThemeToken.colorError }}
        />
      </Col>
      <Col span={6}>
        <Statistic title="进度" value={totalProgress} suffix="%" valueStyle={{ fontSize: 20 }} />
      </Col>
    </Row>
    <Progress
      percent={totalProgress}
      status={stats.failed > 0 ? 'exception' : (totalProgress === 100 ? 'success' : 'active')}
      style={{ marginTop: 12, marginBottom: 0 }}
    />
  </div>
)

export default UploadStats
