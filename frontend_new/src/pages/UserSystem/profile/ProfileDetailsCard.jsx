import React from 'react'
import { Card, Descriptions, Space, Tag, Typography } from 'antd'
import { UserOutlined } from '@ant-design/icons'

const { Text } = Typography

const fallbackText = (value) => value || <Text type="secondary">暂未设置</Text>

export const ProfileDetailsCard = ({ userInfo }) => (
  <Card
    title={(
      <Space>
        <UserOutlined />
        <Text strong>个人信息</Text>
      </Space>
    )}
    style={{ marginBottom: 24 }}
  >
    <Descriptions size="small" column={1}>
      <Descriptions.Item label="用户ID">{userInfo.id}</Descriptions.Item>
      <Descriptions.Item label="姓名">{userInfo.name}</Descriptions.Item>
      <Descriptions.Item label="邮箱">{userInfo.email}</Descriptions.Item>
      <Descriptions.Item label="手机号">{fallbackText(userInfo.phone)}</Descriptions.Item>
      <Descriptions.Item label="工作单位">{fallbackText(userInfo.organization)}</Descriptions.Item>
      <Descriptions.Item label="科室部门">{fallbackText(userInfo.department)}</Descriptions.Item>
      <Descriptions.Item label="职位职称">{fallbackText(userInfo.position)}</Descriptions.Item>
      <Descriptions.Item label="研究领域">
        <Space wrap>
          {userInfo.researchFields && userInfo.researchFields.length > 0 ? (
            userInfo.researchFields.map((field) => (
              <Tag key={field} color="blue">{field}</Tag>
            ))
          ) : (
            <Text type="secondary">暂未设置</Text>
          )}
        </Space>
      </Descriptions.Item>
    </Descriptions>
  </Card>
)
