import React from 'react'
import { Col, Row } from 'antd'
import {
  ExperimentOutlined,
  FileTextOutlined,
  ProjectOutlined,
  TeamOutlined,
} from '@ant-design/icons'

import { KpiCard } from '../components'
import { DASHBOARD_COLORS } from '../styleTokens'
import { toNumber } from '../utils'
import { researchHome } from '../../../utils/researchPaths'

export const DashboardKpiRow = ({
  dashboard,
  extractionSummary,
  navigate,
  navigateToFileList,
  overview,
  parseTasks,
  taskTodayCount,
}) => (
  <Row gutter={[16, 16]} className="dashboard-kpi-row">
    <Col xs={24} sm={12} xl={6}>
      <KpiCard
        title="患者"
        value={toNumber(overview.patients_total)}
        delta={`${toNumber(dashboard?.patients?.recently_added_today)} 人`}
        icon={<TeamOutlined />}
        color={DASHBOARD_COLORS.patient}
        onClick={() => navigate('/patient/pool')}
      />
    </Col>
    <Col xs={24} sm={12} xl={6}>
      <KpiCard
        title="文档"
        value={toNumber(overview.documents_total)}
        delta={`${toNumber(dashboard?.documents?.today_added)} 份`}
        icon={<FileTextOutlined />}
        color={DASHBOARD_COLORS.document}
        onClick={() => navigateToFileList({ tab: 'all' })}
      />
    </Col>
    <Col xs={24} sm={12} xl={6}>
      <KpiCard
        title="项目"
        value={toNumber(overview.total_projects)}
        delta={`${toNumber(dashboard?.projects?.today_added)} 个`}
        icon={<ExperimentOutlined />}
        color={DASHBOARD_COLORS.project}
        onClick={() => navigate(researchHome())}
      />
    </Col>
    <Col xs={24} sm={12} xl={6}>
      <KpiCard
        title="任务"
        value={toNumber(extractionSummary.total) || parseTasks.length}
        delta={`${taskTodayCount} 批`}
        icon={<ProjectOutlined />}
        color={DASHBOARD_COLORS.task}
        onClick={() => navigate(researchHome())}
      />
    </Col>
  </Row>
)
