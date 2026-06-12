import React, { useCallback, useEffect, useState } from 'react'
import { Button, Space, Table, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'

import { getAdminProjects } from '../../../api/admin'
import { formatTime, statusColors } from './adminShared'

const { Text } = Typography

export const ProjectsTab = () => {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getAdminProjects()
      const list = res?.data?.projects || res?.data?.items || res?.data || []
      setData(Array.isArray(list) ? list : [])
    } catch {
      /* handled */
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const columns = [
    { title: '项目名称', dataIndex: 'project_name', key: 'project_name', width: 200, ellipsis: true, render: (value, row) => <Text strong>{value || row.name || '-'}</Text> },
    { title: '描述', dataIndex: 'description', key: 'description', width: 250, ellipsis: true, render: (value) => value || '-' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (value) => <Tag color={statusColors[value] || 'blue'}>{value || '-'}</Tag> },
    { title: '患者数', dataIndex: 'patient_count', key: 'patient_count', width: 80, render: (value) => value ?? '-' },
    { title: '模板', dataIndex: 'template_name', key: 'template_name', width: 150, ellipsis: true, render: (value) => value || '-' },
    { title: '负责人', dataIndex: 'pi_name', key: 'pi_name', width: 120, render: (value, row) => value || row.created_by_name || '-' },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 170, render: formatTime },
    { title: 'ID', dataIndex: 'id', key: 'id', width: 120, ellipsis: true, render: (value) => <Text copyable={{ text: value }} type="secondary" style={{ fontSize: 12 }}>{value?.slice(0, 8)}…</Text> },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={fetch} loading={loading}>刷新</Button>
        <Text type="secondary" style={{ lineHeight: '32px' }}>共 {data.length} 个项目</Text>
      </div>
      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1200 }}
        size="small"
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
      />
    </>
  )
}
