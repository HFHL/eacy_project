import React from 'react'
import { Avatar, Button, Card, Col, Row, Space, Tag, Typography } from 'antd'
import { EditOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

export const UserOverviewCard = ({
  onEdit,
  onSettings,
  userInfo,
}) => (
  <Card style={{ marginBottom: 24 }}>
    <Row gutter={24} align="middle">
      <Col>
        <Avatar size={80} icon={<UserOutlined />} />
      </Col>
      <Col flex={1}>
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary" style={{ marginRight: 8 }}>姓名</Text>
          <Space align="baseline">
            <Title level={4} style={{ margin: 0 }}>{userInfo.name}</Title>
            <Tag color="green">活跃用户</Tag>
          </Space>
        </div>
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary" style={{ marginRight: 8 }}>职位职称</Text>
          <Text>{userInfo.position || '暂未设置'}</Text>
        </div>
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary" style={{ marginRight: 8 }}>工作单位 · 科室</Text>
          <Text>
            {userInfo.organization || userInfo.department
              ? `${userInfo.organization || '暂未设置'} · ${userInfo.department || '暂未设置'}`
              : '暂未设置'}
          </Text>
        </div>
        <div>
          <Space size={16} wrap>
            <span>
              <Text type="secondary">注册时间：</Text>
              <Text>{userInfo.registeredAt || '--'}</Text>
            </span>
            <span>
              <Text type="secondary">累积使用：</Text>
              <Text>{userInfo.loginDays}天</Text>
            </span>
            <span>
              <Text type="secondary">最后登录：</Text>
              <Text>{userInfo.lastLoginAt || '暂无'}</Text>
            </span>
          </Space>
        </div>
      </Col>
      <Col>
        <Space direction="vertical">
          <Button type="primary" icon={<EditOutlined />} onClick={onEdit}>
            编辑资料
          </Button>
          <Button icon={<SettingOutlined />} onClick={onSettings}>
            系统设置
          </Button>
        </Space>
      </Col>
    </Row>
  </Card>
)
