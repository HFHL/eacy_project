import React from 'react'
import { Alert, Button, Card, Col, Descriptions, Empty, List, Modal, Row, Spin, Typography } from 'antd'
import { modalBodyPreset, modalWidthPreset } from '../../../styles/themeTokens'

const { Text } = Typography

const getConflictTypeLabel = (type) => {
  if (type === 'date_diff') return '日期差异'
  if (type === 'numeric_diff') return '数值差异'
  return '值不一致'
}

const ConflictResolveModal = ({
  conflicts,
  conflictsLoading,
  conflictResolvingId,
  onCancel,
  onResolveConflict,
  open,
  token,
}) => (
  <Modal
    title={`字段冲突解决${conflicts.length ? `（${conflicts.length}）` : ''}`}
    open={open}
    onCancel={onCancel}
    footer={null}
    width={modalWidthPreset.wide}
    styles={modalBodyPreset}
  >
    {conflictsLoading ? (
      <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
    ) : conflicts.length > 0 ? (
      <div>
        <Alert
          message={`发现 ${conflicts.length} 个字段冲突`}
          description="请逐一解决字段冲突，确保数据准确性"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <List
          dataSource={conflicts}
          renderItem={conflict => (
            <List.Item style={{ padding: '16px 0' }}>
              <div style={{ width: '100%' }}>
                <Row gutter={24}>
                  <Col span={10}>
                    <Card size="small" title="现有值" style={{ backgroundColor: token.colorWarningBg }}>
                      <div style={{ marginBottom: 8 }}>
                        <Text strong style={{ fontSize: 16 }}>{conflict.old_value || '—'}</Text>
                      </div>
                      <Descriptions size="small" column={1}>
                        <Descriptions.Item label="来源">{conflict.old_source?.document_name || '未知'}</Descriptions.Item>
                        <Descriptions.Item label="录入时间">{conflict.old_source?.recorded_at ? new Date(conflict.old_source.recorded_at).toLocaleString('zh-CN') : '—'}</Descriptions.Item>
                        <Descriptions.Item label="录入人">{conflict.old_source?.recorded_by || '未知'}</Descriptions.Item>
                      </Descriptions>
                    </Card>
                  </Col>
                  <Col span={10}>
                    <Card size="small" title="新值" style={{ backgroundColor: token.colorSuccessBg }}>
                      <div style={{ marginBottom: 8 }}>
                        <Text strong style={{ fontSize: 16 }}>{conflict.new_value || '—'}</Text>
                      </div>
                      <Descriptions size="small" column={1}>
                        <Descriptions.Item label="来源">{conflict.new_source?.document_name || '未知'}</Descriptions.Item>
                        <Descriptions.Item label="AI置信度">{conflict.new_source?.confidence || '—'}</Descriptions.Item>
                        <Descriptions.Item label="冲突类型">{getConflictTypeLabel(conflict.conflict_type)}</Descriptions.Item>
                      </Descriptions>
                    </Card>
                  </Col>
                  <Col span={4}>
                    <div style={{ textAlign: 'center' }}>
                      <Text strong>字段: {conflict.field_path}</Text>
                      <div style={{ marginTop: 8 }}>
                        <Button
                          type="primary"
                          size="small"
                          loading={conflictResolvingId === conflict.id}
                          onClick={() => onResolveConflict(conflict.id, 'adopt')}
                        >
                          采用新值
                        </Button>
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <Button
                          size="small"
                          loading={conflictResolvingId === conflict.id}
                          onClick={() => onResolveConflict(conflict.id, 'keep')}
                        >
                          保留现有值
                        </Button>
                      </div>
                    </div>
                  </Col>
                </Row>
              </div>
            </List.Item>
          )}
        />
      </div>
    ) : (
      <Empty description="暂无冲突" />
    )}
  </Modal>
)

export default ConflictResolveModal
