/**
 * 冲突详情弹窗组件
 * 展示抽取记录产生的冲突，支持采用新值或保留现有值
 */
import React, { useState, useEffect } from 'react'
import { 
  Modal, 
  Table, 
  Button, 
  Space, 
  Typography, 
  Tag,
  message,
  Spin,
  Empty,
  Tooltip,
  Card,
  Descriptions,
  Popconfirm,
  Alert
} from 'antd'
import { 
  CheckCircleOutlined, 
  CloseCircleOutlined,
  WarningOutlined,
  SwapOutlined,
  FileTextOutlined,
  ClockCircleOutlined,
  UserOutlined
} from '@ant-design/icons'
import { getConflictsByExtractionId, resolveConflict } from '../../../../../api/patient'
import { getFieldLabel } from './ehrFieldLabels'
import './ConflictDetailModal.css'

const { Text, Title } = Typography

const ConflictDetailModal = ({ 
  visible, 
  extractionId,
  onClose,
  onResolve // 冲突解决后的回调
}) => {
  const [loading, setLoading] = useState(false)
  const [conflicts, setConflicts] = useState([])
  const [statistics, setStatistics] = useState({ total: 0, pending: 0, resolved: 0 })
  const [resolving, setResolving] = useState({}) // 记录正在解决的冲突

  // 获取冲突数据
  const fetchConflicts = async () => {
    if (!extractionId) return
    
    setLoading(true)
    try {
      const response = await getConflictsByExtractionId(extractionId)
      // request.js 响应拦截器已经返回 response.data，所以直接使用 response
      if (response?.success) {
        const data = response.data
        setConflicts(data.conflicts || [])
        setStatistics({
          total: data.total || 0,
          pending: data.pending_count || 0,
          resolved: data.resolved_count || 0
        })
      } else {
        message.error(response?.message || '获取冲突详情失败')
      }
    } catch (error) {
      console.error('获取冲突详情失败:', error)
      message.error('获取冲突详情失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (visible && extractionId) {
      fetchConflicts()
    }
  }, [visible, extractionId])

  // 解决冲突
  const handleResolve = async (conflictId, resolution) => {
    setResolving(prev => ({ ...prev, [conflictId]: true }))
    try {
      const response = await resolveConflict(conflictId, { resolution })
      // request.js 响应拦截器已经返回 response.data，所以直接使用 response
      if (response?.success) {
        message.success(response.message || '冲突已解决')
        // 刷新冲突列表
        await fetchConflicts()
        // 通知父组件
        if (onResolve) {
          onResolve()
        }
      } else {
        message.error(response?.message || '解决冲突失败')
      }
    } catch (error) {
      console.error('解决冲突失败:', error)
      // 错误已在 request.js 中处理，这里不需要重复显示
    } finally {
      setResolving(prev => ({ ...prev, [conflictId]: false }))
    }
  }

  // 格式化时间
  const formatTime = (timeStr) => {
    if (!timeStr) return '-'
    try {
      const date = new Date(timeStr)
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return timeStr
    }
  }

  // 格式化值用于展示
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

  // 获取状态标签
  const getStatusTag = (status) => {
    const statusMap = {
      pending: { color: 'warning', text: '待解决', icon: <WarningOutlined /> },
      resolved_adopt: { color: 'success', text: '已采用新值', icon: <CheckCircleOutlined /> },
      resolved_keep: { color: 'processing', text: '已保留旧值', icon: <CheckCircleOutlined /> },
      ignored: { color: 'default', text: '已忽略', icon: <CloseCircleOutlined /> }
    }
    const config = statusMap[status] || statusMap.pending
    return <Tag color={config.color} icon={config.icon}>{config.text}</Tag>
  }

  // 渲染来源信息
  const renderSourceInfo = (source, type) => {
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

  // 渲染单个冲突卡片
  const renderConflictCard = (conflict) => {
    const isPending = conflict.status === 'pending'
    const isResolving = resolving[conflict.id]
    
    return (
      <Card 
        key={conflict.id} 
        className={`conflict-card ${isPending ? 'conflict-pending' : 'conflict-resolved'}`}
        size="small"
      >
        {/* 头部：字段名 + 状态 */}
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

        {/* 值对比 */}
        <div className="conflict-comparison">
          {/* 现有值 */}
          <div className="value-box existing-value">
            <div className="value-header">
              <Tag color="blue">现有值</Tag>
            </div>
            <div className="value-content">
              {formatValue(conflict.existing_value)}
            </div>
            <div className="value-source">
              {renderSourceInfo(conflict.existing_value_source, 'existing')}
            </div>
          </div>

          {/* 箭头 */}
          <div className="comparison-arrow">
            <SwapOutlined style={{ fontSize: 20, color: '#8c8c8c' }} />
          </div>

          {/* 新值 */}
          <div className="value-box new-value">
            <div className="value-header">
              <Tag color="orange">新值</Tag>
            </div>
            <div className="value-content">
              {formatValue(conflict.new_value)}
            </div>
            <div className="value-source">
              {renderSourceInfo(conflict.new_value_source, 'new')}
            </div>
          </div>
        </div>

        {/* 操作按钮（仅待解决状态显示） */}
        {isPending && (
          <div className="conflict-actions">
            <Space>
              <Popconfirm
                title="确认采用新值？"
                description="这将用新值替换现有值"
                onConfirm={() => handleResolve(conflict.id, 'adopt')}
                okText="确认"
                cancelText="取消"
              >
                <Button 
                  type="primary" 
                  size="small"
                  icon={<CheckCircleOutlined />}
                  loading={isResolving}
                >
                  采用新值
                </Button>
              </Popconfirm>
              
              <Popconfirm
                title="确认保留现有值？"
                description="这将忽略新值，保持现有数据不变"
                onConfirm={() => handleResolve(conflict.id, 'keep')}
                okText="确认"
                cancelText="取消"
              >
                <Button 
                  size="small"
                  icon={<CloseCircleOutlined />}
                  loading={isResolving}
                >
                  保留现有值
                </Button>
              </Popconfirm>
            </Space>
          </div>
        )}

        {/* 已解决信息 */}
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

  return (
    <Modal
      title={
        <div className="conflict-modal-title">
          <WarningOutlined style={{ color: '#faad14', marginRight: 8 }} />
          冲突详情
        </div>
      }
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
          关闭
        </Button>
      ]}
      width={900}
      className="conflict-detail-modal"
      destroyOnHidden
    >
      <Spin spinning={loading}>
        {/* 统计信息 */}
        <div className="conflict-statistics">
          <Space size="large">
            <Text>
              共 <Text strong>{statistics.total}</Text> 个冲突
            </Text>
            <Text type="warning">
              待解决 <Text strong style={{ color: '#faad14' }}>{statistics.pending}</Text> 个
            </Text>
            <Text type="success">
              已解决 <Text strong style={{ color: '#52c41a' }}>{statistics.resolved}</Text> 个
            </Text>
          </Space>
        </div>

        {/* 冲突列表 */}
        {conflicts.length === 0 ? (
          <Empty description="暂无冲突记录" />
        ) : (
          <div className="conflict-list">
            {/* 待解决的冲突 */}
            {conflicts.filter(c => c.status === 'pending').length > 0 && (
              <div className="conflict-section">
                <Title level={5} style={{ color: '#faad14' }}>
                  <WarningOutlined style={{ marginRight: 8 }} />
                  待解决
                </Title>
                {conflicts.filter(c => c.status === 'pending').map(renderConflictCard)}
              </div>
            )}
            
            {/* 已解决的冲突 */}
            {conflicts.filter(c => c.status !== 'pending').length > 0 && (
              <div className="conflict-section">
                <Title level={5} style={{ color: '#52c41a' }}>
                  <CheckCircleOutlined style={{ marginRight: 8 }} />
                  已解决
                </Title>
                {conflicts.filter(c => c.status !== 'pending').map(renderConflictCard)}
              </div>
            )}
          </div>
        )}
      </Spin>
    </Modal>
  )
}

export default ConflictDetailModal

