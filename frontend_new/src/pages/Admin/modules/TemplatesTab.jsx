import React, { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Space, Switch, Table, Tag, Tooltip, Typography, message } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'

import { getAdminTemplates, updateAdminTemplateVisibility } from '../../../api/admin'
import { formatTime } from './adminShared'

const { Text } = Typography

const CoverageTag = ({ coverage }) => {
  if (!coverage || typeof coverage !== 'object') return '-'
  const total = Number(coverage.total_forms || 0)
  const matched = Number(coverage.with_primary_sources || 0)
  const missing = Array.isArray(coverage.missing_primary) ? coverage.missing_primary : []
  if (total === 0) return <Tag>无表单</Tag>
  if (missing.length === 0) return <Tag color="green">全部表单已配置溯源</Tag>

  const tooltipContent = (
    <div style={{ maxWidth: 320 }}>
      <div style={{ marginBottom: 4 }}>缺少 x-sources.primary 的表单：</div>
      {missing.slice(0, 30).map((form) => (
        <div key={form.form_key} style={{ fontSize: 12 }}>
          · {form.form_title || form.form_key}（{form.form_key}）
        </div>
      ))}
      {missing.length > 30 ? <div style={{ fontSize: 12, opacity: 0.7 }}>……还有 {missing.length - 30} 项</div> : null}
      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
        未配置 primary 的表单不会被任何文档自动匹配，字段会一直空着。
      </div>
    </div>
  )

  return (
    <Tooltip title={tooltipContent}>
      <Tag color="orange">{matched} / {total} · 缺 {missing.length}</Tag>
    </Tooltip>
  )
}

export const TemplatesTab = () => {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [visibilityUpdating, setVisibilityUpdating] = useState({})

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getAdminTemplates()
      const list = res?.data?.templates || res?.data || []
      setData(Array.isArray(list) ? list.flatMap((item) => (Array.isArray(item) ? item : [item])) : [])
    } catch {
      /* handled */
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const handleVisibilityChange = async (record, nextVisibleToAll) => {
    const templateId = record.id
    if (!templateId) {
      message.error('缺少模板 ID，无法修改能见度')
      return
    }

    setVisibilityUpdating((prev) => ({ ...prev, [templateId]: true }))
    try {
      const res = await updateAdminTemplateVisibility(templateId, nextVisibleToAll)
      const updated = res?.data || {}
      setData((prev) => prev.map((item) => (
        item.id === templateId ? { ...item, ...updated, is_system: Boolean(updated.is_system) } : item
      )))
      message.success(nextVisibleToAll ? '已设为所有账号可见' : '已设为仅创建者/管理员可见')
    } catch (error) {
      message.error(error?.message || '修改模板能见度失败')
    } finally {
      setVisibilityUpdating((prev) => ({ ...prev, [templateId]: false }))
    }
  }

  const columns = [
    { title: '模板名称', dataIndex: 'template_name', key: 'template_name', width: 200, ellipsis: true, render: (value) => <Text strong>{value || '-'}</Text> },
    { title: '模板代码', dataIndex: 'template_code', key: 'template_code', width: 160, ellipsis: true, render: (value) => <Text code style={{ fontSize: 12 }}>{value || '-'}</Text> },
    { title: '分类', dataIndex: 'category', key: 'category', width: 100, render: (value) => (value ? <Tag>{value}</Tag> : '-') },
    {
      title: '能见度',
      dataIndex: 'is_system',
      key: 'is_system',
      width: 170,
      render: (value, row) => {
        const isFileTemplate = row.source === 'file'
        const visibleToAll = Boolean(value || isFileTemplate)
        return (
          <Space size={8}>
            <Switch
              size="small"
              checked={visibleToAll}
              disabled={isFileTemplate || !row.id}
              loading={Boolean(visibilityUpdating[row.id])}
              onChange={(checked) => handleVisibilityChange(row, checked)}
            />
            {visibleToAll ? <Tag color="purple">所有账号可见</Tag> : <Tag color="blue">仅自己</Tag>}
          </Space>
        )
      },
    },
    { title: '发布', dataIndex: 'is_published', key: 'is_published', width: 80, render: (value) => (value ? <Badge status="success" text="已发布" /> : <Badge status="warning" text="草稿" />) },
    { title: '字段数', dataIndex: 'field_count', key: 'field_count', width: 80, render: (value) => value ?? '-' },
    { title: '溯源覆盖', dataIndex: 'form_coverage', key: 'form_coverage', width: 220, render: (coverage) => <CoverageTag coverage={coverage} /> },
    { title: '版本', dataIndex: 'version', key: 'version', width: 60, render: (value) => value ?? '-' },
    { title: '来源', dataIndex: 'source', key: 'source', width: 80, render: (value) => (value === 'file' ? <Tag>文件</Tag> : <Tag color="cyan">数据库</Tag>) },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 170, render: formatTime },
  ]

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={fetch} loading={loading}>刷新</Button>
        <Text type="secondary" style={{ lineHeight: '32px' }}>共 {data.length} 个模板</Text>
      </div>
      <Table
        columns={columns}
        dataSource={data}
        rowKey={(row) => row.id || row.template_code || Math.random()}
        loading={loading}
        scroll={{ x: 1100 }}
        size="small"
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
      />
    </>
  )
}
