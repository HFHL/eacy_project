/**
 * 冲突详情弹窗组件
 * 展示抽取记录产生的冲突，支持采用新值或保留现有值
 */
import React, { useState, useEffect } from 'react'
import {
  Modal,
  Button,
  Space,
  Typography,
  message,
  Spin,
  Empty
} from 'antd'
import {
  CheckCircleOutlined,
  WarningOutlined
} from '@ant-design/icons'
import { getConflictsByExtractionId, resolveConflict } from '../../../../../api/patient'
import { appThemeToken } from '../../../../../styles/themeTokens'
import ConflictCard from './ConflictCard'
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

  const pendingConflicts = conflicts.filter(conflict => conflict.status === 'pending')
  const resolvedConflicts = conflicts.filter(conflict => conflict.status !== 'pending')

  return (
    <Modal
      title={
        <div className="conflict-modal-title">
          <WarningOutlined style={{ color: appThemeToken.colorWarning, marginRight: 8 }} />
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
              待解决 <Text strong style={{ color: appThemeToken.colorWarning }}>{statistics.pending}</Text> 个
            </Text>
            <Text type="success">
              已解决 <Text strong style={{ color: appThemeToken.colorSuccess }}>{statistics.resolved}</Text> 个
            </Text>
          </Space>
        </div>

        {/* 冲突列表 */}
        {conflicts.length === 0 ? (
          <Empty description="暂无冲突记录" />
        ) : (
          <div className="conflict-list">
            {/* 待解决的冲突 */}
            {pendingConflicts.length > 0 && (
              <div className="conflict-section">
                <Title level={5} style={{ color: appThemeToken.colorWarning }}>
                  <WarningOutlined style={{ marginRight: 8 }} />
                  待解决
                </Title>
                {pendingConflicts.map(conflict => (
                  <ConflictCard
                    key={conflict.id}
                    conflict={conflict}
                    onResolve={handleResolve}
                    resolving={resolving[conflict.id]}
                  />
                ))}
              </div>
            )}

            {/* 已解决的冲突 */}
            {resolvedConflicts.length > 0 && (
              <div className="conflict-section">
                <Title level={5} style={{ color: appThemeToken.colorSuccess }}>
                  <CheckCircleOutlined style={{ marginRight: 8 }} />
                  已解决
                </Title>
                {resolvedConflicts.map(conflict => (
                  <ConflictCard
                    key={conflict.id}
                    conflict={conflict}
                    onResolve={handleResolve}
                    resolving={resolving[conflict.id]}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </Spin>
    </Modal>
  )
}

export default ConflictDetailModal
