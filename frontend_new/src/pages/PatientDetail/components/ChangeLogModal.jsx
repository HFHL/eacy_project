import React from 'react'
import { Button, Modal, Select, Space, Table, Tag, Typography } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import { modalBodyPreset, modalWidthPreset } from '../../../styles/themeTokens'

const { Text } = Typography

const ChangeLogModal = ({
  changeLogs,
  onCancel,
  onConfirmChange,
  onRevertChange,
  open,
}) => (
  <Modal
    title="患者数据变更日志"
    open={open}
    onCancel={onCancel}
    footer={[
      <Button key="close" onClick={onCancel}>
        关闭
      </Button>,
      <Button key="export" icon={<DownloadOutlined />}>
        导出日志
      </Button>,
      <Button key="batch" type="primary">
        批量确认
      </Button>,
    ]}
    width={modalWidthPreset.wide}
    styles={modalBodyPreset}
  >
    <div style={{ marginBottom: 16 }}>
      <Space>
        <Select placeholder="变更类型" style={{ width: 120 }} allowClear>
          <Select.Option value="field">字段变更</Select.Option>
          <Select.Option value="document">文档操作</Select.Option>
          <Select.Option value="conflict">冲突解决</Select.Option>
        </Select>
        <Select placeholder="时间范围" style={{ width: 120 }} allowClear>
          <Select.Option value="today">今天</Select.Option>
          <Select.Option value="week">最近7天</Select.Option>
          <Select.Option value="month">最近30天</Select.Option>
        </Select>
        <Select placeholder="操作来源" style={{ width: 120 }} allowClear>
          <Select.Option value="ai">AI抽取</Select.Option>
          <Select.Option value="manual">手动编辑</Select.Option>
          <Select.Option value="conflict">冲突解决</Select.Option>
        </Select>
      </Space>
    </div>

    <Table
      dataSource={changeLogs}
      columns={[
        {
          title: '时间',
          dataIndex: 'timestamp',
          key: 'timestamp',
          width: 140,
          render: (time) => <Text style={{ fontSize: 12 }}>{time}</Text>,
        },
        {
          title: '字段',
          dataIndex: 'field',
          key: 'field',
          width: 100,
        },
        {
          title: '来源',
          dataIndex: 'source',
          key: 'source',
          width: 80,
        },
        {
          title: '操作人',
          dataIndex: 'operator',
          key: 'operator',
          width: 80,
        },
        {
          title: '变更内容',
          dataIndex: 'changeContent',
          key: 'changeContent',
          width: 150,
        },
        {
          title: '状态',
          dataIndex: 'status',
          key: 'status',
          width: 80,
          render: (status) => (
            <Tag color={status === 'confirmed' ? 'green' : 'orange'}>
              {status === 'confirmed' ? '已确认' : '待确认'}
            </Tag>
          ),
        },
        {
          title: '操作',
          key: 'action',
          width: 120,
          render: (_, record) => (
            <Space size="small">
              {record.status === 'pending' && (
                <Button type="link" size="small" onClick={() => onConfirmChange(record.id)}>
                  确认
                </Button>
              )}
              <Button type="link" size="small" onClick={() => onRevertChange(record.id)}>
                撤销
              </Button>
              {record.document && (
                <Button type="link" size="small">
                  查看文档
                </Button>
              )}
            </Space>
          ),
        },
      ]}
      pagination={false}
      size="small"
    />
  </Modal>
)

export default ChangeLogModal
