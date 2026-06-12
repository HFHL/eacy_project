import React from 'react'
import { Col, Row } from 'antd'

import { useDashboardData } from './hooks/useDashboardData'
import { useDashboardModel } from './hooks/useDashboardModel'
import { useDashboardNavigation } from './hooks/useDashboardNavigation'
import { useProjectSectionHeight } from './hooks/useProjectSectionHeight'
import { DashboardKpiRow } from './sections/DashboardKpiRow'
import { DashboardSideColumn } from './sections/DashboardSideColumn'
import { DashboardToolbar } from './sections/DashboardToolbar'
import { DocumentFlowSection } from './sections/DocumentFlowSection'
import { PatientDistributionSection } from './sections/PatientDistributionSection'
import { ProjectInsightsSection } from './sections/ProjectInsightsSection'
import './dashboard.css'

const Dashboard = () => {
  const dataState = useDashboardData()
  const navigation = useDashboardNavigation()
  const { projectSectionHeight, projectSectionRef } = useProjectSectionHeight()
  const model = useDashboardModel({
    dashboard: dataState.dashboard,
    lastRefreshedAt: dataState.lastRefreshedAt,
    navigateToFileList: navigation.navigateToFileList,
    taskPayload: dataState.taskPayload,
  })

  return (
    <div className="dashboard-workplace">
      <DashboardToolbar
        dashboardLoading={dataState.dashboardLoading}
        lastRefreshedAt={dataState.lastRefreshedAt}
        refreshAll={dataState.refreshAll}
      />

      <DashboardKpiRow
        dashboard={dataState.dashboard}
        extractionSummary={model.extractionSummary}
        navigate={navigation.navigate}
        navigateToFileList={navigation.navigateToFileList}
        overview={model.overview}
        parseTasks={model.parseTasks}
        taskTodayCount={model.taskTodayCount}
      />

      <Row gutter={[24, 24]}>
        <Col xl={18} lg={24} xs={24} className="dashboard-main-column">
          <DocumentFlowSection flowStages={model.flowStages} />
          <PatientDistributionSection
            navigate={navigation.navigate}
            patientCompletenessDistribution={model.patientCompletenessDistribution}
            patientConflictDistribution={model.patientConflictDistribution}
            patientProjectDistribution={model.patientProjectDistribution}
          />
          <ProjectInsightsSection
            navigate={navigation.navigate}
            projectEnrollmentProgress={model.projectEnrollmentProgress}
            projectExtractionProgress={model.projectExtractionProgress}
            projectSectionRef={projectSectionRef}
            projectStatusDistribution={model.projectStatusDistribution}
          />
        </Col>

        <Col xl={6} lg={24} xs={24} className="dashboard-side-column">
          <DashboardSideColumn
            activities={model.activities}
            dashboardLoading={dataState.dashboardLoading}
            dispatchRequestPatientCreate={navigation.dispatchRequestPatientCreate}
            dispatchRequestProjectCreate={navigation.dispatchRequestProjectCreate}
            dispatchRequestTemplateCreate={navigation.dispatchRequestTemplateCreate}
            fetchActiveTasks={dataState.fetchActiveTasks}
            fetchDashboard={dataState.fetchDashboard}
            handleActivityClick={navigation.handleActivityClick}
            handleNotificationClick={navigation.handleNotificationClick}
            navigate={navigation.navigate}
            notifications={model.notifications}
            projectSectionHeight={projectSectionHeight}
            taskLoading={dataState.taskLoading}
          />
        </Col>
      </Row>
    </div>
  )
}

export default Dashboard
