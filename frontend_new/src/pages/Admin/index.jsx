import React, { useEffect, useState } from 'react'
import { Card, Tabs } from 'antd'
import {
  CloudServerOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  TeamOutlined,
} from '@ant-design/icons'

import { getAdminStats } from '../../api/admin'
import { DocumentsTab } from './modules/DocumentsTab'
import { ExtractionTasksTab } from './modules/ExtractionTasksTab'
import { OverviewCards } from './modules/OverviewCards'
import { ProjectsTab } from './modules/ProjectsTab'
import { TemplatesTab } from './modules/TemplatesTab'
import { UsersTab } from './modules/UsersTab'

const AdminPage = () => {
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)

  useEffect(() => {
    const fetchStats = async () => {
      setStatsLoading(true)
      try {
        const res = await getAdminStats()
        setStats(res?.data || null)
      } catch {
        /* handled */
      }
      setStatsLoading(false)
    }
    fetchStats()
  }, [])

  const tabItems = [
    { key: 'users', label: <span><TeamOutlined /> 用户管理</span>, children: <UsersTab /> },
    { key: 'projects', label: <span><ExperimentOutlined /> 项目概览</span>, children: <ProjectsTab /> },
    { key: 'extraction', label: <span><CloudServerOutlined /> 抽取任务</span>, children: <ExtractionTasksTab /> },
    { key: 'templates', label: <span><DatabaseOutlined /> CRF模板</span>, children: <TemplatesTab /> },
    { key: 'documents', label: <span><FileTextOutlined /> 文档管理</span>, children: <DocumentsTab /> },
  ]

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <OverviewCards stats={stats} loading={statsLoading} />
      <Card style={{ borderRadius: 8 }}>
        <Tabs items={tabItems} destroyInactiveTabPane size="large" />
      </Card>
    </div>
  )
}

export default AdminPage
