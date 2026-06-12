import React from 'react'
import { Button, Divider, Empty, Modal, Space, Spin, Tag, Typography } from 'antd'
import { CodeOutlined, CopyOutlined } from '@ant-design/icons'

const { Text } = Typography

const ExtractionResultModal = ({
  open,
  loading,
  data,
  docName,
  onCancel,
  onCopy,
}) => (
  <Modal
    title={
      <Space>
        <CodeOutlined style={{ color: '#f59e0b' }} />
        <Text>AI 抽取结果 - {docName}</Text>
      </Space>
    }
    open={open}
    onCancel={onCancel}
    width={900}
    footer={[
      <Button key="copy" icon={<CopyOutlined />} onClick={onCopy}>
        复制 JSON
      </Button>,
      <Button key="close" onClick={onCancel}>
        关闭
      </Button>
    ]}
  >
    {loading ? (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin tip="加载抽取结果..." />
      </div>
    ) : data ? (
      <div>
        <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 8 }}>
          <Space split={<Divider type="vertical" />}>
            <span>
              <Text type="secondary">抽取时间：</Text>
              <Text>{data.created_at ? new Date(data.created_at).toLocaleString() : '--'}</Text>
            </span>
            <span>
              <Text type="secondary">字段数：</Text>
              <Text strong style={{ color: '#1677ff' }}>{data.fields_count || Object.keys(data.extracted_ehr_data || {}).length}</Text>
            </span>
            <span>
              <Text type="secondary">已合并：</Text>
              <Tag color={data.is_merged ? 'green' : 'orange'}>
                {data.is_merged ? '是' : '否'}
              </Tag>
            </span>
            {data.conflict_count > 0 && (
              <span>
                <Text type="secondary">冲突：</Text>
                <Tag color="red">{data.conflict_count}</Tag>
              </span>
            )}
          </Space>
        </div>

        <div style={{
          background: '#1e1e1e',
          borderRadius: 8,
          padding: 16,
          maxHeight: 500,
          overflow: 'auto',
          fontFamily: 'Consolas, Monaco, "Courier New", monospace'
        }}>
          <pre style={{
            margin: 0,
            color: '#d4d4d4',
            fontSize: 13,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all'
          }}>
            {JSON.stringify(data.extracted_ehr_data, null, 2)}
          </pre>
        </div>
      </div>
    ) : (
      <Empty description="暂无抽取结果" />
    )}
  </Modal>
)

export default ExtractionResultModal
