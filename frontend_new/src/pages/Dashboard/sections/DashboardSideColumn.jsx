import React from 'react'
import { Button, Card, Empty, List, Typography } from 'antd'
import {
  ExperimentOutlined,
  FormOutlined,
  TeamOutlined,
  UploadOutlined,
} from '@ant-design/icons'

import { NotificationStream, SectionCard } from '../components'
import { formatTimeAgo } from '../utils'
import { SHOW_DASHBOARD_HINTS } from './DocumentFlowSection'

const { Text } = Typography

const QuickActionsSection = ({
  dispatchRequestPatientCreate,
  dispatchRequestProjectCreate,
  dispatchRequestTemplateCreate,
  navigate,
}) => {
  const quickActions = [
    {
      key: 'upload',
      title: '文件上传',
      icon: <UploadOutlined />,
      onClick: () => navigate('/document/upload'),
    },
    {
      key: 'patient',
      title: '新建患者',
      icon: <TeamOutlined />,
      onClick: () => dispatchRequestPatientCreate(),
    },
    {
      key: 'project',
      title: '新建项目',
      icon: <ExperimentOutlined />,
      onClick: () => dispatchRequestProjectCreate(),
    },
    {
      key: 'crf',
      title: 'CRF 新建',
      icon: <FormOutlined />,
      onClick: () => dispatchRequestTemplateCreate(),
    },
  ]

  return (
    <SectionCard
      title="快捷入口"
      className="dashboard-quick-actions-section-card"
      subtitle={SHOW_DASHBOARD_HINTS ? '直接进入下一步动作' : undefined}
    >
      <div className="dashboard-action-grid">
        {quickActions.map((action) => (
          <Card
            key={action.key}
            hoverable
            onClick={action.onClick}
            className="dashboard-action-card"
            styles={{ body: { padding: 12 } }}
          >
            <div className="dashboard-action-content">
              <div className="dashboard-action-icon">{action.icon}</div>
              <Text strong className="dashboard-action-title">{action.title}</Text>
            </div>
          </Card>
        ))}
      </div>
    </SectionCard>
  )
}

const RecentActivitiesSection = ({
  activities,
  dashboardLoading,
  fetchDashboard,
  handleActivityClick,
  projectSectionHeight,
}) => (
  <SectionCard
    title="最近活动"
    className="dashboard-activity-section-card"
    subtitle={SHOW_DASHBOARD_HINTS ? '保留当前记录能力与展示逻辑' : undefined}
    extra={<Button type="link" onClick={fetchDashboard} loading={dashboardLoading}>刷新</Button>}
    style={projectSectionHeight ? { height: projectSectionHeight } : undefined}
  >
    {activities.length ? (
      <List
        dataSource={activities}
        renderItem={(activity) => (
          <List.Item
            style={{ padding: '12px 0', cursor: 'pointer' }}
            onClick={() => handleActivityClick(activity)}
          >
            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <Text strong style={{ flex: 1 }}>{activity.title}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>{formatTimeAgo(activity.created_at)}</Text>
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>{activity.description || '—'}</Text>
            </div>
          </List.Item>
        )}
      />
    ) : (
      <Empty description="暂无活动" image={Empty.PRESENTED_IMAGE_SIMPLE} />
    )}
  </SectionCard>
)

export const DashboardSideColumn = ({
  activities,
  dashboardLoading,
  dispatchRequestPatientCreate,
  dispatchRequestProjectCreate,
  dispatchRequestTemplateCreate,
  fetchActiveTasks,
  fetchDashboard,
  handleActivityClick,
  handleNotificationClick,
  navigate,
  notifications,
  projectSectionHeight,
  taskLoading,
}) => (
  <>
    <QuickActionsSection
      dispatchRequestPatientCreate={dispatchRequestPatientCreate}
      dispatchRequestProjectCreate={dispatchRequestProjectCreate}
      dispatchRequestTemplateCreate={dispatchRequestTemplateCreate}
      navigate={navigate}
    />

    <SectionCard
      title="审核通知"
      className="dashboard-review-section-card"
      subtitle={SHOW_DASHBOARD_HINTS ? '解析失败、待归档确认、字段冲突和项目抽取任务' : undefined}
      extra={<Button type="link" loading={taskLoading} onClick={fetchActiveTasks}>刷新</Button>}
    >
      <NotificationStream items={notifications} onClick={handleNotificationClick} />
    </SectionCard>

    <RecentActivitiesSection
      activities={activities}
      dashboardLoading={dashboardLoading}
      fetchDashboard={fetchDashboard}
      handleActivityClick={handleActivityClick}
      projectSectionHeight={projectSectionHeight}
    />
  </>
)
