import React from 'react'
import { Alert, Card, Col, List, Progress, Row, Space, Tag, Typography } from 'antd'

const { Text } = Typography

const EhrFolderBatchProgress = ({ batch, isTerminalBatchStatus }) => {
  if (!batch) return null

  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space>
              <Text strong>电子病历夹更新</Text>
              <Tag color={isTerminalBatchStatus(batch.status) ? (batch.failed_items ? 'orange' : 'green') : 'blue'}>
                {batch.status || 'queued'}
              </Tag>
            </Space>
          </Col>
          <Col>
            <Text type="secondary">
              {(batch.succeeded_items || 0)}/{(batch.total_items || 0)}
              {batch.failed_items ? ` · 失败 ${batch.failed_items}` : ''}
            </Text>
          </Col>
        </Row>
        <Progress
          percent={Math.min(100, Math.max(0, Number(batch.progress || 0)))}
          status={batch.failed_items ? 'exception' : (isTerminalBatchStatus(batch.status) ? 'success' : 'active')}
        />
        <Text type="secondary">{batch.message || '后台正在更新电子病历夹'}</Text>
        {Array.isArray(batch.items) && batch.items.length > 0 ? (
          <List
            size="small"
            dataSource={batch.items.slice(0, 5)}
            renderItem={(item) => (
              <List.Item>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Text ellipsis style={{ maxWidth: 420 }}>
                    {item.target_form_key || item.document_id || item.extraction_job_id}
                  </Text>
                  <Space>
                    <Text type="secondary">{item.stage_label || item.status}</Text>
                    <Progress size="small" percent={Math.min(100, Math.max(0, Number(item.progress || 0)))} style={{ width: 120 }} />
                  </Space>
                </Space>
                {item.error_message ? <Alert type="error" showIcon message={item.error_message} style={{ marginTop: 8 }} /> : null}
              </List.Item>
            )}
          />
        ) : null}
      </Space>
    </Card>
  )
}

export default EhrFolderBatchProgress
