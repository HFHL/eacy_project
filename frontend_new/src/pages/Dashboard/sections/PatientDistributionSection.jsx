import React from 'react'
import { Card, Col, Row } from 'antd'

import { MiniDonutChart, SectionCard } from '../components'
import { SHOW_DASHBOARD_HINTS } from './DocumentFlowSection'

export const PatientDistributionSection = ({
  navigate,
  patientCompletenessDistribution,
  patientConflictDistribution,
  patientProjectDistribution,
}) => (
  <SectionCard
    title="我的患者"
    className="dashboard-patient-section-card"
    subtitle={SHOW_DASHBOARD_HINTS ? '按项目关联、完整度和冲突状态查看患者分布' : undefined}
  >
    <Row gutter={[16, 16]}>
      <Col xs={24} md={8}>
        <Card
          size="small"
          hoverable
          onClick={() => navigate('/patient/pool')}
          className="dashboard-patient-card"
          title="关联项目患者分布"
        >
          <MiniDonutChart items={patientProjectDistribution} showDetails={false} />
        </Card>
      </Col>
      <Col xs={24} md={8}>
        <Card
          size="small"
          hoverable
          onClick={() => navigate('/patient/pool')}
          className="dashboard-patient-card"
          title="信息完整度分布"
        >
          <MiniDonutChart items={patientCompletenessDistribution} showDetails={false} />
        </Card>
      </Col>
      <Col xs={24} md={8}>
        <Card
          size="small"
          hoverable
          onClick={() => navigate('/patient/pool')}
          className="dashboard-patient-card"
          title="字段冲突"
        >
          <MiniDonutChart items={patientConflictDistribution} emptyText="暂无冲突数据" showDetails={false} />
        </Card>
      </Col>
    </Row>
  </SectionCard>
)
