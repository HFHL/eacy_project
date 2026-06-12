import React from 'react'
import { Button, Card, Space } from 'antd'
import { ExperimentOutlined, FileTextOutlined, TeamOutlined } from '@ant-design/icons'

import { researchHome } from '../../../utils/researchPaths'

export const QuickActionsCard = ({ navigate }) => (
  <Card title="快速操作">
    <Space direction="vertical" style={{ width: '100%' }}>
      <Button block icon={<TeamOutlined />} onClick={() => navigate('/patient/pool')}>
        患者数据池
      </Button>
      <Button block icon={<ExperimentOutlined />} onClick={() => navigate(researchHome())}>
        科研项目
      </Button>
      <Button block icon={<FileTextOutlined />} onClick={() => navigate('/document/file-list')}>
        文件列表
      </Button>
    </Space>
  </Card>
)
