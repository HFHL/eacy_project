import React from 'react'
import { Card, Col, Empty, Row, Space, Tag, Typography } from 'antd'
import { CheckCircleOutlined } from '@ant-design/icons'

import { appThemeToken } from '../../../styles/themeTokens'
import { FieldValueDisplay } from './FieldValueDisplay'

const { Text } = Typography

export const SourceInfoTab = ({
  displayFieldName,
  docId,
  docInfo,
  fieldAudit,
  fieldValue,
  traceLevel,
}) => (
  <div className="field-source-modal">
    <Card size="small" title="抽取结果" style={{ marginBottom: 16 }}>
      <Row gutter={16}>
        <Col span={8}>
          <Text type="secondary">字段名称</Text>
          <div><Text strong>{displayFieldName}</Text></div>
        </Col>
        <Col span={16}>
          <Text type="secondary">抽取值</Text>
          <div style={{ marginTop: 4 }}>
            <FieldValueDisplay value={fieldValue} />
          </div>
        </Col>
      </Row>
    </Card>

    <Card size="small" title="来源文档" style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <Text type="secondary">溯源等级</Text>
        <div>
          <Tag color={traceLevel === 'untraceable' ? 'red' : traceLevel === 'task_fallback' ? 'gold' : 'green'}>
            {traceLevel}
          </Tag>
        </div>
      </div>
      {docInfo ? (
        <Row gutter={16}>
          <Col span={8}>
            <Text type="secondary">文档 ID</Text>
            <div>
              <Text code style={{ fontSize: 12 }}>{docId?.slice(0, 8)}...</Text>
            </div>
          </Col>
          <Col span={8}>
            <Text type="secondary">文档类型</Text>
            <div>
              <Tag color="blue">{docInfo.document_sub_type || docInfo.document_type || '未知'}</Tag>
            </div>
          </Col>
          <Col span={8}>
            <Text type="secondary">文件名</Text>
            <div>
              <Text ellipsis style={{ maxWidth: 150 }}>
                {docInfo.file_name || '未知'}
              </Text>
            </div>
          </Col>
        </Row>
      ) : fieldAudit.document_type ? (
        <Row gutter={16}>
          <Col span={12}>
            <Text type="secondary">文档类型</Text>
            <div>
              <Tag color="blue">{fieldAudit.document_type}</Tag>
            </div>
          </Col>
          <Col span={12}>
            <Text type="secondary">位置标识</Text>
            <div>
              <Text code>{fieldAudit.source_id || '未知'}</Text>
            </div>
          </Col>
        </Row>
      ) : (
        <Empty
          description={traceLevel === 'untraceable' ? '无可追溯文档（untraceable）' : '无来源文档信息'}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      )}
    </Card>

    {fieldAudit.confidence && (
      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <Space>
          <CheckCircleOutlined style={{ color: appThemeToken.colorSuccess }} />
          <Text type="secondary">
            置信度: {typeof fieldAudit.confidence === 'number'
              ? `${(fieldAudit.confidence * 100).toFixed(0)}%`
              : fieldAudit.confidence}
          </Text>
        </Space>
      </div>
    )}
  </div>
)
