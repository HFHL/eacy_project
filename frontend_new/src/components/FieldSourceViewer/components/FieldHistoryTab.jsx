import React from 'react'
import { Card, Col, Divider, Empty, Row, Space, Tag, Timeline, Typography } from 'antd'

import {
  formatLogValue,
  getChangeTypeColor,
  getChangeTypeLabel,
} from '../utils/fieldSourceFormatters'

const { Text } = Typography

export const FieldHistoryTab = ({
  audit,
  changeLogs,
  displayFieldName,
  fieldName,
}) => {
  const extractedAt = audit?._extracted_at
  const extractionMode = audit?._extraction_mode
  const stats = audit?._stats
  const editedAt = audit?._edited_at
  const editedBy = audit?._edited_by
  const taskResults = Array.isArray(audit?._task_results) ? audit._task_results : []
  const logs = Array.isArray(changeLogs) ? changeLogs : []

  const matchedTasks = taskResults
    .filter((taskResult) => (
      taskResult
      && taskResult.audit
      && taskResult.audit.fields
      && (taskResult.audit.fields[fieldName] || taskResult.audit.fields[displayFieldName])
    ))
    .map((taskResult) => taskResult.task_name)

  return (
    <div>
      <Card size="small" title="概览" style={{ marginBottom: 12 }}>
        <Row gutter={16}>
          <Col span={12}>
            <Text type="secondary">最近抽取</Text>
            <div><Text>{extractedAt ? new Date(extractedAt).toLocaleString() : '—'}</Text></div>
          </Col>
          <Col span={12}>
            <Text type="secondary">最近编辑</Text>
            <div>
              <Text>{editedAt ? new Date(editedAt).toLocaleString() : '—'}</Text>
              {editedBy ? <Text type="secondary">（{String(editedBy).slice(0, 8)}…）</Text> : null}
            </div>
          </Col>
        </Row>
        <Divider style={{ margin: '12px 0' }} />
        <Row gutter={16}>
          <Col span={12}>
            <Text type="secondary">抽取模式</Text>
            <div><Tag color="blue">{extractionMode || '—'}</Tag></div>
          </Col>
          <Col span={12}>
            <Text type="secondary">字段命中任务</Text>
            <div>
              {matchedTasks.length ? (
                <Space wrap>
                  {matchedTasks.slice(0, 4).map((taskName) => <Tag key={taskName}>{taskName}</Tag>)}
                  {matchedTasks.length > 4 ? <Tag>+{matchedTasks.length - 4}</Tag> : null}
                </Space>
              ) : (
                <Text type="secondary">—</Text>
              )}
            </div>
          </Col>
        </Row>
        {stats ? (
          <>
            <Divider style={{ margin: '12px 0' }} />
            <Row gutter={16}>
              <Col span={8}>
                <Text type="secondary">任务</Text>
                <div><Text strong>{stats.completed_tasks ?? '—'}/{stats.total_tasks ?? '—'}</Text></div>
              </Col>
              <Col span={8}>
                <Text type="secondary">字段</Text>
                <div><Text strong>{stats.filled_fields ?? '—'}/{stats.total_fields ?? '—'}</Text></div>
              </Col>
              <Col span={8}>
                <Text type="secondary">覆盖率</Text>
                <div>
                  <Text strong>
                    {typeof stats.coverage === 'number'
                      ? `${Math.round(stats.coverage * 100)}%`
                      : (stats.coverage ?? '—')}
                  </Text>
                </div>
              </Col>
            </Row>
          </>
        ) : null}
      </Card>

      {logs.length > 0 ? (
        <Card size="small" title={`修改历史（${logs.length}）`}>
          <Timeline
            items={logs.map((log, idx) => ({
              color: getChangeTypeColor(log.change_type),
              children: (
                <div key={idx}>
                  <div style={{ marginBottom: 4 }}>
                    <Tag color={getChangeTypeColor(log.change_type)} style={{ marginRight: 8 }}>
                      {getChangeTypeLabel(log.change_type)}
                    </Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {log.created_at ? new Date(log.created_at).toLocaleString() : ''}
                    </Text>
                    {log.operator_name ? (
                      <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                        {log.operator_name}
                      </Text>
                    ) : null}
                  </div>
                  {log.old_value != null || log.new_value != null ? (
                    <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.65)', marginBottom: 4 }}>
                      <Text type="secondary">新值: </Text>
                      <Text code style={{ wordBreak: 'break-all' }}>
                        {formatLogValue(log.new_value)}
                      </Text>
                    </div>
                  ) : null}
                  {log.remark ? (
                    <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                      备注: {log.remark}
                    </div>
                  ) : null}
                </div>
              ),
            }))}
          />
        </Card>
      ) : (
        <Card size="small" title="时间线">
          <Timeline
            items={[
              editedAt ? {
                color: 'blue',
                children: (
                  <div>
                    <Text strong>手工编辑</Text>
                    <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                      {new Date(editedAt).toLocaleString()} {editedBy ? `· ${String(editedBy).slice(0, 8)}…` : ''}
                    </div>
                  </div>
                ),
              } : null,
              extractedAt ? {
                color: 'green',
                children: (
                  <div>
                    <Text strong>CRF 抽取</Text>
                    <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                      {new Date(extractedAt).toLocaleString()} {extractionMode ? `· ${extractionMode}` : ''}
                    </div>
                  </div>
                ),
              } : null,
            ].filter(Boolean)}
          />
          {!editedAt && !extractedAt ? (
            <Empty description="暂无历史记录（未抽取/未编辑）" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : null}
        </Card>
      )}
    </div>
  )
}
