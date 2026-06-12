import React from 'react'
import { Card, Col, Row, Statistic } from 'antd'
import {
  CloudServerOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'

import { appThemeToken } from '../../../styles/themeTokens'

export const OverviewCards = ({ stats, loading }) => {
  const overview = stats?.overview || {}
  const items = [
    { title: '用户总数', value: overview.total_users ?? '-', icon: <TeamOutlined />, color: appThemeToken.colorPrimary },
    { title: '患者总数', value: overview.total_patients ?? '-', icon: <UserOutlined />, color: appThemeToken.colorSuccess },
    { title: '文档总数', value: overview.total_documents ?? '-', icon: <FileTextOutlined />, color: appThemeToken.colorWarning },
    { title: '项目总数', value: overview.total_projects ?? '-', icon: <ExperimentOutlined />, color: 'rgb(114, 46, 209)' },
    { title: '模板总数', value: overview.total_templates ?? '-', icon: <DatabaseOutlined />, color: 'rgb(19, 194, 194)' },
    { title: '活跃任务', value: overview.active_tasks ?? '-', icon: <CloudServerOutlined />, color: 'rgb(235, 47, 150)' },
  ]

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
      {items.map((item) => (
        <Col xs={12} sm={8} md={4} key={item.title}>
          <Card size="small" loading={loading} style={{ borderRadius: 8 }}>
            <Statistic
              title={<span style={{ fontSize: 12 }}>{item.title}</span>}
              value={item.value}
              prefix={React.cloneElement(item.icon, { style: { color: item.color, fontSize: 16 } })}
              valueStyle={{ fontSize: 20 }}
            />
          </Card>
        </Col>
      ))}
    </Row>
  )
}
