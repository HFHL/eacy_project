import React from 'react'
import { Button, Card, Popconfirm, Space, Tag, Typography } from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  FileTextOutlined,
  SwapOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { getFieldLabel } from './ehrFieldLabels'
import { appThemeToken } from '../../../../../styles/themeTokens'

const { Text } = Typography

const formatTime = (timeStr) => {
  if (!timeStr) return '-'
  try {
    const date = new Date(timeStr)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return timeStr
  }
}

const formatValue = (value) => {
  if (value === null || value === undefined) return <Text type="secondary">（空）</Text>
  if (typeof value === 'object') {
    return (
      <pre className="value-json">
        {JSON.stringify(value, null, 2)}
      </pre>
    )
  }
  return String(value)
}

const getStatusTag = (status) => {
  const statusMap = {
    pending: { color: 'warning', text: '待解决', icon: <WarningOutlined /> },
    resolved_adopt: { color: 'success', text: '已采用新值', icon: <CheckCircleOutlined /> },
    resolved_keep: { color: 'processing', text: '已保留旧值', icon: <CheckCircleOutlined /> },
    ignored: { color: 'default', text: '已忽略', icon: <CloseCircleOutlined /> },
  }
  const config = statusMap[status] || statusMap.pending
  return <Tag color={config.color} icon={config.icon}>{config.text}</Tag>
}

const SourceInfo = ({ source }) => {
  if (!source) return <Text type="secondary">未知来源</Text>

  return (
    <div className="source-info">
      {source.document_name && (
        <div className="source-item">
          <FileTextOutlined style={{ marginRight: 4 }} />
          <Text ellipsis={{ tooltip: source.document_name }}>
            {source.document_name}
          </Text>
        </div>
      )}
      {source.created_at && (
        <div className="source-item">
          <ClockCircleOutlined style={{ marginRight: 4 }} />
          <Text type="secondary">{formatTime(source.created_at)}</Text>
        </div>
      )}
      {source.operator_name && (
        <div className="source-item">
          <UserOutlined style={{ marginRight: 4 }} />
          <Text type="secondary">{source.operator_name}</Text>
        </div>
      )}
    </div>
  )
}

const ConflictCard = ({ conflict, onResolve, resolving }) => {
  const isPending = conflict.status === 'pending'

  return (
    <Card
      key={conflict.id}
      className={`conflict-card ${isPending ? 'conflict-pending' : 'conflict-resolved'}`}
      size="small"
    >
      <div className="conflict-header">
        <div className="conflict-field">
          <Text strong>{conflict.field_label || getFieldLabel(conflict.field_name) || conflict.field_name}</Text>
          {conflict.record_index !== null && conflict.record_index !== undefined && (
            <Tag color="blue" style={{ marginLeft: 8 }}>索引 {conflict.record_index}</Tag>
          )}
        </div>
        <div className="conflict-status">
          {getStatusTag(conflict.status)}
        </div>
      </div>

      <div className="conflict-comparison">
        <div className="value-box existing-value">
          <div className="value-header">
            <Tag color="blue">现有值</Tag>
          </div>
          <div className="value-content">
            {formatValue(conflict.existing_value)}
          </div>
          <div className="value-source">
            <SourceInfo source={conflict.existing_value_source} />
          </div>
        </div>

        <div className="comparison-arrow">
          <SwapOutlined style={{ fontSize: 20, color: appThemeToken.colorTextTertiary }} />
        </div>

        <div className="value-box new-value">
          <div className="value-header">
            <Tag color="orange">新值</Tag>
          </div>
          <div className="value-content">
            {formatValue(conflict.new_value)}
          </div>
          <div className="value-source">
            <SourceInfo source={conflict.new_value_source} />
          </div>
        </div>
      </div>

      {isPending && (
        <div className="conflict-actions">
          <Space>
            <Popconfirm
              title="确认采用新值？"
              description="这将用新值替换现有值"
              onConfirm={() => onResolve(conflict.id, 'adopt')}
              okText="确认"
              cancelText="取消"
            >
              <Button type="primary" size="small" icon={<CheckCircleOutlined />} loading={resolving}>
                采用新值
              </Button>
            </Popconfirm>
            <Popconfirm
              title="确认保留现有值？"
              description="这将忽略新值，保持现有数据不变"
              onConfirm={() => onResolve(conflict.id, 'keep')}
              okText="确认"
              cancelText="取消"
            >
              <Button size="small" icon={<CloseCircleOutlined />} loading={resolving}>
                保留现有值
              </Button>
            </Popconfirm>
          </Space>
        </div>
      )}

      {!isPending && conflict.resolved_at && (
        <div className="resolve-info">
          <Text type="secondary">
            {conflict.resolved_by_name || '系统'} 于 {formatTime(conflict.resolved_at)} 解决
            {conflict.resolution_remark && ` - ${conflict.resolution_remark}`}
          </Text>
        </div>
      )}
    </Card>
  )
}

export default ConflictCard
