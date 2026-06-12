import React from 'react'
import { Button, Card, Empty, Space, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { appThemeToken } from '../../../styles/themeTokens'

const { Text } = Typography

const PatientEmptyState = ({ onCreate }) => (
  <div className="page-container fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70vh' }}>
    <Card style={{ width: 560, borderRadius: 12 }}>
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={(
          <Space direction="vertical" size={4} style={{ textAlign: 'center' }}>
            <Text strong style={{ fontSize: 16 }}>暂无患者数据</Text>
            <Text type="secondary">请先创建首位患者后开始浏览详情</Text>
          </Space>
        )}
      >
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={onCreate}
          style={{ backgroundColor: appThemeToken.colorPrimary, borderColor: appThemeToken.colorPrimary }}
        >
          新建患者
        </Button>
      </Empty>
    </Card>
  </div>
)

export default PatientEmptyState
