import React from 'react'
import { Button, Space, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'

const { Text } = Typography

export const DashboardToolbar = ({
  dashboardLoading,
  lastRefreshedAt,
  refreshAll,
}) => (
  <div className="dashboard-toolbar">
    <Space size={8} align="center">
      <Text type="secondary" style={{ fontSize: 12 }}>
        最近刷新：{lastRefreshedAt ? lastRefreshedAt.toLocaleString() : '—'}
      </Text>
      <Button icon={<ReloadOutlined />} loading={dashboardLoading} onClick={refreshAll}>
        刷新
      </Button>
    </Space>
  </div>
)
