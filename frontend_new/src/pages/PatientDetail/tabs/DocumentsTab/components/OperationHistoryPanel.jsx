import React from 'react'
import { Button, Empty, Space, Spin, Tag, Typography } from 'antd'
import {
  ClockCircleOutlined,
  EditOutlined,
  ReloadOutlined,
  RobotOutlined,
  SolutionOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { appThemeToken } from '../../../../../styles/themeTokens'

const { Text } = Typography

const getOperationTypeConfig = (type) => {
  const configs = {
    upload: {
      icon: <UploadOutlined />,
      color: appThemeToken.colorPrimary,
      bgColor: appThemeToken.colorPrimaryBg,
      label: '上传'
    },
    extraction: {
      icon: <RobotOutlined />,
      color: appThemeToken.colorInfo,
      bgColor: appThemeToken.colorInfoBg || appThemeToken.colorPrimaryBg,
      label: '抽取'
    },
    field_change: {
      icon: <EditOutlined />,
      color: appThemeToken.colorSuccess,
      bgColor: 'rgba(82, 196, 26, 0.1)',
      label: '变更'
    },
    conflict_resolve: {
      icon: <SolutionOutlined />,
      color: appThemeToken.colorWarning,
      bgColor: 'rgba(250, 173, 20, 0.1)',
      label: '解决'
    }
  }
  return configs[type] || configs.upload
}

const formatOperationTime = (isoString) => {
  if (!isoString) return '未知时间'
  const date = new Date(isoString)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

const OperationHistoryPanel = ({
  loading,
  history,
  onRefresh,
}) => {
  if (loading) {
    return (
      <div className="operation-history">
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin />
          <div style={{ marginTop: 8 }}>
            <Text type="secondary">正在加载操作历史...</Text>
          </div>
        </div>
      </div>
    )
  }

  if (!history?.history || history.history.length === 0) {
    return (
      <div className="operation-history">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无操作历史" />
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button type="primary" icon={<ReloadOutlined />} onClick={onRefresh}>
            刷新
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="operation-history">
      <div className="history-stats">
        <Space size="large">
          <Text>
            共 <Text strong>{history.history.length}</Text> 条记录
          </Text>
          {history.extraction_count > 0 && (
            <Text type="secondary">
              <RobotOutlined /> 抽取 {history.extraction_count} 次
            </Text>
          )}
          {history.field_change_count > 0 && (
            <Text type="secondary">
              <EditOutlined /> 变更 {history.field_change_count} 次
            </Text>
          )}
          {history.conflict_resolve_count > 0 && (
            <Text type="secondary">
              <SolutionOutlined /> 解决冲突 {history.conflict_resolve_count} 次
            </Text>
          )}
        </Space>
        <Button type="text" size="small" icon={<ReloadOutlined />} onClick={onRefresh}>
          刷新
        </Button>
      </div>

      <div className="history-timeline">
        {history.history.map((item, index) => {
          const config = getOperationTypeConfig(item.type)
          return (
            <div key={item.id || index} className="history-timeline-item">
              <div className="timeline-icon" style={{ background: config.bgColor, color: config.color }}>
                {config.icon}
              </div>
              <div className="timeline-content">
                <div className="timeline-header">
                  <Text strong>{item.title}</Text>
                  <Tag color={config.color} style={{ marginLeft: 8 }}>{config.label}</Tag>
                </div>
                {item.description && (
                  <div className="timeline-description">
                    <Text type="secondary">{item.description}</Text>
                  </div>
                )}
                <div className="timeline-meta">
                  <Space size="middle">
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      <ClockCircleOutlined style={{ marginRight: 4 }} />
                      {formatOperationTime(item.created_at)}
                    </Text>
                    {item.operator_name && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {item.operator_type === 'ai' ? <RobotOutlined /> : <EditOutlined />}
                        <span style={{ marginLeft: 4 }}>{item.operator_name}</span>
                      </Text>
                    )}
                  </Space>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default OperationHistoryPanel
