import React from 'react'
import { Button, Col, Divider, Progress, Row, Space, Tag, Typography } from 'antd'
import { CloseOutlined } from '@ant-design/icons'

const { Text } = Typography

const getProgressTitle = (status) => {
  if (status === 'submitting') return '正在提交抽取任务'
  if (status === 'cancelled') return 'CRF 数据抽取已暂停'
  if (status === 'timeout') return 'CRF 数据抽取超时'
  if (status === 'failed') return 'CRF 数据抽取失败'
  if (status === 'completed') return 'CRF 数据抽取完成'
  if (status === 'completed_with_errors') return 'CRF 数据抽取完成（有错误）'
  return 'CRF 数据抽取中'
}

const getProgressStatus = (status) => {
  if (status === 'submitting') return 'active'
  if (status === 'cancelled' || status === 'failed' || status === 'timeout') return 'exception'
  if (status === 'completed' || status === 'completed_with_errors') return 'success'
  return 'active'
}

const getStepTagColor = (status) => {
  if (status === 'submitting') return 'processing'
  if (status === 'cancelled') return 'warning'
  if (status === 'failed' || status === 'timeout') return 'error'
  if (status === 'completed') return 'success'
  if (status === 'completed_with_errors') return 'warning'
  return 'processing'
}

const getStrokeColor = (status, token) => {
  if (status === 'cancelled') return token.colorWarning
  if (status === 'failed' || status === 'timeout') return token.colorError
  return {
    '0%': token.colorPrimary,
    '100%': token.colorSuccess,
  }
}

const ExtractionProgressCard = ({
  visible,
  extractionProgress,
  extractionTasks,
  token,
  onDismiss,
  onShowErrors,
}) => {
  if (!visible || !extractionProgress) return null

  return (
    <div style={{
      marginBottom: 16,
      border: `1px solid ${extractionProgress.status === 'submitting' ? token.colorPrimaryBorder : token.colorBorder}`,
      borderRadius: 12,
      padding: '14px 16px',
      paddingRight: 44,
      background: extractionProgress.status === 'submitting' ? token.colorPrimaryBg : token.colorBgContainer,
      position: 'relative',
    }}>
      <Button
        type="text"
        size="small"
        icon={<CloseOutlined />}
        aria-label="关闭抽取进度提示"
        onClick={onDismiss}
        style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, color: token.colorTextSecondary }}
      />
      <Row gutter={16} align="middle">
        <Col flex="auto">
          <div style={{ marginBottom: 8 }}>
            <Space wrap>
              <Text strong>{getProgressTitle(extractionProgress.status)}</Text>
              {extractionProgress.scopeLabel ? <Tag>{extractionProgress.scopeLabel}</Tag> : null}
              {extractionProgress.modeLabel ? (
                <Tag color={extractionProgress.mode === 'full' ? 'red' : 'blue'}>{extractionProgress.modeLabel}</Tag>
              ) : null}
              <Tag color={getStepTagColor(extractionProgress.status)}>
                {extractionProgress.current_step || '处理中'}
              </Tag>
            </Space>
          </div>
          <Progress
            percent={extractionProgress.progress || 0}
            status={getProgressStatus(extractionProgress.status)}
            strokeColor={getStrokeColor(extractionProgress.status, token)}
          />
          <div style={{ marginTop: 8 }}>
            <Space split={<Divider type="vertical" />} wrap>
              {(extractionProgress.active_task_count || 0) > 1 ? (
                <Text type="secondary">并行任务: {extractionProgress.active_task_count}</Text>
              ) : null}
              <Text type="secondary">
                子任务: {extractionProgress.processed_patients || 0}/{extractionProgress.total_patients || 0}
              </Text>
              {extractionProgress.submitted_jobs != null ? (
                <Text type="secondary">已入队: {extractionProgress.submitted_jobs}</Text>
              ) : null}
              <Text style={{ color: token.colorSuccess }}>
                成功: {extractionProgress.success_count || 0}
              </Text>
              {extractionProgress.error_count > 0 && (
                <Text style={{ color: token.colorError }}>
                  失败: {extractionProgress.error_count}
                </Text>
              )}
              {Array.isArray(extractionProgress.errors) && extractionProgress.errors.length > 0 && (
                <Button size="small" type="link" onClick={onShowErrors} style={{ padding: 0 }}>
                  查看失败原因
                </Button>
              )}
            </Space>
          </div>
          {extractionTasks.length > 1 ? (
            <div style={{ marginTop: 10 }}>
              {extractionTasks.map((task) => (
                <div key={task.taskId} style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 4 }}>
                  {task.scopeLabel} · {task.modeLabel} · {task.progress || 0}% · {task.current_step || task.phase}
                </div>
              ))}
            </div>
          ) : null}
        </Col>
      </Row>
    </div>
  )
}

export default ExtractionProgressCard
