import React from 'react'
import { Button, Card, Col, Row, Space, Typography } from 'antd'
import {
  CheckCircleOutlined,
  DownOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
  UpOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { appThemeToken } from '../../../styles/themeTokens'

const { Text } = Typography

const STAT_CARDS = [
  {
    key: 'totalPatients',
    label: '患者总数',
    icon: UserOutlined,
    color: appThemeToken.colorPrimary,
    format: value => value.toLocaleString()
  },
  {
    key: 'totalDocuments',
    label: '文档总数',
    icon: FileTextOutlined,
    color: appThemeToken.colorSuccess,
    format: value => value.toLocaleString()
  },
  {
    key: 'averageCompleteness',
    label: '平均完整度',
    icon: CheckCircleOutlined,
    color: appThemeToken.colorWarning,
    format: value => `${value}%`
  },
  {
    key: 'recentlyAdded',
    label: '最近30天新增',
    icon: ThunderboltOutlined,
    color: 'rgb(139, 92, 246)',
    format: value => value
  }
]

const PatientStatisticsPanel = ({
  statistics,
  collapsed,
  onToggle,
}) => (
  <Card
    size="small"
    style={{ marginBottom: 16 }}
    title={
      <Space>
        <Text strong>数据概览</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          实时统计 · 最近更新: {new Date().toLocaleTimeString()}
        </Text>
      </Space>
    }
    extra={
      <Button
        type="text"
        size="small"
        icon={collapsed ? <DownOutlined /> : <UpOutlined />}
        onClick={onToggle}
      >
        {collapsed ? '展开' : '收起'}
      </Button>
    }
    styles={{ body: { padding: collapsed ? 0 : undefined, display: collapsed ? 'none' : 'block' } }}
  >
    {!collapsed && (
      <Row gutter={[16, 16]}>
        {STAT_CARDS.map(({ key, label, icon: Icon, color, format }) => (
          <Col key={key} xs={24} sm={6}>
            <div style={{ background: color, borderRadius: '8px', padding: '20px', color: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                <Icon style={{ fontSize: 16, marginRight: 8 }} />
                <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>{label}</Text>
              </div>
              <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 4 }}>
                {format(statistics[key])}
              </div>
            </div>
          </Col>
        ))}
      </Row>
    )}
  </Card>
)

export default PatientStatisticsPanel
