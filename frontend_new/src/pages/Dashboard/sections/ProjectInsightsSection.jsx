import React from 'react'
import { Card, Col, Empty, Row, Space, Tag, Typography } from 'antd'

import { STATUS_COLORS } from '../../../styles/colors'
import { getProjectStatusMeta } from '../../../constants/projectStatusMeta'
import { researchHome, researchProjectDetail } from '../../../utils/researchPaths'
import { MiniDonutChart, SectionCard, SegmentedBar } from '../components'
import { DASHBOARD_COLORS } from '../styleTokens'
import { clampPercent, toNumber } from '../utils'
import { SHOW_DASHBOARD_HINTS } from './DocumentFlowSection'

const { Text } = Typography

const EnrollmentProgressList = ({ navigate, projects }) => {
  if (!projects.length) {
    return <Empty description="暂无项目数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }

  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      {projects.map((project) => {
        const statusMeta = getProjectStatusMeta(project.status)
        const actual = toNumber(project.actual_patient_count)
        const expected = project.expected_patient_count == null ? null : toNumber(project.expected_patient_count)
        const percent = expected == null ? 0 : clampPercent((actual / Math.max(expected, 1)) * 100)
        return (
          <div key={project.id} style={{ cursor: 'pointer' }} onClick={() => navigate(researchProjectDetail(project.id))}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
              <Text strong ellipsis style={{ maxWidth: '70%' }}>{project.name}</Text>
              <Tag color={project.status_color || statusMeta.color}>
                {project.status_label || statusMeta.label}
              </Tag>
            </div>
            <SegmentedBar
              showLegend={false}
              height={10}
              segments={expected == null
                ? [{ key: 'actual', label: '已入组', value: actual, color: DASHBOARD_COLORS.primary }]
                : [
                  { key: 'actual', label: '已入组', value: actual, color: DASHBOARD_COLORS.primary },
                  { key: 'remaining', label: '待入组', value: Math.max(expected - actual, 0), color: STATUS_COLORS.warning.border },
                ]}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {expected == null ? '未设置目标入组人数' : `进度 ${percent}%`}
              </Text>
              <Text strong style={{ fontSize: 12 }}>
                {expected == null ? `${actual} 人` : `${actual}/${expected}`}
              </Text>
            </div>
          </div>
        )
      })}
    </Space>
  )
}

const ExtractionProgressList = ({ navigate, projects }) => {
  if (!projects.length) {
    return <Empty description="暂无抽取任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {projects.map((project) => {
        const remaining = Math.max(
          toNumber(project.total) - toNumber(project.processing) - toNumber(project.completed) - toNumber(project.failed),
          0,
        )
        return (
          <div key={project.id} style={{ cursor: 'pointer' }} onClick={() => navigate(researchProjectDetail(project.id))}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
              <Text strong ellipsis style={{ maxWidth: '70%' }}>{project.name}</Text>
              <Text type="secondary">{project.total} 批</Text>
            </div>
            <SegmentedBar
              showLegend={false}
              height={10}
              segments={[
                { key: 'processing', label: '运行中', value: project.processing, color: DASHBOARD_COLORS.primary },
                { key: 'completed', label: '已完成', value: project.completed, color: DASHBOARD_COLORS.success },
                { key: 'failed', label: '失败', value: project.failed, color: DASHBOARD_COLORS.error },
                { key: 'remaining', label: '未开始', value: remaining, color: DASHBOARD_COLORS.border },
              ]}
            />
            <Space wrap size={[6, 6]} style={{ marginTop: 8 }}>
              <Tag color="processing">运行中 {project.processing}</Tag>
              <Tag color="success">已完成 {project.completed}</Tag>
              <Tag color="error">失败 {project.failed}</Tag>
              {remaining > 0 ? <Tag>未开始 {remaining}</Tag> : null}
            </Space>
          </div>
        )
      })}
    </Space>
  )
}

export const ProjectInsightsSection = ({
  navigate,
  projectEnrollmentProgress,
  projectExtractionProgress,
  projectSectionRef,
  projectStatusDistribution,
}) => (
  <div ref={projectSectionRef}>
    <SectionCard
      title="我的项目"
      subtitle={SHOW_DASHBOARD_HINTS ? '查看项目状态、入组进展和抽取任务分布' : undefined}
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card
            size="small"
            title="项目状态分布"
            hoverable
            onClick={() => navigate(researchHome())}
            className="dashboard-project-card"
          >
            <MiniDonutChart items={projectStatusDistribution} emptyText="暂无项目数据" showDetails={false} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card size="small" title="项目入组进展" className="dashboard-project-card">
            <EnrollmentProgressList navigate={navigate} projects={projectEnrollmentProgress} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card size="small" title="数据抽取统计" className="dashboard-project-card">
            <ExtractionProgressList navigate={navigate} projects={projectExtractionProgress} />
          </Card>
        </Col>
      </Row>
    </SectionCard>
  </div>
)
