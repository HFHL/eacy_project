import React, { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Space, Table, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'

import { getAdminDocuments } from '../../../api/admin'
import { formatTime, statusColors } from './adminShared'

const { Text } = Typography

const formatFileSize = (value) => {
  if (!value) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export const DocumentsTab = () => {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })

  const fetch = useCallback(async (page = 1, pageSize = 20) => {
    setLoading(true)
    try {
      const res = await getAdminDocuments({ page, page_size: pageSize })
      const list = res?.data?.items || res?.data?.documents || res?.data || []
      setData(Array.isArray(list) ? list : [])
      const total = res?.data?.pagination?.total || res?.data?.total || list.length
      setPagination((prev) => ({ ...prev, current: page, pageSize, total }))
    } catch {
      /* handled */
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const columns = [
    { title: '文件名', dataIndex: 'file_name', key: 'file_name', width: 250, ellipsis: true, render: (value, row) => <Text>{value || row.original_filename || '-'}</Text> },
    { title: '类型', dataIndex: 'file_type', key: 'file_type', width: 80, render: (value) => (value ? <Tag>{value}</Tag> : '-') },
    { title: '文档类型', dataIndex: 'document_type', key: 'document_type', width: 120, render: (value) => value || '-' },
    { title: '解析', dataIndex: 'is_parsed', key: 'is_parsed', width: 80, render: (value) => (value ? <Badge status="success" text="已解析" /> : <Badge status="default" text="未解析" />) },
    { title: '大小', dataIndex: 'file_size', key: 'file_size', width: 90, render: formatFileSize },
    { title: '患者', dataIndex: 'document_patient_name', key: 'document_patient_name', width: 100, render: (value) => value || '-' },
    { title: '机构', dataIndex: 'document_organization_name', key: 'document_organization_name', width: 160, ellipsis: true, render: (value) => value || '-' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (value) => <Tag color={statusColors[value] || 'default'}>{value || '-'}</Tag> },
    { title: '上传时间', dataIndex: 'created_at', key: 'created_at', width: 170, render: formatTime },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={() => fetch(pagination.current, pagination.pageSize)} loading={loading}>刷新</Button>
        <Text type="secondary" style={{ lineHeight: '32px' }}>共 {pagination.total} 个文档</Text>
      </div>
      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1200 }}
        size="small"
        pagination={{
          ...pagination,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
          onChange: (page, pageSize) => fetch(page, pageSize),
        }}
      />
    </>
  )
}
